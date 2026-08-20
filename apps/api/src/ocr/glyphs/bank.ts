// Runtime loader for the reference bank generate-bank.ts writes to
// bank.generated.json. Loaded once, cached — the file is a few MB of
// numbers and every request would otherwise re-parse it from disk.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReferenceGlyph } from './generate-bank.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK_PATH = path.join(__dirname, 'bank.generated.json');

export interface LoadedGlyph {
  digit: string;
  family: string;
  weight: number;
  features: Float32Array;
}

let cached: LoadedGlyph[] | null = null;

/** Reads and parses bank.generated.json on first call, caches after. Throws
 * with a clear message if the bank hasn't been generated yet — it's a
 * gitignored build artifact, not something a fresh checkout has. */
export function loadReferenceBank(): LoadedGlyph[] {
  if (cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(BANK_PATH, 'utf-8');
  } catch {
    throw new Error(
      `OCR reference bank not found at ${BANK_PATH}. Run \`pnpm --filter @sudoku/api generate:ocr-bank\` first.`,
    );
  }
  const parsed = JSON.parse(raw) as { glyphs: ReferenceGlyph[] };
  cached = parsed.glyphs.map((g) => ({
    digit: g.digit,
    family: g.family,
    weight: g.weight,
    features: new Float32Array(g.features),
  }));
  return cached;
}
