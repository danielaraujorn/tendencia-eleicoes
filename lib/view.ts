import type { RaceConfig } from "./races";
import { storageKey } from "./races";
import { arrivalAt, crossoverPst, projectPercent, trendAt } from "./trend";
import type { ApuracaoResponse, Candidate, RaceView } from "./types";

export type StoredPoint = {
  race: string;
  pst: number;
  candidates: Candidate[];
  capturedAt?: Date | null;
};

export type StoredState = StoredPoint & {
  finalized: boolean;
  sourceUpdatedAt: string | null;
};

const CHART_SIZE = 3;
const CROSSOVER_MIN_PST = 20;
const ZEROED_LIST = 10;
export const LIST_SIZE = 20;

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

export function topCandidates(candidates: Candidate[], count = CHART_SIZE) {
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
    others: [],
    roster: [],
    points: [],
    trends: [],
    crossover: null,
  };
}

function chartPoints(history: StoredPoint[], latest: StoredState | null) {
  const points = latest
    ? history.filter((point) => Math.abs(point.pst - latest.pst) > 1e-6)
    : [...history];
  if (latest) points.push(latest);
  points.sort((a, b) => a.pst - b.pst);
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
  const ranked = current
    ? topCandidates(current.candidates, current.candidates.length)
    : [];
  const top = zeroed ? ranked.slice(0, ZEROED_LIST) : ranked.slice(0, CHART_SIZE);
  const others = zeroed ? [] : ranked.slice(CHART_SIZE);
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
    const votes = series.flatMap((point) => {
      const found = point.candidates.find((item) => item.id === candidate.id);
      if (!found) return [];
      return [{ pst: point.pst, votes: found.votes }];
    });
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
  const latestPoint = points[points.length - 1];
  const crossover = latestPoint
    ? leadCrossover(top, trends, latestPoint.pst, latestPoint.percents, series, latest)
    : null;

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
    others,
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
    crossover,
  };
}

function leadCrossover(
  top: Candidate[],
  trends: RaceView["trends"],
  currentPst: number,
  percents: Record<string, number | null>,
  series: StoredPoint[],
  latest: StoredState | null,
) {
  const leader = top[0];
  const runnerUp = top[1];
  if (!leader || !runnerUp) return null;
  const leaderTrend = trends.find((item) => item.id === leader.id);
  const runnerTrend = trends.find((item) => item.id === runnerUp.id);
  const leaderPercent = percents[leader.id];
  const runnerPercent = percents[runnerUp.id];
  if (!leaderTrend || !runnerTrend) return null;
  if (typeof leaderPercent !== "number" || typeof runnerPercent !== "number") return null;
  if (!(currentPst >= CROSSOVER_MIN_PST)) return null;

  const pst = crossoverPst(
    currentPst,
    leaderPercent,
    leaderTrend.marginal,
    runnerPercent,
    runnerTrend.marginal,
  );
  const latestAt = latest?.capturedAt;
  if (pst === null || !latestAt || Number.isNaN(latestAt.getTime())) return null;

  const pace = series.flatMap((point) =>
    point.capturedAt && !Number.isNaN(point.capturedAt.getTime())
      ? [{ pst: point.pst, at: point.capturedAt }]
      : [],
  );
  const eta = arrivalAt(pace, currentPst, pst, latestAt);
  if (!eta) return null;
  return { pst, at: eta.toISOString(), readAt: latestAt.toISOString() };
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

  return { source, capturedAt: latestCapturedAt(states), races };
}

function latestCapturedAt(states: StoredState[]) {
  let latest = Number.NEGATIVE_INFINITY;
  for (const state of states) {
    const time = state.capturedAt?.getTime();
    if (time === undefined || Number.isNaN(time)) continue;
    if (time > latest) latest = time;
  }
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
}
