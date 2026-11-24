import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  if (!cachedSql) {
    try {
      cachedSql = neon(databaseUrl);
    } catch (e) {
      console.warn("Neon initialization warning:", e);
      return null;
    }
  }
  return cachedSql;
}

// Proxy wrapper allowing `sql`...`` or `sql.query(...)` usage without throwing on import if DATABASE_URL is missing
export const sql = new Proxy((() => {}) as any, {
  apply(_target, _thisArg, args) {
    const db = getDb();
    if (!db) {
      throw new Error("Neon Database is not configured or unavailable.");
    }
    return (db as any)(...args);
  },
  get(_target, prop) {
    const db = getDb();
    if (!db) {
      throw new Error("Neon Database is not configured or unavailable.");
    }
    return (db as any)[prop];
  },
});
