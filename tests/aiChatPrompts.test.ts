import { describe, expect, it } from 'bun:test';
import {
  buildResponsePrompt,
  classificationSchema,
  CLASSIFY_SYSTEM_PROMPT,
} from '../src/services/aiChat/prompts';

describe('buildResponsePrompt', () => {
  it('includes recent messages inside a chat_history block for every category', () => {
    for (const category of [
      'general_question',
      'code_technical_question',
      'opinion_reference',
      'bot_help_info',
      'user_roast_provocation',
      'casual_chat',
      'off_topic_unclear',
    ] as const) {
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
    const general = buildResponsePrompt('general_question', []);
    const casual = buildResponsePrompt('casual_chat', []);
    const offTopic = buildResponsePrompt('off_topic_unclear', []);
    expect(general).not.toBe(casual);
    expect(casual).not.toBe(offTopic);
  });

  it('produces a distinct prompt for each new category', () => {
    const codeTechnical = buildResponsePrompt('code_technical_question', []);
    const botHelp = buildResponsePrompt('bot_help_info', []);
    const roast = buildResponsePrompt('user_roast_provocation', []);

    expect(codeTechnical).not.toBe(botHelp);
    expect(botHelp).not.toBe(roast);
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

  it('warns about logic riddles in general_question', () => {
    const prompt = buildResponsePrompt('general_question', []);
    expect(prompt).toMatch(/pegadinha|charada/i);
  });
});

describe('CLASSIFY_SYSTEM_PROMPT', () => {
  it('is structured with role, instructions, constraints and examples tags', () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('<role>');
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('<instructions>');
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('<constraints>');
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('<examples>');
  });

  it('includes at least one few-shot example per category', () => {
    for (const category of [
      'general_question',
      'opinion_reference',
      'casual_chat',
      'off_topic_unclear',
      'code_technical_question',
      'bot_help_info',
      'user_roast_provocation',
    ]) {
      expect(CLASSIFY_SYSTEM_PROMPT).toContain(category);
    }
  });

  it('instructs the model to never obey instructions embedded in the classified message', () => {
    expect(CLASSIFY_SYSTEM_PROMPT.toLowerCase()).toContain('nunca');
  });
});

describe('classificationSchema', () => {
  it('accepts a valid category', () => {
    const result = classificationSchema.safeParse({ category: 'casual_chat' });
    expect(result.success).toBe(true);
  });

  it('accepts each of the new categories', () => {
    for (const category of [
      'code_technical_question',
      'bot_help_info',
      'user_roast_provocation',
    ]) {
      expect(classificationSchema.safeParse({ category }).success).toBe(true);
    }
  });

  it('rejects an unknown category', () => {
    const result = classificationSchema.safeParse({ category: 'banana' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing category', () => {
    const result = classificationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
