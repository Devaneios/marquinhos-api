import { describe, expect, it } from 'bun:test';
import { computeFeedback } from '../src/services/wordle';

describe('computeFeedback', () => {
  it('returns all correct when guess matches answer exactly', () => {
    expect(computeFeedback('gatos', 'gatos')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
  });

  it('returns present for a letter in the word but wrong position', () => {
    const result = computeFeedback('bac', 'abc');
    expect(result[0]).toBe('present');
    expect(result[1]).toBe('present');
    expect(result[2]).toBe('correct');
  });

  it('returns absent for a letter not in the answer', () => {
    const result = computeFeedback('bbb', 'aaa');
    expect(result).toEqual(['absent', 'absent', 'absent']);
  });

  it('marks first duplicate as present and second as absent when answer has only one', () => {
    // answer 'xba' has one 'a'; guess 'aax' has 'a' at index 0 and 1
    // first pass: no exact matches
    // second pass: index 0 'a' → found at wordChars[2], marked present, consumed
    //              index 1 'a' → not found (consumed), marked absent
    const result = computeFeedback('aax', 'xba');
    expect(result[0]).toBe('present');
    expect(result[1]).toBe('absent');
  });

  it('returns correct when duplicate letter appears in correct positions', () => {
    const result = computeFeedback('aab', 'aab');
    expect(result[0]).toBe('correct');
    expect(result[1]).toBe('correct');
    expect(result[2]).toBe('correct');
  });
});
