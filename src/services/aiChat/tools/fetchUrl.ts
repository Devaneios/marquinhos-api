// The only tool that touches the network, and it deliberately runs in the API
// process instead of the sandbox: the container stays on NetworkMode "none", so
// arbitrary code the model writes can never reach out on its own.
//
// Accepted risk: hostnames are resolved and screened before the request, but the
// request itself goes out by hostname, leaving a DNS-rebinding window between the
// two. Closing it would mean connecting to the validated IP with a manual Host
// header; that is disproportionate here, and it is the same pragmatic tradeoff
// already accepted for mounting docker.sock.
import { lookup as dnsLookup } from 'node:dns/promises';
import type { AgentTool } from './types';

export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_TEXT_CHARS = 3000;
export const MAX_LINKS = 150;
const FETCH_TIMEOUT_MS = 8000;
const MAX_LABEL_CHARS = 80;
const USER_AGENT = 'MarquinhosBOT/1.0 (Discord bot; agent tool)';
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/json',
  'application/xhtml+xml',
];

interface LookupResult {
  address: string;
  family: number;
}

export type LookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<LookupResult[]>;

export type FetchFn = (
  input: URL | string,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchUrlDeps {
  fetchFn: FetchFn;
  lookupFn: LookupFn;
}

class FetchUrlError extends Error {}

function fail(message: string): never {
  throw new FetchUrlError(message);
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(address: string): boolean {
  const addr = address.toLowerCase().split('%')[0] ?? '';
  if (addr === '::' || addr === '::1') return true;
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isBlockedIpv4(mapped[1] ?? '');
  const head = addr.split(':')[0];
  if (!head) return true;
  const group = Number.parseInt(head, 16);
  if (Number.isNaN(group)) return true;
  if ((group & 0xfe00) === 0xfc00) return true;
  if ((group & 0xffc0) === 0xfe80) return true;
  if ((group & 0xff00) === 0xff00) return true;
  return false;
}

function isBlockedAddress({ address, family }: LookupResult): boolean {
  return family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
}

export async function assertUrlIsSafe(
  rawUrl: string,
  lookupFn: LookupFn,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`URL inválida: "${rawUrl}".`);
  }

  if (url.protocol !== 'https:') {
    fail(
      `Só consigo buscar URLs https. "${url.protocol}" não é permitido (recebi "${rawUrl}").`,
    );
  }

  let addresses: LookupResult[];
  try {
    addresses = await lookupFn(url.hostname, { all: true });
  } catch (error) {
    fail(
      `Não consegui resolver o host "${url.hostname}": ${(error as Error).message}.`,
    );
  }

  if (addresses.length === 0) {
    fail(`Não consegui resolver o host "${url.hostname}".`);
  }

  const blocked = addresses.find(isBlockedAddress);
  if (blocked) {
    fail(
      `Recusei "${url.hostname}": aponta para um endereço interno (${blocked.address}). Só busco hosts públicos.`,
    );
  }

  return url;
}

async function readCappedText(
  response: Response,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: '', truncated: false };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const remaining = MAX_BODY_BYTES - total;
    if (value.byteLength >= remaining) {
      text += decoder.decode(value.slice(0, remaining));
      await reader.cancel().catch(() => undefined);
      return { text, truncated: true };
    }

    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }

  return { text, truncated: false };
}

// HTML attributes and text both arrive entity-encoded, so an href like
// "?a=1&amp;b=2" has to be decoded before it is a usable URL. &amp; goes last so
// that "&amp;lt;" decodes to "&lt;" instead of "<".
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(html: string): string {
  return stripTags(
    html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '),
  );
}

function extractLinks(html: string, base: URL): string[] {
  const found = new Map<string, string>();
  const self = new URL(base.toString());
  self.hash = '';
  const selfKey = self.toString();
  const anchors = html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  );

  for (const [, href, inner] of anchors) {
    if (!href) continue;
    let target: URL;
    try {
      target = new URL(decodeEntities(href), base);
    } catch {
      continue;
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') continue;
    if (target.hostname !== base.hostname) continue;

    target.hash = '';
    const key = target.toString();
    // In-page anchors collapse to the page itself once the fragment is gone;
    // offering the current page as a hop only invites the model to loop.
    if (key === selfKey || found.has(key)) continue;

    found.set(key, stripTags(inner ?? '').slice(0, MAX_LABEL_CHARS));
    if (found.size >= MAX_LINKS) break;
  }

  return [...found].map(([url, label]) => (label ? `${label} → ${url}` : url));
}

function capText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n[conteúdo truncado]`;
}

export function createFetchUrlTool(deps?: Partial<FetchUrlDeps>): AgentTool {
  const fetchFn = deps?.fetchFn ?? fetch;
  const lookupFn = deps?.lookupFn ?? (dnsLookup as unknown as LookupFn);

  return {
    name: 'fetch_url',
    description:
      'Busca o conteúdo de uma URL pública (só https) e devolve o texto da página ou a lista de links dela. É o único jeito de acessar a internet: o sandbox de execução de código não tem rede. Use mode "links" para navegar entre páginas seguindo links, e mode "text" para ler o conteúdo.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL https completa, ex: https://pt.wikipedia.org/wiki/Recife',
        },
        mode: {
          type: 'string',
          enum: ['text', 'links'],
          description:
            '"text" devolve o texto da página (padrão); "links" devolve os links do mesmo domínio, ideal para seguir de página em página.',
        },
      },
      required: ['url'],
    },
    async execute(args) {
      const rawUrl = String(args.url ?? '');
      const mode = args.mode === 'links' ? 'links' : 'text';

      try {
        let current = await assertUrlIsSafe(rawUrl, lookupFn);

        for (let hop = 0; ; hop++) {
          const response = await fetchFn(current, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'omit',
            headers: {
              'user-agent': USER_AGENT,
              accept: 'text/html,text/plain',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });

          if (response.status >= 300 && response.status < 400) {
            if (hop >= MAX_REDIRECTS) {
              return `Desisti de "${rawUrl}": mais de ${MAX_REDIRECTS} redirects.`;
            }
            const location = response.headers.get('location');
            if (!location) {
              return `"${current.toString()}" respondeu ${response.status} (redirect) sem header location.`;
            }
            current = await assertUrlIsSafe(
              new URL(location, current).toString(),
              lookupFn,
            );
            continue;
          }

          if (!response.ok) {
            return `"${current.toString()}" respondeu ${response.status} ${response.statusText}.`;
          }

          const contentType = (
            response.headers.get('content-type') ?? ''
          ).toLowerCase();
          const allowed = ALLOWED_CONTENT_TYPES.some((type) =>
            contentType.includes(type),
          );
          if (!allowed) {
            return `Não sei ler "${contentType || 'conteúdo sem content-type'}" — só HTML, texto e JSON.`;
          }

          const { text, truncated } = await readCappedText(response);
          const isHtml =
            contentType.includes('html') || contentType.includes('xhtml');

          if (mode === 'links') {
            if (!isHtml) {
              return `"${current.toString()}" não é HTML (${contentType}), então não tem links para extrair.`;
            }
            const links = extractLinks(text, current);
            if (links.length === 0) {
              return `Não encontrei nenhum link utilizável em "${current.toString()}".`;
            }
            const header = `${links.length} links em ${current.toString()}:`;
            return [header, ...links].join('\n');
          }

          const body = isHtml ? htmlToText(text) : text.trim();
          const capped = capText(body);
          if (truncated && !capped.includes('truncado')) {
            return `${capped}\n\n[conteúdo truncado]`;
          }
          return capped || `"${current.toString()}" respondeu vazio.`;
        }
      } catch (error) {
        if (error instanceof FetchUrlError) return error.message;
        if ((error as Error).name === 'TimeoutError') {
          return `"${rawUrl}" demorou mais de ${FETCH_TIMEOUT_MS / 1000}s e eu desisti.`;
        }
        return `Não consegui buscar "${rawUrl}": ${(error as Error).message}`;
      }
    },
  };
}

export const fetchUrlTool = createFetchUrlTool();
