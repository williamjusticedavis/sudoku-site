import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema',
  out: './migrations',
  dbCredentials: {
    // Host-run migrations use the localhost URL from .env; inside compose the
    // api service talks to the db over the compose network.
    url: process.env.DATABASE_URL ?? 'postgres://sudoku:sudoku@localhost:5432/sudoku',
  },
});
