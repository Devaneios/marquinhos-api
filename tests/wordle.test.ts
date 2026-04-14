import { describe, expect, it } from 'bun:test';
import {
  computeFeedback,
  resolveCanonical,
  stripDiacritics,
} from '../src/services/wordle';

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

describe('stripDiacritics', () => {
  it('removes acute, tilde, circumflex and grave accents', () => {
    expect(stripDiacritics('bastião')).toBe('bastiao');
    expect(stripDiacritics('rádio')).toBe('radio');
    expect(stripDiacritics('você')).toBe('voce');
    expect(stripDiacritics('àrvore')).toBe('arvore');
  });

  it('strips cedilla from ç', () => {
    expect(stripDiacritics('caçarola')).toBe('cacarola');
    expect(stripDiacritics('açaí')).toBe('acai');
  });

  it('leaves words without diacritics unchanged', () => {
    expect(stripDiacritics('gatos')).toBe('gatos');
    expect(stripDiacritics('termo')).toBe('termo');
  });

  it('preserves string length', () => {
    for (const w of ['bastião', 'caçarola', 'rádio', 'coração', 'plátano']) {
      expect(stripDiacritics(w).length).toBe(w.length);
    }
  });
});

describe('resolveCanonical', () => {
  it('returns the literal form when the input is already in the validation set', () => {
    // "radio" exists literally in valid-guesses.txt
    expect(resolveCanonical('radio')).toBe('radio');
  });

  it('resolves an unaccented input to its accented canonical in the validation set', () => {
    // "bastião" exists in valid-guesses.txt; "bastiao" does not
    expect(resolveCanonical('bastiao')).toBe('bastião');
  });

  it('resolves cedilla via normalized lookup', () => {
    // "caçarola" exists in valid-guesses.txt
    expect(resolveCanonical('cacarola')).toBe('caçarola');
  });

  it('returns null for words absent from the validation set under any form', () => {
    expect(resolveCanonical('xyzabcxyz')).toBeNull();
  });

  it('accepts an accented input that matches an entry verbatim', () => {
    expect(resolveCanonical('bastião')).toBe('bastião');
  });
});
