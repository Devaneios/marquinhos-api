import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const ICF_PATH = join(ROOT, 'icf');
const WORDLIST_PATH = join(ROOT, 'wordlist.txt');
const OUTPUT_PATH = join(ROOT, 'valid-guesses.txt');

const MIN_LEN = 5;
const MAX_LEN = 12;

const words = new Set<string>();

// Load and filter wordlist.txt
const wordlist = readFileSync(WORDLIST_PATH, 'utf-8')
  .split('\n')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => w.length >= MIN_LEN && w.length <= MAX_LEN);

for (const w of wordlist) words.add(w);

// Load and filter ICF (format: word,frequency_score)
const icf = readFileSync(ICF_PATH, 'utf-8')
  .split('\n')
  .map((line) => line.split(',')[0].trim().toLowerCase())
  .filter((w) => w.length >= MIN_LEN && w.length <= MAX_LEN);

for (const w of icf) words.add(w);

const sorted = Array.from(words).sort();
writeFileSync(OUTPUT_PATH, sorted.join('\n'), 'utf-8');

console.log(`valid-guesses.txt generated: ${sorted.length} words`);
