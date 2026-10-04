import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// pg 8 treats sslmode=require as verify-full and will weaken it in v9.
// Keep the current certificate check explicit so the warning stays gone.
function useVerifyFullSsl(connectionString: string) {
  return connectionString.replace(
    /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/g,
    "$1sslmode=verify-full",
  );
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida");
  }

  if (!globalForDb.pool) {
    const pool = new Pool({
      connectionString: useVerifyFullSsl(connectionString),
      max: 1,
    });
    if (process.env.VERCEL) {
      attachDatabasePool(pool);
    }
    globalForDb.pool = pool;
  }

  return drizzle(globalForDb.pool, { schema });
}
