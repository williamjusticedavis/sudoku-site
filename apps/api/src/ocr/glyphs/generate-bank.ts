// Build-time (or dev-container-start-time) script: renders every font x
// digit x augmentation combination via the same SVG+sharp rasterization
// technique used elsewhere in this repo's OCR fixtures, runs each through
// the shared features.ts pipeline, and serializes the result to
// bank.generated.json — the reference bank the runtime classifier (M4)
// loads once at boot. Never committed; see .gitignore.
//
// Run via `pnpm --filter @sudoku/api generate:ocr-bank`.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractFeatures } from './features.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BANK_PATH = path.join(__dirname, 'bank.generated.json');

const DIGITS = '123456789';

// One entry per vendored font file (apps/api/assets/fonts, see NOTICE.md).
// `family` must match the name fontconfig registered it under; `weight`
// disambiguates the regular/bold pairs that share a family name.
const FONT_VARIANTS: readonly { family: string; weight: number }[] = [
  { family: 'Inter', weight: 400 },
  { family: 'Inter', weight: 700 },
  { family: 'Roboto', weight: 400 },
  { family: 'Open Sans', weight: 400 },
  { family: 'Comfortaa', weight: 400 },
  { family: 'Quicksand', weight: 400 },
  { family: 'Baloo 2', weight: 400 },
  { family: 'JetBrains Mono', weight: 400 },
  { family: 'JetBrains Mono', weight: 700 },
  { family: 'Space Mono', weight: 400 },
  { family: 'Fira Code', weight: 400 },
  { family: 'Oswald', weight: 400 },
  { family: 'Barlow Condensed', weight: 400 },
  { family: 'Barlow Condensed', weight: 700 },
  { family: 'Roboto Slab', weight: 400 },
];

// Square canvas each glyph is rendered onto before feature extraction —
// close to the ~76px real cells end up after pipeline.ts's CELL_INSET crop,
// but exact match isn't required since normalizeToCanonical rescales onto
// its own fixed canonical size anyway.
const GLYPH_CANVAS_PX = 80;

// Mild synthetic variation per plan (font-size, translation, blur) so the
// bank isn't just one brittle rendering per font — domain-gap mitigation
// against librsvg's rasterization differing systematically from how a
// phone/browser renders the same font in a real screenshot.
interface Augmentation {
  sizeFrac: number;
  dx: number;
  dy: number;
  blur: number;
}
const AUGMENTATIONS: readonly Augmentation[] = [
  { sizeFrac: 0.55, dx: 0, dy: 0, blur: 0 },
  { sizeFrac: 0.65, dx: 0, dy: 0, blur: 0 },
  { sizeFrac: 0.7, dx: 0, dy: 0, blur: 0 },
  { sizeFrac: 0.6, dx: -5, dy: 0, blur: 0 },
  { sizeFrac: 0.6, dx: 5, dy: 0, blur: 0 },
  { sizeFrac: 0.6, dx: 0, dy: -4, blur: 0 },
  { sizeFrac: 0.6, dx: 0, dy: 4, blur: 0 },
  { sizeFrac: 0.6, dx: 0, dy: 0, blur: 0.5 },
];

export interface ReferenceGlyph {
  digit: string;
  family: string;
  weight: number;
  features: number[];
}

/** Rasterize one digit in one font/augmentation onto a GLYPH_CANVAS_PX
 * grayscale canvas. Family name is single-quoted — an unquoted family with
 * a trailing digit (e.g. Baloo 2) silently fails to resolve in librsvg's
 * font-family parser (see NOTICE.md-adjacent gotcha discovered in M1). */
async function renderGlyph(
  digit: string,
  family: string,
  weight: number,
  aug: Augmentation,
): Promise<{ data: Buffer; width: number; height: number }> {
  const x = GLYPH_CANVAS_PX / 2 + aug.dx;
  const y = GLYPH_CANVAS_PX / 2 + aug.dy;
  const fontSize = GLYPH_CANVAS_PX * aug.sizeFrac;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH_CANVAS_PX}" height="${GLYPH_CANVAS_PX}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="${x}" y="${y}" font-family="'${family}'" font-weight="${weight}"
            font-size="${fontSize}" text-anchor="middle" dominant-baseline="central"
            fill="black">${digit}</text>
    </svg>
  `;

  let pipeline = sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).grayscale();
  if (aug.blur > 0) pipeline = pipeline.blur(aug.blur);
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function main() {
  const glyphs: ReferenceGlyph[] = [];
  const failedVariants: string[] = [];

  for (const variant of FONT_VARIANTS) {
    for (const digit of DIGITS) {
      let successCount = 0;
      for (const aug of AUGMENTATIONS) {
        const { data, width, height } = await renderGlyph(
          digit,
          variant.family,
          variant.weight,
          aug,
        );
        const features = extractFeatures(data, width, height);
        if (!features) continue; // blank render — font glyph failed to draw
        glyphs.push({
          digit,
          family: variant.family,
          weight: variant.weight,
          features: Array.from(features),
        });
        successCount++;
      }
      if (successCount === 0) {
        failedVariants.push(`${variant.family} ${variant.weight} "${digit}"`);
      }
    }
  }

  if (failedVariants.length > 0) {
    console.warn(
      `[generate-bank] WARNING: ${failedVariants.length} font/digit combos produced zero ink on every augmentation (font-family likely failed to resolve):`,
    );
    for (const v of failedVariants) console.warn(`  - ${v}`);
  }

  writeFileSync(
    BANK_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), glyphs }),
  );
  console.log(
    `[generate-bank] wrote ${glyphs.length} glyph entries (${FONT_VARIANTS.length} fonts x 9 digits x ${AUGMENTATIONS.length} augmentations, minus failures) to ${BANK_PATH}`,
  );
}

main().catch((err) => {
  console.error('[generate-bank] failed:', err);
  process.exit(1);
});
