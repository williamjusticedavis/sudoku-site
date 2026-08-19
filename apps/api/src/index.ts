import cors from 'cors';
import express from 'express';
import multer, { MulterError } from 'multer';
import { db, sql } from '@sudoku/db';
import { extractGrid } from './ocr/pipeline.js';

const app = express();
// The web app runs on a different origin (its own dev/prod host); no
// cookies/credentials cross this boundary, so an open CORS policy is fine.
app.use(cors());
app.use(express.json());

// Liveness + DB connectivity. Proves the api can reach Postgres via @sudoku/db.
app.get('/health', async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ ok: true, service: 'api', db: 'up' });
  } catch (err) {
    res.status(503).json({ ok: false, service: 'api', db: 'down', error: String(err) });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// Photo -> OCR'd grid string. Grid isolation (cropping to just the 9x9 grid)
// happens client-side before upload — this assumes a roughly square, aligned
// crop, not an arbitrary unprocessed photo.
app.post('/ocr/grid', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'no-file' });
    return;
  }
  try {
    const result = await extractGrid(req.file.buffer);
    if (!result.ok) {
      res.status(422).json({ ok: false, error: result.reason });
      return;
    }
    res.json({
      ok: true,
      grid: result.grid,
      confidentCount: result.confidentCount,
      blankCount: result.blankCount,
    });
  } catch (err) {
    console.error('[api] /ocr/grid failed', err);
    res.status(500).json({ ok: false, error: 'ocr-failed' });
  }
});

// Multer throws synchronously (e.g. file-size limit) before the route handler
// runs, so it needs its own error-handling middleware.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err instanceof MulterError) {
      res
        .status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ ok: false, error: 'file-too-large' });
      return;
    }
    next(err);
  },
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[api] listening on http://0.0.0.0:${port}`);
});
