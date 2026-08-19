import { spawn } from 'node:child_process';

/** Below this (0-100) confidence, a cell's OCR read is discarded as a misread. */
export const CONFIDENCE_THRESHOLD = 60;

export interface CellOcrResult {
  /** Best-guess digit, or null if tesseract found no character candidate at all. */
  digit: string | null;
  /** 0-100, meaningless when digit is null. */
  confidence: number;
}

/**
 * OCR a single pre-cropped cell image (PNG bytes) as one whitelisted digit.
 *
 * Known limitation: we shell out to the `tesseract` CLI, which only reports
 * its single best guess + confidence — not the ranked alternates it
 * internally considers (that requires the C++ API or a binding like
 * tesseract.js, not subprocess invocation). A crop that's slightly
 * misaligned can make the CLI confidently misread one digit as another
 * (high confidence, just wrong pixels) — the confidence threshold can't
 * catch that, since it's not uncertain about what it saw. Mitigated today
 * by the OCR'd grid loading as fully editable cells (not locked clues) plus
 * the automatic mistake-check after load, which catches misreads that
 * create an actual conflict. A misread that happens not to conflict
 * anywhere slips through silently. Deliberately not chasing this now —
 * narrow failure mode, real mitigations already in place; revisit with
 * actual usage data if it turns out to bite often.
 */
export async function ocrCell(cellPngBuffer: Buffer): Promise<CellOcrResult> {
  const tsv = await runTesseract(cellPngBuffer);
  return parseBestDigit(tsv);
}

function runTesseract(imageBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('tesseract', [
      'stdin',
      'stdout',
      '--psm',
      '10', // treat the image as a single character
      '-c',
      'tessedit_char_whitelist=123456789',
      'tsv', // only output mode that reports per-character confidence
    ]);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `tesseract exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString('utf8'));
    });
    child.stdin.end(imageBuffer);
  });
}

/** Parse tesseract's TSV output, returning the highest-confidence digit token. */
function parseBestDigit(tsv: string): CellOcrResult {
  let best: CellOcrResult | null = null;
  for (const line of tsv.split('\n').slice(1)) {
    const fields = line.split('\t');
    if (fields.length < 12) continue;
    const confidence = Number(fields[10]);
    const text = fields[11]!.trim();
    if (Number.isNaN(confidence) || !/^[1-9]$/.test(text)) continue;
    if (!best || confidence > best.confidence) best = { digit: text, confidence };
  }
  return best ?? { digit: null, confidence: 0 };
}
