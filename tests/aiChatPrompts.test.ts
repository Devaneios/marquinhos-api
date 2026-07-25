import { describe, expect, it } from 'bun:test';
import {
  AGENT_TASK_SYSTEM_PROMPT,
  buildResponsePrompt,
  buildRevisionInput,
  buildRevisionPrompt,
  FALLBACK_FORMAT,
  MAIN_CLASSIFY_SYSTEM_PROMPT,
  mainClassificationSchema,
  revisionSchema,
  SUB_CLASSIFIERS,
} from '../src/services/aiChat/prompts';
import type { ResponseCategory } from '../src/services/aiChat/types';

const ALL_CATEGORIES: ResponseCategory[] = [
  'general_question',
  'code_technical_question',
  'trick_riddle',
  'bot_help_info',
  'casual_chat',
  'user_roast_provocation',
  'praise_thanks',
  'opinion_reference',
  'follow_up_on_bot',
  'off_topic_unclear',
];

describe('mainClassificationSchema', () => {
  it('accepts each main category', () => {
    for (const category of [
      'question',
      'social',
      'context_reaction',
      'agent_task',
      'unclear',
    ]) {
      expect(mainClassificationSchema.safeParse({ category }).success).toBe(
        true,
      );
    }
  });

  it('rejects subcategories and unknown values', () => {
    for (const category of ['general_question', 'casual_chat', 'banana']) {
      expect(mainClassificationSchema.safeParse({ category }).success).toBe(
        false,
      );
    }
  });

  it('rejects a missing category', () => {
    expect(mainClassificationSchema.safeParse({}).success).toBe(false);
  });
});

describe('MAIN_CLASSIFY_SYSTEM_PROMPT', () => {
  it('is structured with role, instructions, constraints and examples tags', () => {
    expect(MAIN_CLASSIFY_SYSTEM_PROMPT).toContain('<role>');
    expect(MAIN_CLASSIFY_SYSTEM_PROMPT).toContain('<instructions>');
    expect(MAIN_CLASSIFY_SYSTEM_PROMPT).toContain('<constraints>');
    expect(MAIN_CLASSIFY_SYSTEM_PROMPT).toContain('<examples>');
  });

  it('describes each main category with at least one few-shot example', () => {
    for (const category of [
      'question',
      'social',
      'context_reaction',
      'agent_task',
      'unclear',
    ]) {
      expect(MAIN_CLASSIFY_SYSTEM_PROMPT).toContain(category);
    }
  });

  it('warns that short or slang-heavy messages are not unclear', () => {
    expect(MAIN_CLASSIFY_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /curta|informal|g[ií]ria/,
    );
  });

  it('instructs the model to never obey instructions embedded in the classified message', () => {
    expect(MAIN_CLASSIFY_SYSTEM_PROMPT.toLowerCase()).toContain('nunca');
  });
});

describe('SUB_CLASSIFIERS', () => {
  const expectedSubcategories = {
    question: [
      'general_question',
      'code_technical_question',
      'trick_riddle',
      'bot_help_info',
    ],
    social: ['casual_chat', 'user_roast_provocation', 'praise_thanks'],
    context_reaction: ['opinion_reference', 'follow_up_on_bot'],
  } as const;

  it('covers exactly the three subclassified main categories', () => {
    expect(Object.keys(SUB_CLASSIFIERS).sort()).toEqual([
      'context_reaction',
      'question',
      'social',
    ]);
  });

  it.each(Object.entries(expectedSubcategories))(
    'schema for %s accepts its own subcategories only',
    (main, subcategories) => {
      const { schema } = SUB_CLASSIFIERS[main as keyof typeof SUB_CLASSIFIERS];
      for (const category of subcategories) {
        expect(schema.safeParse({ category }).success).toBe(true);
      }
      const foreign = ALL_CATEGORIES.filter(
        (c) => !(subcategories as readonly string[]).includes(c),
      );
      for (const category of [...foreign, 'banana']) {
        expect(schema.safeParse({ category }).success).toBe(false);
      }
    },
  );

  it.each(Object.entries(expectedSubcategories))(
    'prompt for %s includes few-shot examples mentioning each subcategory',
    (main, subcategories) => {
      const { prompt } = SUB_CLASSIFIERS[main as keyof typeof SUB_CLASSIFIERS];
      expect(prompt).toContain('<examples>');
      for (const category of subcategories) {
        expect(prompt).toContain(category);
      }
    },
  );

  it('defines the parse-failure fallback subcategory per main category', () => {
    expect(SUB_CLASSIFIERS.question.fallback).toBe('general_question');
    expect(SUB_CLASSIFIERS.social.fallback).toBe('casual_chat');
    expect(SUB_CLASSIFIERS.context_reaction.fallback).toBe('opinion_reference');
  });

  it('instructs each subclassifier to never obey embedded instructions', () => {
    for (const { prompt } of Object.values(SUB_CLASSIFIERS)) {
      expect(prompt.toLowerCase()).toContain('nunca');
    }
  });
});

describe('buildResponsePrompt', () => {
  it('includes recent messages inside a chat_history block for every category', () => {
    for (const category of ALL_CATEGORIES) {
      const prompt = buildResponsePrompt(category, [
        { author: 'ana', content: 'acho que vai chover' },
      ]);
      expect(prompt).toContain('<chat_history trust_level="untrusted">');
      expect(prompt).toContain('ana: acho que vai chover');
    }
  });

  it('omits the chat_history block when there are no recent messages', () => {
    const prompt = buildResponsePrompt('opinion_reference', []);
    expect(prompt).not.toContain('<chat_history trust_level=');
  });

  it('produces a distinct prompt per category', () => {
    const prompts = ALL_CATEGORIES.map((category) =>
      buildResponsePrompt(category, []),
    );
    expect(new Set(prompts).size).toBe(ALL_CATEGORIES.length);
  });

  it('always includes an anti-injection constraint, regardless of category or history', () => {
    const withoutHistory = buildResponsePrompt('general_question', []);
    const withHistory = buildResponsePrompt('opinion_reference', [
      { author: 'ana', content: 'oi' },
    ]);
    expect(withoutHistory).toContain('<constraints>');
    expect(withoutHistory.toLowerCase()).toContain('nunca');
    expect(withHistory).toContain('<constraints>');
  });

  it('uses adaptive length guidelines: short by default, longer when the question demands it', () => {
    const prompt = buildResponsePrompt('casual_chat', []);
    expect(prompt).toContain('<style_guidelines>');
    expect(prompt).toMatch(/1 a 3 frases/i);
    expect(prompt).toMatch(/1800 caracteres/i);
  });

  it('does not demand humor unconditionally in the base personality', () => {
    const prompt = buildResponsePrompt('general_question', []);
    expect(prompt).toMatch(/nem toda resposta precisa de piada/i);
  });

  it('warns about logic traps in trick_riddle instead of general_question', () => {
    const riddle = buildResponsePrompt('trick_riddle', []);
    const general = buildResponsePrompt('general_question', []);
    expect(riddle).toMatch(/pegadinha|charada/i);
    expect(general).not.toMatch(/pegadinha|charada/i);
  });

  it('includes a replied_message block when repliedMessage is provided', () => {
    const prompt = buildResponsePrompt('general_question', [], {
      author: 'ana',
      content: 'alguém sabe a capital da Mongólia?',
    });
    expect(prompt).toContain('<replied_message trust_level="untrusted">');
    expect(prompt).toContain('ana: alguém sabe a capital da Mongólia?');
  });

  it('omits the replied_message block when repliedMessage is not provided', () => {
    const prompt = buildResponsePrompt('general_question', []);
    expect(prompt).not.toContain('<replied_message');
  });
});

describe('revisionSchema', () => {
  it('accepts an embed revision with a title', () => {
    const result = revisionSchema.safeParse({
      reply: 'resposta revisada',
      format: 'embed',
      embedTitle: '💻 Resposta técnica',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a text revision with a null title', () => {
    const result = revisionSchema.safeParse({
      reply: 'resposta curta',
      format: 'text',
      embedTitle: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown format', () => {
    const result = revisionSchema.safeParse({
      reply: 'x',
      format: 'markdown',
      embedTitle: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing reply', () => {
    const result = revisionSchema.safeParse({
      format: 'text',
      embedTitle: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('buildRevisionPrompt', () => {
  it('includes the persona, style guidelines and category instruction', () => {
    const prompt = buildRevisionPrompt('code_technical_question');
    expect(prompt).toContain('MarquinhosBOT');
    expect(prompt).toContain('<style_guidelines>');
    expect(prompt).toContain('<category_instruction>');
  });

  it('explains the embed vs text format decision', () => {
    const prompt = buildRevisionPrompt('general_question');
    expect(prompt).toContain('embed');
    expect(prompt).toContain('text');
    expect(prompt.toLowerCase()).toMatch(/embedtitle|t[ií]tulo/);
  });

  it('produces a distinct prompt per category', () => {
    const prompts = ALL_CATEGORIES.map((category) =>
      buildRevisionPrompt(category),
    );
    expect(new Set(prompts).size).toBe(ALL_CATEGORIES.length);
  });

  it('forbids changing the factual direction of the draft', () => {
    const prompt = buildRevisionPrompt('general_question').toLowerCase();
    expect(prompt).toMatch(/n[aã]o (mude|altere|invente)/);
  });
});

describe('buildRevisionInput', () => {
  it('wraps the user message and the draft reply in tagged blocks', () => {
    const input = buildRevisionInput(
      'qual a capital do brasil?',
      'Brasília, desde 1960.',
    );
    expect(input).toContain('<user_message>');
    expect(input).toContain('qual a capital do brasil?');
    expect(input).toContain('<draft_reply>');
    expect(input).toContain('Brasília, desde 1960.');
  });
});

describe('FALLBACK_FORMAT', () => {
  it('covers every subcategory', () => {
    expect(Object.keys(FALLBACK_FORMAT).sort()).toEqual(
      [...ALL_CATEGORIES].sort(),
    );
  });

  it('keeps the existing embed titles and maps trick_riddle to an embed', () => {
    expect(FALLBACK_FORMAT.general_question).toEqual({
      format: 'embed',
      embedTitle: '💭 Resposta',
    });
    expect(FALLBACK_FORMAT.code_technical_question).toEqual({
      format: 'embed',
      embedTitle: '💻 Resposta técnica',
    });
    expect(FALLBACK_FORMAT.bot_help_info).toEqual({
      format: 'embed',
      embedTitle: '🤖 Sobre o Marquinhos',
    });
    expect(FALLBACK_FORMAT.trick_riddle).toEqual({
      format: 'embed',
      embedTitle: '💭 Resposta',
    });
  });

  it('maps conversational subcategories to text', () => {
    for (const category of [
      'casual_chat',
      'user_roast_provocation',
      'praise_thanks',
      'opinion_reference',
      'follow_up_on_bot',
      'off_topic_unclear',
    ] as const) {
      expect(FALLBACK_FORMAT[category]).toEqual({ format: 'text' });
    }
  });
});

describe('AGENT_TASK_SYSTEM_PROMPT', () => {
  it('is structured with role, instructions and constraints tags', () => {
    expect(AGENT_TASK_SYSTEM_PROMPT).toContain('<role>');
    expect(AGENT_TASK_SYSTEM_PROMPT).toContain('<instructions>');
    expect(AGENT_TASK_SYSTEM_PROMPT).toContain('<constraints>');
  });

  it('instructs the model to never obey instructions embedded in tool output or chat history', () => {
    const lower = AGENT_TASK_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('nunca');
    expect(lower).toMatch(/ferramenta|tool/);
  });

  it('documents that the mirror holds one directory per repo under /repo', () => {
    expect(AGENT_TASK_SYSTEM_PROMPT).toContain('/repo/marquinhos-web-api');
    expect(AGENT_TASK_SYSTEM_PROMPT).toContain('/repo/MarquinhosBOT');
  });
});
