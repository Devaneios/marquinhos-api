import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const ICF_PATH = join(ROOT, 'icf');
const WORDLIST_PATH = join(ROOT, 'wordlist.txt');
const OUTPUT_PATH = join(ROOT, 'valid-guesses.txt');

const MIN_LEN = 5;
const MAX_LEN = 12;

function generatePlurals(word: string): string[] {
  if (word.endsWith('ês') || word.endsWith('és')) {
    return [`${word.slice(0, -2)  }eses`];
  }
  if (word.endsWith('ão')) {
    const stem = word.slice(0, -2);
    return [`${stem  }ões`, `${stem  }ãos`, `${stem  }ães`];
  }
  if (word.endsWith('al')) {
    return [`${word.slice(0, -2)  }ais`];
  }
  if (word.endsWith('el')) {
    return [`${word.slice(0, -2)  }éis`];
  }
  if (word.endsWith('ol')) {
    return [`${word.slice(0, -2)  }óis`];
  }
  if (word.endsWith('ul')) {
    return [`${word.slice(0, -2)  }uis`];
  }
  if (word.endsWith('il')) {
    const stem = word.slice(0, -2);
    return [`${stem  }is`, `${stem  }eis`];
  }
  if (word.endsWith('m')) {
    return [`${word.slice(0, -1)  }ns`];
  }
  if (word.endsWith('r') || word.endsWith('z')) {
    return [`${word  }es`];
  }
  if (word.endsWith('s') || word.endsWith('x')) {
    return [];
  }
  return [`${word  }s`];
}

const words = new Set<string>();

// Load and filter wordlist.txt
const wordlist = readFileSync(WORDLIST_PATH, 'utf-8')
  .split('\n')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => w.length >= MIN_LEN && w.length <= MAX_LEN);

for (const w of wordlist) {
  words.add(w);
  for (const plural of generatePlurals(w)) {
    if (plural.length >= MIN_LEN && plural.length <= MAX_LEN) {
      words.add(plural);
    }
  }
}

// Load and filter ICF (format: word,frequency_score)
const icf = readFileSync(ICF_PATH, 'utf-8')
  .split('\n')
  .map((line) => line.split(',')[0].trim().toLowerCase())
  .filter((w) => w.length >= MIN_LEN && w.length <= MAX_LEN);

for (const w of icf) {
  words.add(w);
  for (const plural of generatePlurals(w)) {
    if (plural.length >= MIN_LEN && plural.length <= MAX_LEN) {
      words.add(plural);
    }
  }
}

const sorted = Array.from(words).sort();
writeFileSync(OUTPUT_PATH, sorted.join('\n'), 'utf-8');

console.log(`valid-guesses.txt generated: ${sorted.length} words`);
