import { logger } from '../../../utils/logger';
import { NOOP_TRACE, type TraceContext } from '../AiTraceRecorder';
import { ResponsesClient } from '../llm/ResponsesClient';
import {
  createPageFetcher,
  FetchPageError,
  type PageFetcher,
} from '../web/fetchPage';
import { SearxngClient, type SearchHit } from '../web/SearxngClient';
import type { ResearchSource, ResearchStats } from './ResearchJobStore';
import {
  buildAnalysisInput,
  buildExtractionInput,
  buildPlanInput,
  buildReflectionInput,
  buildSynthesisInput,
  buildTriageInput,
  reflectionSchema,
  RESEARCH_ANALYSIS_PROMPT,
  RESEARCH_PLAN_PROMPT,
  RESEARCH_REFLECTION_PROMPT,
  RESEARCH_SYNTHESIS_PROMPT,
  RESEARCH_TRIAGE_PROMPT,
  researchAnalysisSchema,
  researchPlanSchema,
  SOURCE_EXTRACTION_PROMPT,
  sourceExtractionSchema,
  triageSchema,
  type NumberedExtraction,
  type ResearchAnalysis,
  type ResearchPlan,
} from './researchPrompts';
import { normalizeUrl, rankHits, type RankedHit } from './sourceRanking';

export const MAX_ROUNDS = Number(process.env.AI_RESEARCH_MAX_ROUNDS ?? 5);
export const MAX_SEARCHES = Number(process.env.AI_RESEARCH_MAX_SEARCHES ?? 30);
export const MAX_FETCHES = Number(process.env.AI_RESEARCH_MAX_FETCHES ?? 40);
export const RESEARCH_DEADLINE_MS = Number(
  process.env.AI_RESEARCH_DEADLINE_MS ?? 900_000,
);

/** How far a chain of follow-ups may get from the queries the plan wrote. */
export const MAX_FRONTIER_DEPTH = 3;
/**
 * The evidence bar the reflection step cannot talk its way out of. Left to
 * itself the auditor calls the material sufficient on the first round, which is
 * exactly the shallow report this pipeline exists to avoid.
 */
export const MIN_ROUNDS = 2;
export const MIN_RELEVANT_SOURCES = 12;
export const MIN_SOURCES_PER_FACET = 2;

const SEARCH_CONCURRENCY = 8;
const FETCH_CONCURRENCY = 8;
const QUERIES_PER_ROUND = 8;
const HITS_PER_QUERY = 12;
const TRIAGE_POOL = 40;
const SOURCES_PER_ROUND = 10;
const MAX_PER_DOMAIN = 3;
const SOURCE_CONTENT_CHARS = 20_000;
const SOURCE_FETCH_TIMEOUT_MS = 12_000;
/** Time held back so analysis and writing always happen, deadline or not. */
const SYNTHESIS_RESERVE_MS = 180_000;
// Ceilings, not budgets: reasoning tokens are billed against max_output_tokens,
// so a high-effort call can spend a tight cap entirely on thinking and return
// nothing. Generous caps cost nothing on calls that do not need them.
const PLAN_MAX_TOKENS = 12_000;
const TRIAGE_MAX_TOKENS = 6000;
const EXTRACTION_MAX_TOKENS = 12_000;
const REFLECTION_MAX_TOKENS = 8000;
const ANALYSIS_MAX_TOKENS = 16_000;
const SYNTHESIS_MAX_TOKENS = 20_000;

const PLAN_EFFORT = 'high';
const TRIAGE_EFFORT = 'low';
const EXTRACTION_EFFORT = 'high';
const REFLECTION_EFFORT = 'medium';
const ANALYSIS_EFFORT = 'high';
const SYNTHESIS_EFFORT = 'high';

export type ProgressReporter = (stage: string, message: string) => void;

export interface DeepResearchRequest {
  query: string;
  trace?: TraceContext;
  onProgress?: ProgressReporter;
}

export interface DeepResearchResult {
  report: string;
  sources: ResearchSource[];
  stats: ResearchStats;
}

type QueryOrigin = 'plan' | 'source' | 'reflection';

interface FrontierEntry {
  query: string;
  depth: number;
  origin: QueryOrigin;
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/** Loose enough that a reworded repeat of a query still counts as the same one. */
function queryKey(query: string): string {
  const key = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A query written entirely outside the latin alphabet loses everything to the
  // stripping above, so fall back to comparing it as it came.
  return key || query.toLowerCase().trim();
}

/**
 * The queue of things still worth searching. Sources and the reflection step
 * both feed it, which is what turns a fixed plan into a search that follows
 * whatever the pages actually reveal.
 */
class Frontier {
  private pending: FrontierEntry[] = [];
  private seen = new Set<string>();

  get size(): number {
    return this.pending.length;
  }

  push(queries: string[], depth: number, origin: QueryOrigin): FrontierEntry[] {
    if (depth > MAX_FRONTIER_DEPTH) return [];
    const added: FrontierEntry[] = [];
    for (const query of queries) {
      const key = queryKey(query);
      // Never search the same ground twice, whoever proposed it.
      if (!key || this.seen.has(key)) continue;
      this.seen.add(key);
      const entry = { query, depth, origin };
      this.pending.push(entry);
      added.push(entry);
    }
    return added;
  }

  /** Shallowest first, so the plan is exhausted before chasing side threads. */
  take(limit: number): FrontierEntry[] {
    this.pending.sort((a, b) => a.depth - b.depth);
    return this.pending.splice(0, limit);
  }
}

/**
 * Deep research as a frontier search with a reflection loop: plan many angles,
 * search them in parallel, triage the results, read the ones worth reading,
 * compress each page down to the claims and the loose threads it opens, follow
 * those threads recursively, and only once the material clears an evidence bar
 * cross-analyse everything and write the report.
 *
 * The per-source compression step is what makes this work at all — feeding
 * dozens of pages of markdown straight into a synthesis call would blow the
 * context window and bury the findings.
 */
export class DeepResearchService {
  constructor(
    private responsesClient: ResponsesClient = new ResponsesClient(),
    private searxng: SearxngClient = new SearxngClient(),
    private fetchPage: PageFetcher = createPageFetcher(),
    private now: () => number = Date.now,
  ) {}

  async run(request: DeepResearchRequest): Promise<DeepResearchResult> {
    const trace = request.trace ?? NOOP_TRACE;
    const report = request.onProgress ?? (() => undefined);
    const startedAt = this.now();
    // The loop hands back the reserve so the report is never the step that gets
    // cut; a research pass with no write-up is worth nothing.
    const loopDeadlineAt =
      startedAt + RESEARCH_DEADLINE_MS - SYNTHESIS_RESERVE_MS;

    const plan = await this.plan(request.query, trace);
    report(
      'plan',
      `Plano traçado: ${plan.facets.length} faceta(s), ${plan.subQueries.length} frentes de busca.\n${plan.subQueries
        .map((sub) => `- [${sub.angle}] ${sub.query}`)
        .join('\n')}`,
    );

    const frontier = new Frontier();
    frontier.push(
      plan.subQueries.map((sub) => sub.query),
      0,
      'plan',
    );

    const extractions: NumberedExtraction[] = [];
    const visited = new Set<string>();
    let round = 0;
    let searchesUsed = 0;
    let fetchesUsed = 0;
    let maxDepth = 0;
    let truncatedByBudget = false;

    while (round < MAX_ROUNDS && frontier.size > 0) {
      if (this.now() >= loopDeadlineAt) {
        truncatedByBudget = true;
        report(
          'budget',
          'Tempo da pesquisa esgotado; vou escrever com o que já tenho.',
        );
        break;
      }

      const allowedSearches = Math.min(
        QUERIES_PER_ROUND,
        frontier.size,
        MAX_SEARCHES - searchesUsed,
      );
      if (allowedSearches <= 0) {
        truncatedByBudget = true;
        report(
          'budget',
          'Orçamento de buscas esgotado; partindo para o relatório.',
        );
        break;
      }

      const remainingFetches = MAX_FETCHES - fetchesUsed;
      if (remainingFetches <= 0) {
        truncatedByBudget = true;
        report(
          'budget',
          'Orçamento de páginas esgotado; partindo para o relatório.',
        );
        break;
      }

      // Counted only once the round is actually going to do work, so a round
      // aborted by a budget guard is not reported as one that happened.
      round++;
      const entries = frontier.take(allowedSearches);
      const roundDepth = entries[0]!.depth;
      maxDepth = Math.max(maxDepth, ...entries.map((entry) => entry.depth));
      report(
        'search',
        `Rodada ${round} (profundidade ${roundDepth}): buscando ${entries.length} consulta(s).\n${entries
          .map((entry) => `- ${entry.query}`)
          .join('\n')}`,
      );
      const hitsByQuery = await this.search(
        entries.map((entry) => entry.query),
        trace,
      );
      searchesUsed += entries.length;

      const candidates = rankHits(hitsByQuery, {
        maxPerDomain: MAX_PER_DOMAIN,
        limit: TRIAGE_POOL + visited.size,
      })
        .filter((hit) => !visited.has(normalizeUrl(hit.url)))
        .slice(0, TRIAGE_POOL);

      const selected = candidates.length
        ? await this.triage(
            plan,
            this.facetCoverage(plan, extractions),
            candidates,
            Math.min(SOURCES_PER_ROUND, remainingFetches),
            round,
            trace,
          )
        : [];
      report(
        'triage',
        `${selected.length} de ${candidates.length} resultado(s) valem leitura.`,
      );

      if (selected.length > 0) {
        for (const hit of selected) visited.add(normalizeUrl(hit.url));
        report(
          'read',
          `Lendo ${selected.length} página(s):\n${selected
            .map((hit) => `- ${hit.title}`)
            .join('\n')}`,
        );

        const round_ = round;
        const newExtractions = await mapWithConcurrency(
          selected,
          FETCH_CONCURRENCY,
          (hit) => this.readAndExtract(plan, hit, trace, round_),
        );
        fetchesUsed += selected.length;

        const followUps: string[] = [];
        for (const extraction of newExtractions) {
          if (!extraction) continue;
          extractions.push({ ...extraction, index: extractions.length + 1 });
          if (extraction.extraction.relevant) {
            followUps.push(...extraction.extraction.followUpQueries);
          }
        }

        const relevant = extractions.filter(
          (entry) => entry.extraction.relevant,
        ).length;
        report(
          'extract',
          `${relevant} de ${extractions.length} fonte(s) úteis até aqui.`,
        );

        const added = frontier.push(followUps, roundDepth + 1, 'source');
        if (added.length > 0) {
          report(
            'follow',
            `As fontes abriram ${added.length} pista(s) nova(s):\n${added
              .map((entry) => `- ${entry.query}`)
              .join('\n')}`,
          );
        }
      }

      if (round >= MAX_ROUNDS) break;
      // Nothing read yet means there is nothing to audit; the frontier still
      // has queries, so keep searching instead of burning a reflection call.
      if (extractions.length === 0) continue;

      const reflection = await this.reflect(
        plan,
        this.facetCoverage(plan, extractions),
        extractions,
        round,
        trace,
      );
      frontier.push(reflection.followUpQueries, roundDepth + 1, 'reflection');

      if (reflection.sufficient && this.floorMet(plan, extractions, round)) {
        report('reflect', 'Material suficiente. Escrevendo o relatório.');
        break;
      }
      if (reflection.gaps.length > 0) {
        report(
          'reflect',
          `Lacunas encontradas:\n${reflection.gaps.map((gap) => `- ${gap}`).join('\n')}`,
        );
      }
    }

    // Hitting the round cap with queries still queued is a budget cut like any
    // other, and the report has to admit it.
    if (round >= MAX_ROUNDS && frontier.size > 0) truncatedByBudget = true;

    const usable = extractions.filter((entry) => entry.extraction.relevant);
    // Renumber so the citations the model is given are contiguous; a gap in the
    // list is an invitation to cite a number that has no source behind it.
    const numbered = usable.map((extraction, index) => ({
      ...extraction,
      index: index + 1,
    }));

    let analysis: ResearchAnalysis | undefined;
    if (numbered.length > 0) {
      report('analyze', `Cruzando o que ${numbered.length} fonte(s) disseram.`);
      analysis = await this.analyze(plan, numbered, trace);
    }

    report(
      'synthesize',
      `Sintetizando o relatório com ${numbered.length} fonte(s).`,
    );
    const reportText = await this.synthesize(
      plan,
      request.query,
      numbered,
      analysis,
      truncatedByBudget,
      trace,
    );

    return {
      report: reportText,
      sources: numbered.map((entry) => ({
        index: entry.index,
        url: entry.url,
        title: entry.title,
        ...(entry.extraction.publishedDate
          ? { publishedDate: entry.extraction.publishedDate }
          : {}),
      })),
      stats: {
        rounds: round,
        searches: searchesUsed,
        fetched: fetchesUsed,
        relevantSources: numbered.length,
        maxDepth,
        durationMs: this.now() - startedAt,
        ...(truncatedByBudget ? { truncatedByBudget: true } : {}),
      },
    };
  }

  /** Relevant sources backing each facet of the plan. */
  private facetCoverage(
    plan: ResearchPlan,
    extractions: NumberedExtraction[],
  ): Map<string, number> {
    const coverage = new Map<string, number>(
      plan.facets.map((facet) => [facet.id, 0]),
    );
    for (const entry of extractions) {
      if (!entry.extraction.relevant) continue;
      for (const facetId of entry.extraction.facetIds) {
        if (!coverage.has(facetId)) continue;
        coverage.set(facetId, coverage.get(facetId)! + 1);
      }
    }
    return coverage;
  }

  /**
   * The bar below which "material suficiente" is not the auditor's call to
   * make: too few rounds, too few sources, or a facet nobody covered.
   */
  private floorMet(
    plan: ResearchPlan,
    extractions: NumberedExtraction[],
    round: number,
  ): boolean {
    if (round < MIN_ROUNDS) return false;
    const relevant = extractions.filter((entry) => entry.extraction.relevant);
    if (relevant.length < MIN_RELEVANT_SOURCES) return false;
    const coverage = this.facetCoverage(plan, relevant);
    return plan.facets.every(
      (facet) => (coverage.get(facet.id) ?? 0) >= MIN_SOURCES_PER_FACET,
    );
  }

  private async plan(
    query: string,
    trace: TraceContext,
  ): Promise<ResearchPlan> {
    return this.responsesClient.structured({
      instructions: RESEARCH_PLAN_PROMPT,
      input: [{ role: 'user', content: buildPlanInput(query) }],
      schema: researchPlanSchema,
      schemaName: 'research_plan',
      maxOutputTokens: PLAN_MAX_TOKENS,
      reasoningEffort: PLAN_EFFORT,
      trace,
      phase: 'research_plan',
    });
  }

  private async search(
    queries: string[],
    trace: TraceContext,
  ): Promise<SearchHit[][]> {
    return mapWithConcurrency(queries, SEARCH_CONCURRENCY, async (query) => {
      try {
        return await this.searxng.search(query, {
          limit: HITS_PER_QUERY,
          language: 'pt-BR',
        });
      } catch (error) {
        // One dead sub-query must not kill the round; the other angles still
        // produce a report.
        logger.warn('ai.research.search_failed', {
          traceId: trace.traceId,
          query,
          error: (error as Error).message,
        });
        return [];
      }
    });
  }

  /**
   * Picks which of the ranked candidates are worth the cost of being read.
   * Ranking alone only knows how many engines liked a page, which is how an
   * SEO-optimised aggregator outranks the primary source it copied from.
   */
  private async triage(
    plan: ResearchPlan,
    coverage: Map<string, number>,
    candidates: RankedHit[],
    limit: number,
    round: number,
    trace: TraceContext,
  ): Promise<RankedHit[]> {
    const byUrl = new Map(candidates.map((hit) => [hit.url, hit]));

    try {
      const { picks } = await this.responsesClient.structured({
        instructions: RESEARCH_TRIAGE_PROMPT,
        input: [
          {
            role: 'user',
            content: buildTriageInput(
              plan.objective,
              plan.facets,
              coverage,
              candidates.map((hit) => ({
                url: hit.url,
                title: hit.title,
                snippet: hit.snippet,
                queryAgreement: hit.queryAgreement,
              })),
            ),
          },
        ],
        schema: triageSchema,
        schemaName: 'research_triage',
        maxOutputTokens: TRIAGE_MAX_TOKENS,
        reasoningEffort: TRIAGE_EFFORT,
        trace,
        phase: `research_triage[round=${round}]`,
      });

      const selected: RankedHit[] = [];
      const taken = new Set<string>();
      for (const pick of [...picks].sort(
        (a, b) =>
          (a.priority === 'alta' ? 0 : 1) - (b.priority === 'alta' ? 0 : 1),
      )) {
        const hit = byUrl.get(pick.url);
        // A url the model invented is not a candidate we ever saw ranked.
        if (!hit || taken.has(pick.url)) continue;
        taken.add(pick.url);
        selected.push(hit);
        if (selected.length >= limit) break;
      }
      return selected;
    } catch (error) {
      // Losing the triage call costs precision, not the round: fall back to the
      // ranking, which is what the pipeline used before triage existed.
      logger.warn('ai.research.triage_failed', {
        traceId: trace.traceId,
        error: (error as Error).message,
      });
      return candidates.slice(0, limit);
    }
  }

  private async readAndExtract(
    plan: ResearchPlan,
    hit: SearchHit,
    trace: TraceContext,
    round: number,
  ): Promise<Omit<NumberedExtraction, 'index'> | null> {
    let content: string;
    let title = hit.title;
    try {
      const page = await this.fetchPage(hit.url, {
        mode: 'text',
        timeoutMs: SOURCE_FETCH_TIMEOUT_MS,
      });
      content = page.content.slice(0, SOURCE_CONTENT_CHARS);
      if (page.title) title = page.title;
      if (!content.trim()) return null;
    } catch (error) {
      if (!(error instanceof FetchPageError)) throw error;
      logger.info('ai.research.fetch_skipped', {
        traceId: trace.traceId,
        url: hit.url,
        reason: error.message,
      });
      return null;
    }

    try {
      const extraction = await this.responsesClient.structured({
        instructions: SOURCE_EXTRACTION_PROMPT,
        input: [
          {
            role: 'user',
            content: buildExtractionInput(plan.objective, plan.facets, {
              url: hit.url,
              title,
              content,
            }),
          },
        ],
        schema: sourceExtractionSchema,
        schemaName: 'source_extraction',
        maxOutputTokens: EXTRACTION_MAX_TOKENS,
        reasoningEffort: EXTRACTION_EFFORT,
        trace,
        phase: `research_extract[round=${round}]`,
      });
      return { url: hit.url, title, extraction };
    } catch (error) {
      logger.warn('ai.research.extract_failed', {
        traceId: trace.traceId,
        url: hit.url,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private async reflect(
    plan: ResearchPlan,
    coverage: Map<string, number>,
    extractions: NumberedExtraction[],
    round: number,
    trace: TraceContext,
  ) {
    try {
      return await this.responsesClient.structured({
        instructions: RESEARCH_REFLECTION_PROMPT,
        input: [
          {
            role: 'user',
            content: buildReflectionInput(
              plan.objective,
              plan.facets,
              coverage,
              extractions,
              round,
            ),
          },
        ],
        schema: reflectionSchema,
        schemaName: 'research_reflection',
        maxOutputTokens: REFLECTION_MAX_TOKENS,
        reasoningEffort: REFLECTION_EFFORT,
        trace,
        phase: `research_reflect[round=${round}]`,
      });
    } catch (error) {
      // If the auditor fails we stop researching rather than loop blindly:
      // writing the report from what we have beats spending more budget on
      // queries nobody vetted.
      logger.warn('ai.research.reflection_failed', {
        traceId: trace.traceId,
        error: (error as Error).message,
      });
      return { sufficient: true, gaps: [], followUpQueries: [] };
    }
  }

  /**
   * Cross-reads every source before a single line is written. Asking one call
   * to both reconcile the material and write the prose is what produces a
   * report shaped like a list of summaries.
   */
  private async analyze(
    plan: ResearchPlan,
    sources: NumberedExtraction[],
    trace: TraceContext,
  ): Promise<ResearchAnalysis | undefined> {
    try {
      return await this.responsesClient.structured({
        instructions: RESEARCH_ANALYSIS_PROMPT,
        input: [
          {
            role: 'user',
            content: buildAnalysisInput(plan.objective, plan.facets, sources),
          },
        ],
        schema: researchAnalysisSchema,
        schemaName: 'research_analysis',
        maxOutputTokens: ANALYSIS_MAX_TOKENS,
        reasoningEffort: ANALYSIS_EFFORT,
        trace,
        phase: 'research_analyze',
      });
    } catch (error) {
      // The report is still writable straight from the extractions, just with
      // less structure — better than losing a job that took ten minutes.
      logger.warn('ai.research.analysis_failed', {
        traceId: trace.traceId,
        error: (error as Error).message,
      });
      return undefined;
    }
  }

  private async synthesize(
    plan: ResearchPlan,
    originalQuery: string,
    sources: NumberedExtraction[],
    analysis: ResearchAnalysis | undefined,
    truncatedByBudget: boolean,
    trace: TraceContext,
  ): Promise<string> {
    if (sources.length === 0) {
      return `## Resumo\n\nNão achei fonte utilizável para "${originalQuery}". As buscas não devolveram página que respondesse ao objetivo, ou as que devolveram não abriram.\n\n## Divergências e limites\n\nSem fonte não tem relatório. Tenta reformular o tema com termos mais específicos.`;
    }

    const budgetNote = truncatedByBudget
      ? 'A pesquisa parou por limite de tempo ou de orçamento antes de esgotar o tema. Diga isso explicitamente na seção de limites.'
      : undefined;

    const response = await this.responsesClient.create({
      instructions: RESEARCH_SYNTHESIS_PROMPT,
      input: [
        {
          role: 'user',
          content: buildSynthesisInput(
            plan.objective,
            originalQuery,
            sources,
            analysis,
            budgetNote,
          ),
        },
      ],
      maxOutputTokens: SYNTHESIS_MAX_TOKENS,
      reasoningEffort: SYNTHESIS_EFFORT,
      trace,
      phase: 'research_synthesize',
    });

    return response.text.trim();
  }
}
