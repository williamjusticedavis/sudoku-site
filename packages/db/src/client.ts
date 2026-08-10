import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set — cannot create the database client.');
}

// postgres.js connects lazily (on first query), so importing this module does
// not open a connection.
const client = postgres(url);

export const db = drizzle(client, { schema });
export { client, schema };
export type Database = typeof db;
