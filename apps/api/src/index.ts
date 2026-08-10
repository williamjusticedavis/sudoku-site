import express from 'express';
import { db, sql } from '@sudoku/db';

const app = express();
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

const port = Number(process.env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[api] listening on http://0.0.0.0:${port}`);
});
