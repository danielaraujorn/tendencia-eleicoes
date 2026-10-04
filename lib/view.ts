import type { RaceConfig } from "./races";
import { storageKey } from "./races";
import { projectPercent, trendAt } from "./trend";
import type { ApuracaoResponse, Candidate, RaceView } from "./types";

export type StoredPoint = {
  race: string;
  pst: number;
  candidates: Candidate[];
};

export type StoredState = StoredPoint & {
  finalized: boolean;
  sourceUpdatedAt: string | null;
};

const TOP = 4;
const ZEROED_LIST = 10;
export const LIST_SIZE = 10;

export function isZeroed(candidates: Candidate[]) {
  return (
    candidates.length > 0 &&
    candidates.every((candidate) => candidate.votes === 0 && candidate.percent === 0)
  );
}

function validVoteTotal(candidates: Candidate[]) {
  const valid = candidates.filter((candidate) => candidate.destination === "Válido");
  const pool = valid.length > 0 ? valid : candidates;
  return pool.reduce((sum, candidate) => sum + candidate.votes, 0);
}

export function topCandidates(candidates: Candidate[], count = TOP) {
  return [...candidates]
    .sort((a, b) => b.percent - a.percent || a.seq - b.seq)
    .slice(0, count);
}

export function rankedCandidates(candidates: Candidate[], count = LIST_SIZE) {
  return topCandidates(
    candidates.filter((candidate) => candidate.destination === "Válido"),
    count,
  );
}

export function rosterCandidates(candidates: Candidate[]) {
  return [...candidates].sort((a, b) => {
    const left = Number(a.number);
    const right = Number(b.number);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
      return left - right;
    }
    if (a.number !== b.number) return a.number.localeCompare(b.number, "pt-BR");
    return a.seq - b.seq || a.name.localeCompare(b.name, "pt-BR");
  });
}

function listRaceView(
  config: RaceConfig,
  current: StoredPoint | null,
  latest: StoredState | null,
  zeroed: boolean,
): RaceView {
  const top = current ? rankedCandidates(current.candidates) : [];
  const leader = top[0] ?? null;
  const runnerUp = top[1] ?? null;

  return {
    id: config.id,
    title: config.title,
    scope: config.scope,
    available: Boolean(current),
    pst: current?.pst ?? null,
    finalized: latest?.finalized ?? false,
    sourceUpdatedAt: latest?.sourceUpdatedAt ?? null,
    leader: leader
      ? { name: leader.name, party: leader.party, percent: leader.percent }
      : null,
    runnerUp: runnerUp ? { name: runnerUp.name, percent: runnerUp.percent } : null,
    gap: leader && runnerUp ? leader.percent - runnerUp.percent : null,
    zeroed,
    top,
    roster: [],
    points: [],
    trends: [],
  };
}

function chartPoints(history: StoredPoint[], latest: StoredState | null) {
  const points = [...history].sort((a, b) => a.pst - b.pst);
  if (!latest) return points;
  const last = points[points.length - 1];
  if (!last || Math.abs(last.pst - latest.pst) > 1e-6) {
    points.push(latest);
  }
  return points;
}

export function buildRaceView(
  config: RaceConfig,
  history: StoredPoint[],
  latest: StoredState | null,
): RaceView {
  const current = latest ?? history[history.length - 1] ?? null;
  const zeroed = Boolean(current && isZeroed(current.candidates));
  if (config.kind === "list") {
    return listRaceView(config, current, latest, zeroed);
  }
  const top = current
    ? topCandidates(current.candidates, zeroed ? ZEROED_LIST : TOP)
    : [];
  const roster = current ? rosterCandidates(current.candidates) : [];
  const series = chartPoints(history, latest);
  const totals = series.map((point) => ({
    pst: point.pst,
    validVotes: validVoteTotal(point.candidates),
  }));
  const points = series.map((point) => ({
    pst: point.pst,
    percents: Object.fromEntries(
      top.map((candidate) => {
        const found = point.candidates.find((item) => item.id === candidate.id);
        return [candidate.id, found?.percent ?? null];
      }),
    ),
  }));

  const trends = top.flatMap((candidate) => {
    const votes = series.map((point) => ({
      pst: point.pst,
      votes:
        point.candidates.find((item) => item.id === candidate.id)?.votes ?? 0,
    }));
    const fit = projectPercent(votes, totals);
    const latestPoint = points[points.length - 1];
    const currentPercent = latestPoint?.percents[candidate.id];
    if (!fit || !latestPoint || typeof currentPercent !== "number") return [];
    return [
      {
        id: candidate.id,
        marginal: fit.marginal,
        projected: trendAt(100, latestPoint.pst, currentPercent, fit.marginal),
      },
    ];
  });

  const leader = top[0] ?? null;
  const runnerUp = top[1] ?? null;

  return {
    id: config.id,
    title: config.title,
    scope: config.scope,
    available: Boolean(current),
    pst: current?.pst ?? null,
    finalized: latest?.finalized ?? false,
    sourceUpdatedAt: latest?.sourceUpdatedAt ?? null,
    leader: leader
      ? { name: leader.name, party: leader.party, percent: leader.percent }
      : null,
    runnerUp: runnerUp
      ? { name: runnerUp.name, percent: runnerUp.percent }
      : null,
    gap: leader && runnerUp ? leader.percent - runnerUp.percent : null,
    zeroed,
    top,
    roster,
    points: points.map((point) => ({
      pst: point.pst,
      percents: Object.fromEntries(
        Object.entries(point.percents).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      ),
    })),
    trends,
  };
}

export function buildApuracao(
  configs: RaceConfig[],
  states: StoredState[],
  history: StoredPoint[],
  source: ApuracaoResponse["source"],
): ApuracaoResponse {
  const races = Object.fromEntries(
    configs.map((config) => {
      const key = storageKey(config);
      return [
        config.id,
        buildRaceView(
          config,
          history.filter((point) => point.race === key),
          states.find((state) => state.race === key) ?? null,
        ),
      ];
    }),
  );

  return { source, races };
}
