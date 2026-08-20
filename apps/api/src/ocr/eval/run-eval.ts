// Manual evaluation harness — NOT part of the automated vitest suite. Real
// accuracy numbers on a handful of real photos + generated fixtures aren't
// something that should pass/fail CI on their own; a human reads this
// output and decides. Run via:
//   pnpm --filter @sudoku/api eval:ocr
// This is the actual decision point for flipping OCR_CLASSIFIER's default
// (plan Milestone 5) — not a guess.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractGrid } from '../pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'real');

interface RealFixture {
  label: string;
  notes?: string;
  grid: string; // 81 chars, row-major, '.' = blank
  regressionCells?: string[]; // e.g. "r2c9" (1-indexed, matches the app's own labeling)
  imageBuffer: Buffer;
}

function loadRealFixtures(): RealFixture[] {
  const files = readdirSync(REAL_FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  return files.map((file) => {
    const meta = JSON.parse(
      readFileSync(path.join(REAL_FIXTURES_DIR, file), 'utf-8'),
    ) as Omit<RealFixture, 'imageBuffer'>;
    const pngPath = path.join(REAL_FIXTURES_DIR, file.replace(/\.json$/, '.png'));
    return { ...meta, imageBuffer: readFileSync(pngPath) };
  });
}

// Deliberately held out of the vendored bank — generic CSS families that
// resolve to Debian's DejaVu font set (verified during the M1 fontconfig
// investigation), structurally distinct from all 15 curated fonts. Tests
// generalization to an unseen font, not memorization of the bank's own
// renders.
const HELD_OUT_FAMILIES = ['serif', 'sans-serif', 'monospace'];

const SOLVED_GRID = [
  '534678912',
  '672195348',
  '198342567',
  '859761423',
  '426853791',
  '713924856',
  '961537284',
  '287419635',
  '345286179',
].join('');

const GRID_SIZE = 900;
const CELL = GRID_SIZE / 9;

async function renderSyntheticGrid(family: string): Promise<Buffer> {
  let lines = '';
  for (let i = 0; i <= 9; i++) {
    const w = i % 3 === 0 ? 4 : 1;
    lines += `<line x1="${i * CELL}" y1="0" x2="${i * CELL}" y2="${GRID_SIZE}" stroke="black" stroke-width="${w}"/>`;
    lines += `<line x1="0" y1="${i * CELL}" x2="${GRID_SIZE}" y2="${i * CELL}" stroke="black" stroke-width="${w}"/>`;
  }
  let glyphs = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const d = SOLVED_GRID[r * 9 + c];
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      glyphs += `<text x="${x}" y="${y}" font-family="'${family}'" font-size="${CELL * 0.6}" text-anchor="middle" dominant-baseline="central" fill="black">${d}</text>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID_SIZE}" height="${GRID_SIZE}"><rect width="100%" height="100%" fill="white"/>${lines}${glyphs}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

interface ScoreResult {
  ok: boolean;
  nonBlankMatches: number;
  nonBlankExpected: number;
  regressionCellResults?: {
    cell: string;
    expected: string;
    got: string;
    correct: boolean;
  }[];
}

function score(
  expectedGrid: string,
  result: Awaited<ReturnType<typeof extractGrid>>,
  regressionCells?: string[],
): ScoreResult {
  if (!result.ok) {
    return { ok: false, nonBlankMatches: 0, nonBlankExpected: 0 };
  }
  let nonBlankMatches = 0;
  let nonBlankExpected = 0;
  for (let i = 0; i < 81; i++) {
    const expected = expectedGrid[i];
    if (expected !== '.') {
      nonBlankExpected++;
      if (expected === result.grid[i]) nonBlankMatches++;
    }
  }
  const regressionCellResults = regressionCells?.map((cell) => {
    const match = /^r(\d)c(\d)$/.exec(cell)!;
    const row = Number(match[1]!) - 1;
    const col = Number(match[2]!) - 1;
    const idx = row * 9 + col;
    return {
      cell,
      expected: expectedGrid[idx]!,
      got: result.grid[idx]!,
      correct: expectedGrid[idx] === result.grid[idx],
    };
  });
  return {
    ok: true,
    nonBlankMatches,
    nonBlankExpected,
    ...(regressionCellResults ? { regressionCellResults } : {}),
  };
}

async function runFixture(
  label: string,
  imageBuffer: Buffer,
  expectedGrid: string,
  regressionCells: string[] | undefined,
  mode: 'template' | 'tesseract',
): Promise<ScoreResult> {
  process.env.OCR_CLASSIFIER = mode;
  const result = await extractGrid(imageBuffer);
  const s = score(expectedGrid, result, regressionCells);
  const pct =
    s.nonBlankExpected > 0
      ? ((s.nonBlankMatches / s.nonBlankExpected) * 100).toFixed(1)
      : 'n/a';
  console.log(
    `  [${mode.padEnd(9)}] ${label.padEnd(24)} ok=${String(s.ok).padEnd(5)} non-blank ${s.nonBlankMatches}/${s.nonBlankExpected} (${pct}%)`,
  );
  if (s.regressionCellResults) {
    for (const r of s.regressionCellResults) {
      console.log(
        `      regression ${r.cell}: expected=${r.expected} got=${r.got} ${r.correct ? 'OK' : 'MISREAD'}`,
      );
    }
  }
  return s;
}

async function main() {
  console.log('=== Real screenshots ===');
  const realFixtures = loadRealFixtures();
  for (const fixture of realFixtures) {
    for (const mode of ['tesseract', 'template'] as const) {
      await runFixture(
        fixture.label,
        fixture.imageBuffer,
        fixture.grid,
        fixture.regressionCells,
        mode,
      );
    }
  }

  console.log('\n=== Held-out synthetic fonts (not in the reference bank) ===');
  for (const family of HELD_OUT_FAMILIES) {
    const imageBuffer = await renderSyntheticGrid(family);
    for (const mode of ['tesseract', 'template'] as const) {
      await runFixture(family, imageBuffer, SOLVED_GRID, undefined, mode);
    }
  }
}

main().catch((err) => {
  console.error('[eval] failed:', err);
  process.exit(1);
});
