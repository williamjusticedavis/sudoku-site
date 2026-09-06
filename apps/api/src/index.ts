import cors from 'cors';
import express from 'express';
import multer, { MulterError } from 'multer';
import { db, sql } from '@sudoku/db';
import { extractGrid } from './ocr/pipeline.js';
import { rateLimit } from './rateLimit.js';
import { looksLikeImage } from './ocr/imageType.js';

const app = express();

// Behind Railway's proxy in production. Express only needs this for req.ip and
// req.protocol; the rate limiter reads the forwarded header itself so it can
// count hops from the right rather than trusting the leftmost entry.
app.set('trust proxy', 1);
// No `x-powered-by: Express` — free version disclosure otherwise.
app.disable('x-powered-by');

/**
 * Origins allowed to call this API from a browser.
 *
 * An open policy leaks nothing directly (no cookies or credentials cross this
 * boundary) but it does let any site on the internet spend this container's
 * CPU on `/ocr/grid` from its own visitors' browsers — many source addresses
 * at once, which is exactly the traffic shape a per-IP limit handles worst.
 * Requests without an `Origin` (curl, server-to-server, health probes) are
 * allowed: CORS only governs browsers, and rejecting them would break the
 * platform's own checks without stopping anybody.
 */
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
  }),
);

// Baseline response headers. This API only ever returns JSON, so the useful
// ones are cheap: stop MIME sniffing, refuse framing outright, and send no
// referrer.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '32kb' }));

// Liveness + DB connectivity.
app.get('/health', rateLimit({ windowMs: 60_000, max: 60 }), async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ ok: true, service: 'api', db: 'up' });
  } catch (err) {
    // The error is logged, never returned: stringifying a driver error puts the
    // database host and port in an unauthenticated response, which is free
    // reconnaissance. Up or down is all a caller needs.
    console.error('[api] /health db check failed', err);
    res.status(503).json({ ok: false, service: 'api', db: 'down' });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4, parts: 6 },
  // `file.mimetype` is the client-declared multipart Content-Type and proves
  // nothing — it is checked only to reject obvious mistakes early. The real
  // check is `looksLikeImage` on the bytes, after the buffer has arrived.
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

/**
 * Photo -> OCR'd grid string.
 *
 * The most expensive thing this service does by a wide margin: a full image
 * decode plus 81 per-cell extractions, and up to 81 `tesseract` subprocesses
 * when that classifier is selected. Unmetered, one client can hold the
 * container's CPU indefinitely, so this is rate limited harder than anything
 * else here.
 */
app.post(
  '/ocr/grid',
  rateLimit({ windowMs: 10 * 60_000, max: 20 }),
  upload.single('image'),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'no-file' });
      return;
    }
    if (!looksLikeImage(req.file.buffer)) {
      res.status(415).json({ ok: false, error: 'not-an-image' });
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
  },
);

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

// Last-resort handler. Express's default prints the stack into the response
// body when NODE_ENV isn't production; this makes that impossible either way.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // Unused, but Express identifies an error handler by its arity — drop this
    // parameter and the function silently stops being one.
    next: express.NextFunction,
  ) => {
    void next;
    console.error('[api] unhandled error', err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'internal-error' });
  },
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[api] listening on http://0.0.0.0:${port}`);
});
