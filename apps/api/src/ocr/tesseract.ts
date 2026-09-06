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

/** A single cell should take tesseract tens of milliseconds. Anything past this
 * is a process that will not finish on its own, and without a bound it holds a
 * request slot open forever. */
const TESSERACT_TIMEOUT_MS = 10_000;
/** Per-stream cap on what is collected from the child. The TSV for one
 * character is a few hundred bytes; this only exists so a process that decides
 * to emit endlessly cannot exhaust memory. */
const MAX_OUTPUT_BYTES = 1024 * 1024;

function runTesseract(imageBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // Arguments are a fixed array and the image goes in over stdin, so nothing
    // the caller supplies is ever parsed as an argument or a path. Keep it that
    // way: no shell, and never pass a filename here.
    const child = spawn('tesseract', [
      'stdin',
      'stdout',
      '--psm',
      '10', // treat the image as a single character
      '-c',
      'tessedit_char_whitelist=123456789',
      'tsv', // only output mode that reports per-character confidence
    ]);

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() =>
        reject(new Error(`tesseract timed out after ${TESSERACT_TIMEOUT_MS}ms`)),
      );
    }, TESSERACT_TIMEOUT_MS);

    const collect = (cap: number) => {
      const chunks: Buffer[] = [];
      let size = 0;
      return {
        chunks,
        push(chunk: Buffer) {
          if (size >= cap) return;
          size += chunk.length;
          chunks.push(chunk);
        },
      };
    };
    const stdout = collect(MAX_OUTPUT_BYTES);
    const stderr = collect(MAX_OUTPUT_BYTES);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (err) => finish(() => reject(err)));
    // A child that exits before the image is fully written makes the write end
    // EPIPE. That arrives on stdin, not on the child, and an unhandled 'error'
    // event on a stream takes the process down.
    child.stdin.on('error', (err) => finish(() => reject(err)));
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(
              `tesseract exited ${code}: ${Buffer.concat(stderr.chunks).toString('utf8').slice(0, 500)}`,
            ),
          );
          return;
        }
        resolve(Buffer.concat(stdout.chunks).toString('utf8'));
      });
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
