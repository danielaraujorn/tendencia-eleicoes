import {
  bigint,
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Candidate } from "./types";

export const raceState = pgTable("race_state", {
  race: text("race").primaryKey(),
  pst: doublePrecision("pst").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  etag: text("etag"),
  finalized: boolean("finalized").notNull().default(false),
  sourceUpdatedAt: text("source_updated_at"),
  candidates: jsonb("candidates").$type<Candidate[]>().notNull(),
});

export const snapshots = pgTable(
  "snapshots",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    race: text("race").notNull(),
    pst: doublePrecision("pst").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    candidates: jsonb("candidates").$type<Candidate[]>().notNull(),
  },
  (table) => [index("snapshots_race_pst").on(table.race, table.pst)],
);
