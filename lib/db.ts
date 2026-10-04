import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida");
  }

  if (!globalForDb.pool) {
    const pool = new Pool({ connectionString, max: 1 });
    if (process.env.VERCEL) {
      attachDatabasePool(pool);
    }
    globalForDb.pool = pool;
  }

  return drizzle(globalForDb.pool, { schema });
}
