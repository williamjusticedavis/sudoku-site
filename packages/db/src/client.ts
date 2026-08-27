import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

type Sql = ReturnType<typeof postgres>;
const makeDb = (sql: Sql) => drizzle(sql, { schema });
type Db = ReturnType<typeof makeDb>;

let _sql: Sql | undefined;
let _db: Db | undefined;

/** Create the connection + drizzle client on first real use. postgres.js only
 * opens a socket on the first query, so this stays cheap until then. */
function ensure(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot create the database client.');
  }
  _sql = postgres(url);
  _db = makeDb(_sql);
  return _db;
}

/**
 * Drizzle client. Lazily initialised: importing `@sudoku/db` never throws when
 * `DATABASE_URL` is unset — only touching `db` (running a query) does. This lets
 * a server that only uses the DB for some routes still boot without it.
 */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    const target = ensure() as unknown as object;
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function'
      ? (value as (...a: unknown[]) => unknown).bind(target)
      : value;
  },
});

/** Underlying postgres.js connection (for `client.end()`, tagged-template SQL). */
export const client: Sql = new Proxy((() => undefined) as unknown as Sql, {
  get(_t, prop) {
    ensure();
    const value = Reflect.get(_sql as unknown as object, prop, _sql);
    return typeof value === 'function'
      ? (value as (...a: unknown[]) => unknown).bind(_sql)
      : value;
  },
  apply(_t, _thisArg, args) {
    ensure();
    return (_sql as unknown as (...a: unknown[]) => unknown)(...args);
  },
});

export { schema };
export type Database = Db;
