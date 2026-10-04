/** 17h de 4/10/2026, horário de Brasília. A divulgação do TSE começa nesse instante. */
export const POLL_START_MS = Date.parse("2026-10-04T17:00:00-03:00");

/** Meia-noite de 5/10/2026, horário de Brasília. O polling para no fim do dia. */
export const POLL_END_MS = Date.parse("2026-10-05T00:00:00-03:00");

export const POLL_INTERVAL_MS = 15_000;

export type PollPhase = "before" | "during" | "after";

export function pollPhase(now: number): PollPhase {
  if (now < POLL_START_MS) return "before";
  if (now < POLL_END_MS) return "during";
  return "after";
}
