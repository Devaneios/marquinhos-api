import { describe, expect, it } from 'bun:test';
import { buildResponsePrompt } from '../src/services/aiChat/prompts';

describe('buildResponsePrompt', () => {
  it('does not include recent messages for general_question', () => {
    const prompt = buildResponsePrompt('general_question', [
      { author: 'ana', content: 'oi' },
    ]);
    expect(prompt).not.toContain('ana: oi');
  });

  it('includes recent messages for opinion_reference', () => {
    const prompt = buildResponsePrompt('opinion_reference', [
      { author: 'ana', content: 'acho que vai chover' },
    ]);
    expect(prompt).toContain('ana: acho que vai chover');
  });

  it('omits the context block for opinion_reference when there are no recent messages', () => {
    const prompt = buildResponsePrompt('opinion_reference', []);
    expect(prompt).not.toContain('Mensagens recentes');
  });

  it('produces a distinct prompt per category', () => {
    const general = buildResponsePrompt('general_question', []);
    const casual = buildResponsePrompt('casual_chat', []);
    const offTopic = buildResponsePrompt('off_topic_unclear', []);
    expect(general).not.toBe(casual);
    expect(casual).not.toBe(offTopic);
  });
});
