import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { shouldRecordHistory } from "./history";
import { raceState, snapshots } from "./schema";
import type { ParsedRace } from "./tse";
import type { Candidate } from "./types";

export async function getRaceCursor(race: string) {
  const rows = await getDb()
    .select()
    .from(raceState)
    .where(eq(raceState.race, race))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordSnapshot(
  race: string,
  parsed: ParsedRace,
  etag: string | null,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const lastRows = await tx
      .select({ pst: snapshots.pst })
      .from(snapshots)
      .where(eq(snapshots.race, race))
      .orderBy(desc(snapshots.id))
      .limit(1);
    const lastPst = lastRows[0]?.pst ?? null;
    const writeHistory = shouldRecordHistory(
      lastPst,
      parsed.pst,
      parsed.finalized,
    );

    await tx
      .insert(raceState)
      .values({
        race,
        pst: parsed.pst,
        etag,
        finalized: parsed.finalized,
        sourceUpdatedAt: parsed.sourceUpdatedAt,
        candidates: parsed.candidates,
        capturedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: raceState.race,
        set: {
          pst: parsed.pst,
          etag,
          finalized: parsed.finalized,
          sourceUpdatedAt: parsed.sourceUpdatedAt,
          candidates: parsed.candidates,
          capturedAt: new Date(),
        },
      });

    if (writeHistory) {
      await tx.insert(snapshots).values({
        race,
        pst: parsed.pst,
        candidates: parsed.candidates,
      });
    }

    return writeHistory;
  });
}

export async function loadSeries(raceKeys: string[]) {
  if (raceKeys.length === 0) {
    return { states: [], history: [] };
  }

  const db = getDb();
  const states = await db
    .select()
    .from(raceState)
    .where(inArray(raceState.race, raceKeys));
  const history = await db
    .select()
    .from(snapshots)
    .where(inArray(snapshots.race, raceKeys))
    .orderBy(asc(snapshots.pst));

  return {
    states: states.map((row) => ({
      race: row.race,
      pst: row.pst,
      candidates: row.candidates as Candidate[],
      finalized: row.finalized,
      sourceUpdatedAt: row.sourceUpdatedAt,
    })),
    history: history.map((row) => ({
      race: row.race,
      pst: row.pst,
      candidates: row.candidates as Candidate[],
    })),
  };
}
