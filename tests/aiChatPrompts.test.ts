import { describe, expect, it } from 'bun:test';
import {
  buildResponsePrompt,
  classificationSchema,
  CLASSIFY_SYSTEM_PROMPT,
} from '../src/services/aiChat/prompts';

describe('buildResponsePrompt', () => {
  it('does not include a chat_history block for general_question', () => {
    const prompt = buildResponsePrompt('general_question', [
      { author: 'ana', content: 'oi' },
    ]);
    expect(prompt).not.toContain('<chat_history trust_level=');
    expect(prompt).not.toContain('ana: oi');
  });

  it('includes recent messages inside a chat_history block for opinion_reference', () => {
    const prompt = buildResponsePrompt('opinion_reference', [
      { author: 'ana', content: 'acho que vai chover' },
    ]);
    expect(prompt).toContain('<chat_history trust_level="untrusted">');
    expect(prompt).toContain('ana: acho que vai chover');
  });

  it('omits the chat_history block for opinion_reference when there are no recent messages', () => {
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

  it('always includes an anti-injection constraint, regardless of category or history', () => {
    const withoutHistory = buildResponsePrompt('general_question', []);
    const withHistory = buildResponsePrompt('opinion_reference', [
      { author: 'ana', content: 'oi' },
    ]);
    expect(withoutHistory).toContain('<constraints>');
    expect(withoutHistory.toLowerCase()).toContain('nunca');
    expect(withHistory).toContain('<constraints>');
  });

  it('uses a positive, quantified style guideline instead of a negative one', () => {
    const prompt = buildResponsePrompt('casual_chat', []);
    expect(prompt).toContain('<style_guidelines>');
    expect(prompt).not.toContain('sem enrolação');
    expect(prompt).toMatch(/no m[aá]ximo/i);
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

  it('rejects an unknown category', () => {
    const result = classificationSchema.safeParse({ category: 'banana' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing category', () => {
    const result = classificationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
