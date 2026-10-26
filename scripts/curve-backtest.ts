import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { REGIONS } from "../lib/labels";
import { projectPercent, type PercentPoint } from "../lib/trend";

const CODES = { "1": "6257", "2": "6258" } as const;
const CANDIDATES = ["13", "22"] as const;
const PRIOR_K = 0.15;
const HORIZONS = [5, 10, 15, 20, 30];
const DERIVATIVE_HALF_LIFE = 10;
const SLOPE_WINDOW_PP = 10;
const SLOPE_PRIOR_SD = 0.05;
const MARKS: Record<"1" | "2", number[]> = {
  "1": [10, 20, 30, 40, 65],
  "2": [10, 20, 30, 40, 50, 60, 70],
};

type RoundId = keyof typeof CODES;
type CandidateId = (typeof CANDIDATES)[number];
type Votes = Record<string, number>;

type Snap = {
  pst: number;
  at: number;
  votes: Votes;
};

type StateEst = {
  id: string;
  p: number;
  v: number;
  counted: Record<CandidateId, number>;
  ts: number;
  rho: number | null;
  slope: Record<CandidateId, number>;
  slopeShrunk: Record<CandidateId, number>;
  marginal: Record<CandidateId, number> | null;
  paceRatio: number | null;
};

const regionOf = new Map<string, string>();
for (const region of REGIONS) {
  for (const state of region.states) regionOf.set(state, region.id);
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function totalVotes(votes: Votes) {
  return Object.values(votes).reduce((sum, value) => sum + value, 0);
}

function shareOf(votes: Votes, candidate: CandidateId, fallback: number) {
  const total = totalVotes(votes);
  if (!(total > 0)) return fallback;
  return (votes[candidate] ?? 0) / total;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? null;
}

function closest(snaps: Snap[], target: number) {
  return snaps.reduce((best, snap) =>
    Math.abs(snap.pst - target) < Math.abs(best.pst - target) ? snap : best,
  );
}

function fitSlope(points: { x: number; y: number }[]) {
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  }
  const count = points.length;
  const denom = count * sumX2 - sumX * sumX;
  if (!(Math.abs(denom) > 1e-9)) return null;
  const slope = (count * sumXY - sumX * sumY) / denom;
  if (!Number.isFinite(slope)) return null;
  return slope;
}

function slopeSample(snaps: Snap[], candidate: CandidateId) {
  const rows = snaps
    .filter((snap) => totalVotes(snap.votes) > 0)
    .sort((a, b) => a.pst - b.pst || a.at - b.at);
  if (rows.length < 3) return [];
  const last = rows[rows.length - 1];
  if (!last) return [];
  const window = rows.filter((snap) => snap.pst >= last.pst - 10 - 1e-9);
  const sample = window.length >= 3 ? window : rows.slice(-3);
  if (sample.length < 3) return [];
  return sample.map((snap) => ({
    x: snap.pst,
    y: shareOf(snap.votes, candidate, 0) * 100,
  }));
}

function marginalMix(snaps: Snap[]): Record<CandidateId, number> | null {
  const rows = snaps
    .filter((snap) => totalVotes(snap.votes) > 0)
    .sort((a, b) => a.pst - b.pst || a.at - b.at);
  const last = rows[rows.length - 1];
  if (!last || rows.length < 2) return null;
  const window = rows.filter((snap) => snap.pst >= last.pst - 10 - 1e-9);
  const first = window[0];
  if (!first || first === last || last.pst - first.pst < 1) return null;
  const gained = totalVotes(last.votes) - totalVotes(first.votes);
  if (!(gained > 1000)) return null;
  const mix = {} as Record<CandidateId, number>;
  for (const candidate of CANDIDATES) {
    const part = ((last.votes[candidate] ?? 0) - (first.votes[candidate] ?? 0)) / gained;
    mix[candidate] = Math.min(1, Math.max(0, part));
  }
  return mix;
}

function stateSlope(snaps: Snap[], candidate: CandidateId) {
  const slope = fitSlope(slopeSample(snaps, candidate));
  if (slope == null) return 0;
  return Math.max(-0.5, Math.min(0.5, slope));
}

function shrunkSlope(snaps: Snap[], candidate: CandidateId) {
  const points = slopeSample(snaps, candidate);
  const slope = fitSlope(points);
  if (slope == null || points.length < 3) return 0;
  const count = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / count;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / count;
  const intercept = meanY - slope * meanX;
  let sxx = 0;
  let sse = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    sxx += dx * dx;
    const residual = point.y - (intercept + slope * point.x);
    sse += residual * residual;
  }
  if (!(sxx > 1e-9)) return 0;
  const variance = sse / Math.max(1, count - 2) / sxx;
  const prior = SLOPE_PRIOR_SD * SLOPE_PRIOR_SD;
  const weight = prior / (prior + Math.max(0, variance));
  return Math.max(-0.5, Math.min(0.5, slope * weight));
}

function persistenceBeta(states: Map<string, Snap[]>, asOf: number) {
  let dot = 0;
  let norm = 0;
  let pairs = 0;
  for (const snaps of states.values()) {
    const past = snaps
      .filter((snap) => snap.at <= asOf && totalVotes(snap.votes) > 0)
      .sort((a, b) => a.pst - b.pst || a.at - b.at);
    let chosen: { now: Snap; later: Snap } | null = null;
    for (const now of past) {
      const later = past.find((snap) => snap.pst >= now.pst + 10 - 1e-9);
      if (!later) continue;
      const history = past.filter((snap) => snap.pst <= now.pst + 1e-9);
      const window = history.filter((snap) => snap.pst >= now.pst - 10 - 1e-9);
      if (window.length < 3) continue;
      chosen = { now, later };
    }
    if (!chosen) continue;
    const history = past.filter((snap) => snap.pst <= chosen.now.pst + 1e-9);
    const slope = stateSlope(history, "13");
    const span = chosen.later.pst - chosen.now.pst;
    const predicted = slope * span;
    const realized =
      (shareOf(chosen.later.votes, "13", 0) - shareOf(chosen.now.votes, "13", 0)) * 100;
    dot += predicted * realized;
    norm += predicted * predicted;
    pairs += 1;
  }
  if (pairs < 5 || !(norm > 1e-9)) return { beta: 0, pairs };
  return { beta: Math.min(1, Math.max(0, dot / norm)), pairs };
}

const PACE_CAP = 0.25;
const PACE_FLOOR = 1e-4;

function bandPace(snaps: Snap[], fromPst: number, toPst: number) {
  const rows = snaps
    .filter((snap) => snap.pst >= fromPst - 1e-9 && snap.pst <= toPst + 1e-9)
    .sort((a, b) => a.at - b.at || a.pst - b.pst);
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last || rows.length < 2) return null;
  const minutes = (last.at - first.at) / 60_000;
  const fraction = (last.pst - first.pst) / 100;
  if (!(minutes >= 0.5) || !(fraction >= 0.04)) return null;
  return fraction / minutes;
}

function paceGamma(states: Map<string, Snap[]>, asOf: number) {
  let dot = 0;
  let norm = 0;
  let pairs = 0;
  for (const snaps of states.values()) {
    const past = snaps
      .filter((snap) => snap.at <= asOf)
      .sort((a, b) => a.pst - b.pst || a.at - b.at);
    const last = past[past.length - 1];
    if (!last || last.pst < 30) continue;
    const previous = bandPace(past, last.pst - 30, last.pst - 20);
    const recent = bandPace(past, last.pst - 20, last.pst - 10);
    const followed = bandPace(past, last.pst - 10, last.pst);
    if (previous == null || recent == null || followed == null || !(previous > 1e-6)) continue;
    const predicted = recent * (recent / previous);
    const change = predicted - recent;
    if (!(Math.abs(change) > 1e-6)) continue;
    dot += change * (followed - recent);
    norm += change * change;
    pairs += 1;
  }
  if (pairs < 5 || !(norm > 1e-9)) return { gamma: 0, pairs };
  return { gamma: Math.min(1, Math.max(0, dot / norm)), pairs };
}

function paceOf(snaps: Snap[], asOf: number) {
  const rows = snaps
    .filter((snap) => snap.at <= asOf)
    .sort((a, b) => a.at - b.at || a.pst - b.pst);
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  const window = rows.filter((snap) => snap.pst >= last.pst - 10 - 1e-9);
  const sample = window.length >= 2 ? window : rows;
  const first = sample[0];
  if (!first) return null;
  const minutes = (last.at - first.at) / 60_000;
  const fraction = (last.pst - first.pst) / 100;
  if (!(minutes >= 0.5) || !(fraction > 1e-4)) return null;
  return Math.min(fraction / minutes, PACE_CAP);
}

function paceRatioOf(snaps: Snap[]) {
  const last = snaps[snaps.length - 1];
  if (!last || last.pst < 20) return null;
  const previous = bandPace(snaps, last.pst - 20, last.pst - 10);
  const recent = bandPace(snaps, last.pst - 10, last.pst);
  if (previous == null || recent == null || !(previous > 1e-6)) return null;
  return recent / previous;
}

function shrinkShare(
  observed: number,
  prior: number,
  p: number,
  counted: number,
) {
  if (!(counted > 0)) return prior;
  return (p * observed + PRIOR_K * prior) / (p + PRIOR_K);
}

type OpenState = StateEst & {
  share: Record<CandidateId, number>;
  total: number;
  remain: number;
  rho: number;
};

function estimates(
  states: Map<string, Snap[]>,
  sections: Map<string, number>,
  asOf: number,
  priorFor: (state: StateEst, regionPrior: Record<CandidateId, number>) => Record<CandidateId, number>,
) {
  const rows: StateEst[] = [];
  for (const [id, snaps] of states) {
    const past = snaps.filter((snap) => snap.at <= asOf);
    const latest = past[past.length - 1];
    const votes = latest?.votes ?? {};
    const counted = {
      "13": votes["13"] ?? 0,
      "22": votes["22"] ?? 0,
    } as Record<CandidateId, number>;
    const p = latest ? Math.min(1, Math.max(0, latest.pst / 100)) : 0;
    const trust = p / (p + PRIOR_K);
    rows.push({
      id,
      p,
      v: totalVotes(votes),
      counted,
      ts: sections.get(id) ?? 0,
      rho: latest ? paceOf(past, asOf) : null,
      slope: {
        "13": stateSlope(past, "13") * trust,
        "22": stateSlope(past, "22") * trust,
      },
      slopeShrunk: {
        "13": shrunkSlope(past, "13"),
        "22": shrunkSlope(past, "22"),
      },
      marginal: marginalMix(past),
      paceRatio: paceRatioOf(past),
    });
  }

  const sized = rows.filter((row) => row.p >= 0.15 && row.ts > 0 && row.v > 0);
  const perSection = median(sized.map((row) => row.v / (row.p * row.ts)));

  const countedNational = { "13": 0, "22": 0 } as Record<CandidateId, number>;
  let countedTotal = 0;
  for (const row of rows) {
    countedTotal += row.v;
    countedNational["13"] += row.counted["13"];
    countedNational["22"] += row.counted["22"];
  }
  const nationalPrior = {
    "13": countedTotal > 0 ? countedNational["13"] / countedTotal : 0.5,
    "22": countedTotal > 0 ? countedNational["22"] / countedTotal : 0.5,
  };

  const regionPrior = new Map<string, Record<CandidateId, number>>();
  for (const region of REGIONS) {
    const members = rows.filter(
      (row) => regionOf.get(row.id) === region.id && row.v > 0 && row.p >= 0.05,
    );
    const pool = members.length > 0 ? members : rows.filter((row) => regionOf.get(row.id) === region.id && row.v > 0);
    const votes = pool.reduce((sum, row) => sum + row.v, 0);
    if (!(votes > 0)) {
      regionPrior.set(region.id, nationalPrior);
      continue;
    }
    regionPrior.set(region.id, {
      "13": pool.reduce((sum, row) => sum + row.counted["13"], 0) / votes,
      "22": pool.reduce((sum, row) => sum + row.counted["22"], 0) / votes,
    });
  }

  const knownPace = rows.flatMap((row) => (row.rho != null && row.rho > 0 ? [row.rho] : []));
  const paceFallback = median(knownPace);

  const open: OpenState[] = [];
  let votes = 0;
  let candidateVotes = { "13": 0, "22": 0 } as Record<CandidateId, number>;
  let sectionsIn = 0;
  let sectionsAll = 0;

  for (const row of rows) {
    const region = regionPrior.get(regionOf.get(row.id) ?? "") ?? nationalPrior;
    const prior = priorFor(row, region);
    const share = {
      "13": shrinkShare(
        row.v > 0 ? row.counted["13"] / row.v : prior["13"],
        prior["13"],
        row.p,
        row.v,
      ),
      "22": shrinkShare(
        row.v > 0 ? row.counted["22"] / row.v : prior["22"],
        prior["22"],
        row.p,
        row.v,
      ),
    } as Record<CandidateId, number>;
    const hat = perSection != null && row.ts > 0 ? perSection * row.ts : row.v;
    const total = row.p >= 1 - 1e-4 ? row.v : (row.v + PRIOR_K * hat) / (row.p + PRIOR_K);
    const remain = Math.max(0, total - row.v);
    votes += row.v;
    candidateVotes = {
      "13": candidateVotes["13"] + row.counted["13"],
      "22": candidateVotes["22"] + row.counted["22"],
    };
    sectionsIn += row.ts * row.p;
    sectionsAll += row.ts;
    const rho = row.rho ?? (paceFallback != null ? paceFallback * 0.5 : 0.01);
    if (remain > 1 && row.p < 1 - 1e-4 && rho > 0) {
      open.push({ ...row, share, total, remain, rho });
    }
  }

  const remainVotes = open.reduce((sum, row) => sum + row.remain, 0);
  const remainCandidate = {
    "13": open.reduce((sum, row) => sum + row.share["13"] * row.remain, 0),
    "22": open.reduce((sum, row) => sum + row.share["22"] * row.remain, 0),
  };
  const finish = {
    "13": votes + remainVotes > 0 ? ((candidateVotes["13"] + remainCandidate["13"]) / (votes + remainVotes)) * 100 : null,
    "22": votes + remainVotes > 0 ? ((candidateVotes["22"] + remainCandidate["22"]) / (votes + remainVotes)) * 100 : null,
  };

  return {
    open,
    votes,
    candidateVotes,
    remainVotes,
    remainCandidate,
    finish,
    sectionsIn,
    sectionsAll,
    level: {
      "13": votes > 0 ? (candidateVotes["13"] / votes) * 100 : null,
      "22": votes > 0 ? (candidateVotes["22"] / votes) * 100 : null,
    } as Record<CandidateId, number | null>,
  };
}

type Curve = { pst: number; percent: Record<CandidateId, number> };

function finishTogether(model: ReturnType<typeof estimates>): Curve[] {
  const steps = 40;
  const remainSections = model.open.reduce((sum, row) => sum + row.ts * (1 - row.p), 0);
  const points: Curve[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const votes = model.votes + u * model.remainVotes;
    const sections = model.sectionsIn + u * remainSections;
    const percent = {} as Record<CandidateId, number>;
    for (const candidate of CANDIDATES) {
      percent[candidate] =
        votes > 0
          ? ((model.candidateVotes[candidate] + u * model.remainCandidate[candidate]) / votes) * 100
          : 0;
    }
    points.push({
      pst: model.sectionsAll > 0 ? (sections / model.sectionsAll) * 100 : u * 100,
      percent,
    });
  }
  return points;
}

function finishByMarginal(model: ReturnType<typeof estimates>): Curve[] {
  return finishByPace({
    ...model,
    open: model.open.map((row) => ({
      ...row,
      share: row.marginal ?? row.share,
    })),
  });
}

function finishByPace(model: ReturnType<typeof estimates>): Curve[] {
  if (model.open.length === 0 || !(model.sectionsAll > 0)) return finishTogether(model);
  const open = model.open.map((row) => ({
    ...row,
    tau: (1 - row.p) / row.rho,
  }));
  const events = [...new Set(open.map((row) => row.tau))].sort((a, b) => a - b);
  let time = 0;
  let added = 0;
  let addedCandidate = { "13": 0, "22": 0 } as Record<CandidateId, number>;
  let addedSections = 0;
  const points: Curve[] = [];

  const push = (at: number) => {
    const votes = model.votes + added;
    const percent = {} as Record<CandidateId, number>;
    for (const candidate of CANDIDATES) {
      percent[candidate] =
        votes > 0 ? ((model.candidateVotes[candidate] + addedCandidate[candidate]) / votes) * 100 : 0;
    }
    points.push({
      pst: ((model.sectionsIn + addedSections) / model.sectionsAll) * 100,
      percent,
    });
    void at;
  };

  push(0);
  for (const event of events) {
    const dt = event - time;
    if (dt > 1e-9) {
      const live = open.filter((row) => row.tau > time + 1e-9);
      const voteRate = live.reduce((sum, row) => sum + (row.remain * row.rho) / (1 - row.p), 0);
      const sectionRate = live.reduce((sum, row) => sum + row.ts * row.rho, 0);
      const candidateRate = {
        "13": live.reduce((sum, row) => sum + row.share["13"] * ((row.remain * row.rho) / (1 - row.p)), 0),
        "22": live.reduce((sum, row) => sum + row.share["22"] * ((row.remain * row.rho) / (1 - row.p)), 0),
      };
      const slices = Math.max(1, Math.ceil((sectionRate * dt) / model.sectionsAll / 0.01));
      for (let slice = 1; slice <= slices; slice += 1) {
        const part = dt * (slice / slices);
        added += voteRate * part;
        addedSections += sectionRate * part;
        addedCandidate = {
          "13": addedCandidate["13"] + candidateRate["13"] * part,
          "22": addedCandidate["22"] + candidateRate["22"] * part,
        };
        push(time + part);
        added -= voteRate * part;
        addedSections -= sectionRate * part;
        addedCandidate = {
          "13": addedCandidate["13"] - candidateRate["13"] * part,
          "22": addedCandidate["22"] - candidateRate["22"] * part,
        };
      }
      added += voteRate * dt;
      addedSections += sectionRate * dt;
      addedCandidate = {
        "13": addedCandidate["13"] + candidateRate["13"] * dt,
        "22": addedCandidate["22"] + candidateRate["22"] * dt,
      };
    }
    time = event;
  }
  push(time);
  const last = points[points.length - 1];
  if (last && last.pst < 100 - 1e-3) {
    points.push({
      pst: 100,
      percent: {
        "13": model.finish["13"] ?? last.percent["13"],
        "22": model.finish["22"] ?? last.percent["22"],
      },
    });
  }
  return points;
}

function withPaceChange(model: ReturnType<typeof estimates>, gamma: number) {
  if (!(gamma > 0)) return model;
  return {
    ...model,
    open: model.open.map((row) => {
      const ratio = row.paceRatio ?? 1;
      const rho = Math.min(PACE_CAP, Math.max(PACE_FLOOR, row.rho * (1 + gamma * (ratio - 1))));
      return { ...row, rho };
    }),
  };
}

function peerPaths(states: Map<string, Snap[]>, asOf: number) {
  const peers: { id: string; region: string; points: { pst: number; share: number }[] }[] = [];
  for (const [id, snaps] of states) {
    const points = snaps
      .filter((snap) => snap.at <= asOf && totalVotes(snap.votes) > 0)
      .sort((a, b) => a.pst - b.pst || a.at - b.at)
      .map((snap) => ({ pst: snap.pst, share: shareOf(snap.votes, "13", 0) }));
    if (points.length >= 2) peers.push({ id, region: regionOf.get(id) ?? "", points });
  }
  return peers;
}

function shareOnPath(points: { pst: number; share: number }[], pst: number) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  if (pst <= first.pst) return first.pst <= pst + 2 ? first.share : null;
  if (pst >= last.pst) return pst <= last.pst + 0.5 ? last.share : null;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (!left || !right || pst > right.pst) continue;
    if (!(right.pst > left.pst)) return right.share;
    const weight = (pst - left.pst) / (right.pst - left.pst);
    return left.share + weight * (right.share - left.share);
  }
  return null;
}

function regionDelta(
  peers: ReturnType<typeof peerPaths>,
  id: string,
  region: string,
  startPst: number,
  targetPst: number,
) {
  const deltas: number[] = [];
  for (const peer of peers) {
    if (peer.id === id || peer.region !== region) continue;
    const first = peer.points[0];
    const last = peer.points[peer.points.length - 1];
    if (!first || !last || first.pst > startPst + 2 || last.pst < targetPst - 0.5) continue;
    const start = shareOnPath(peer.points, startPst);
    const end = shareOnPath(peer.points, targetPst);
    if (start == null || end == null) continue;
    deltas.push(end - start);
  }
  if (deltas.length < 2) return null;
  return median(deltas);
}

function regionCap(
  peers: ReturnType<typeof peerPaths>,
  id: string,
  region: string,
  startPst: number,
) {
  const reached: number[] = [];
  for (const peer of peers) {
    if (peer.id === id || peer.region !== region) continue;
    const first = peer.points[0];
    const last = peer.points[peer.points.length - 1];
    if (!first || !last || first.pst > startPst + 2 || last.pst < startPst + 1) continue;
    reached.push(last.pst);
  }
  if (reached.length < 2) return null;
  reached.sort((a, b) => b - a);
  return reached[1] ?? null;
}

function finishByRegion(
  model: ReturnType<typeof estimates>,
  states: Map<string, Snap[]>,
  asOf: number,
) {
  const peers = peerPaths(states, asOf);
  const curves = new Map<string, (p: number, share0: number, slope: number, p0: number) => number>();
  for (const row of model.open) {
    const region = regionOf.get(row.id) ?? "";
    const startPst = row.p * 100;
    const cap = regionCap(peers, row.id, region, startPst);
    curves.set(row.id, (p, share0, slope, p0) => {
      if (cap == null) return share0 + slope * (p - p0);
      const pst = p * 100;
      const target = Math.min(pst, cap);
      const delta = target <= startPst + 1e-6 ? 0 : regionDelta(peers, row.id, region, startPst, target);
      const covered = delta == null ? share0 + slope * (target / 100 - p0) : share0 + delta;
      if (pst <= cap + 1e-6) return covered;
      return covered + slope * (p - cap / 100);
    });
  }
  return finishByDerivative(model, "full", 1, (id, p, share0, slope, p0) => {
    return curves.get(id)?.(p, share0, slope, p0) ?? share0 + slope * (p - p0);
  });
}

function finishByDerivative(
  model: ReturnType<typeof estimates>,
  mode: "full" | "decay" | "window",
  scale = 1,
  shareAt?: (id: string, p: number, share0: number, slope: number, p0: number) => number,
): Curve[] {
  if (model.open.length === 0 || !(model.sectionsAll > 0)) return finishTogether(model);
  const live = model.open.map((row) => ({
    id: row.id,
    p0: row.p,
    p: row.p,
    share0: row.share["13"],
    share13: row.share["13"],
    slope: row.slope["13"] * scale,
    remain0: row.remain,
    rho: row.rho,
    ts: row.ts,
  }));
  let added = 0;
  let addedCandidate = { "13": 0, "22": 0 } as Record<CandidateId, number>;
  let addedSections = 0;
  const points: Curve[] = [];

  const push = () => {
    const votes = model.votes + added;
    points.push({
      pst: ((model.sectionsIn + addedSections) / model.sectionsAll) * 100,
      percent: {
        "13": votes > 0 ? ((model.candidateVotes["13"] + addedCandidate["13"]) / votes) * 100 : 0,
        "22": votes > 0 ? ((model.candidateVotes["22"] + addedCandidate["22"]) / votes) * 100 : 0,
      },
    });
  };

  push();
  let guard = 0;
  while (live.some((row) => row.p < 1 - 1e-6) && guard < 5000) {
    guard += 1;
    const open = live.filter((row) => row.p < 1 - 1e-6);
    const sectionRate = open.reduce((sum, row) => sum + row.ts * row.rho, 0);
    if (!(sectionRate > 0)) break;
    const toNext = Math.min(...open.map((row) => (1 - row.p) / row.rho));
    const dt = Math.min(toNext, (0.005 * model.sectionsAll) / sectionRate);
    if (!(dt > 1e-9)) break;
    for (const row of open) {
      const dp = Math.min(row.rho * dt, 1 - row.p);
      const before = (row.p - row.p0) * 100;
      const after = before + dp * 100;
      const span = after - before;
      const factor =
        mode === "full"
          ? 1
          : mode === "decay"
            ? (Math.exp((-Math.LN2 * before) / DERIVATIVE_HALF_LIFE) +
                Math.exp((-Math.LN2 * after) / DERIVATIVE_HALF_LIFE)) /
              2
            : after <= SLOPE_WINDOW_PP
              ? 1
              : before >= SLOPE_WINDOW_PP
                ? 0
                : span > 1e-9
                  ? (SLOPE_WINDOW_PP - before) / span
                  : 0;
      const next = Math.min(
        1,
        Math.max(
          0,
          shareAt
            ? shareAt(row.id, row.p + dp, row.share0, row.slope, row.p0)
            : row.share13 + row.slope * dp * factor,
        ),
      );
      const mid = (row.share13 + next) / 2;
      const slice = (row.remain0 * dp) / (1 - row.p0);
      added += slice;
      addedCandidate = {
        "13": addedCandidate["13"] + mid * slice,
        "22": addedCandidate["22"] + (1 - mid) * slice,
      };
      addedSections += row.ts * dp;
      row.p += dp;
      row.share13 = next;
    }
    push();
  }
  return points;
}

function integratedShare(share: number, slope: number, span: number, u: number) {
  const drift = slope * span;
  const end = share + drift * u;
  if (end >= 0 && end <= 1) return share * u + (drift * u * u) / 2;
  const bound = end > 1 ? 1 : 0;
  const hit = Math.abs(drift) > 1e-9 ? (bound - share) / drift : u;
  const until = Math.min(u, Math.max(0, hit));
  return share * until + (drift * until * until) / 2 + bound * (u - until);
}

function finishExpected(model: ReturnType<typeof estimates>): Curve[] {
  if (model.open.length === 0 || !(model.sectionsAll > 0)) return finishTogether(model);
  const steps = 40;
  const points: Curve[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    let added = 0;
    let addedCandidate = { "13": 0, "22": 0 } as Record<CandidateId, number>;
    let addedSections = 0;
    for (const row of model.open) {
      const span = 1 - row.p;
      const slice = row.remain * u;
      const share = integratedShare(row.share["13"], row.slopeShrunk["13"], span, u);
      added += slice;
      addedCandidate = {
        "13": addedCandidate["13"] + row.remain * share,
        "22": addedCandidate["22"] + row.remain * (u - share),
      };
      addedSections += row.ts * span * u;
    }
    const votes = model.votes + added;
    points.push({
      pst: ((model.sectionsIn + addedSections) / model.sectionsAll) * 100,
      percent: {
        "13": votes > 0 ? ((model.candidateVotes["13"] + addedCandidate["13"]) / votes) * 100 : 0,
        "22": votes > 0 ? ((model.candidateVotes["22"] + addedCandidate["22"]) / votes) * 100 : 0,
      },
    });
  }
  return points;
}

function interp(curve: Curve[], pst: number, candidate: CandidateId) {
  if (curve.length === 0) return null;
  const ordered = [...curve].sort((a, b) => a.pst - b.pst);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return null;
  if (pst <= first.pst) return first.percent[candidate];
  if (pst >= last.pst) return last.percent[candidate];
  for (let index = 1; index < ordered.length; index += 1) {
    const left = ordered[index - 1];
    const right = ordered[index];
    if (!left || !right || pst > right.pst) continue;
    const span = right.pst - left.pst;
    const weight = span > 1e-9 ? (pst - left.pst) / span : 0;
    return left.percent[candidate] + weight * (right.percent[candidate] - left.percent[candidate]);
  }
  return last.percent[candidate];
}

function anchor(
  curve: Curve[],
  pst0: number,
  national: Record<CandidateId, number>,
  modelNow: Record<CandidateId, number | null>,
) {
  const shift = {} as Record<CandidateId, number>;
  for (const candidate of CANDIDATES) {
    const base = modelNow[candidate];
    shift[candidate] = base == null ? 0 : national[candidate] - base;
  }
  return curve.map((point) => ({
    pst: point.pst,
    percent: {
      "13": point.percent["13"] + shift["13"],
      "22": point.percent["22"] + shift["22"],
    } as Record<CandidateId, number>,
  }));
}

function straight(
  pst0: number,
  national: Record<CandidateId, number>,
  finish: Record<CandidateId, number>,
): Curve[] {
  return [
    { pst: pst0, percent: national },
    { pst: 100, percent: finish },
  ];
}

function lineFromSlope(
  points: PercentPoint[],
  pst0: number,
  current: number,
) {
  const projected = projectPercent(points);
  if (projected == null || !(pst0 < 100)) return null;
  return {
    finish: projected,
    curve: straight(pst0, { "13": 0, "22": 0 }, { "13": 0, "22": 0 }).map((point, index) => ({
      pst: index === 0 ? pst0 : 100,
      percent: index === 0 ? current : projected,
    })),
  };
}

function rawSlopeLine(points: PercentPoint[], pst0: number, current: number) {
  if (points.length < 3 || !(pst0 < 100)) return null;
  const ordered = [...points].sort((a, b) => a.pst - b.pst);
  const last = ordered[ordered.length - 1];
  if (!last) return null;
  const window = ordered.filter((point) => point.pst >= last.pst - 10 - 1e-9);
  const sample = window.length >= 3 ? window : ordered.slice(-3);
  const slope = fitSlope(sample.map((point) => ({ x: point.pst, y: point.percent })));
  if (slope == null) return null;
  const finish = Math.min(100, Math.max(0, current + slope * (100 - pst0)));
  return {
    finish,
    curve: [
      { pst: pst0, percent: current },
      { pst: 100, percent: finish },
    ],
  };
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTo(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scoreCurve(
  curve: Curve[],
  later: Snap[],
  finalSnap: Snap,
  finish: Record<CandidateId, number>,
) {
  const path = {} as Record<CandidateId, number | null>;
  const destination = {} as Record<CandidateId, number | null>;
  for (const candidate of CANDIDATES) {
    const errors = later.flatMap((snap) => {
      const predicted = interp(curve, snap.pst, candidate);
      if (predicted == null) return [];
      return [Math.abs(predicted - shareOf(snap.votes, candidate, 0) * 100)];
    });
    path[candidate] = mean(errors) == null ? null : roundTo(mean(errors) as number);
    destination[candidate] = roundTo(
      Math.abs(finish[candidate] - shareOf(finalSnap.votes, candidate, 0) * 100),
    );
  }
  return { path, destination };
}

function scoreHorizons(curve: Curve[], pst0: number, later: Snap[]) {
  const horizons = {} as Record<CandidateId, Record<number, number | null>>;
  for (const candidate of CANDIDATES) {
    const row = {} as Record<number, number | null>;
    for (const horizon of HORIZONS) {
      const target = pst0 + horizon;
      const near = later.reduce<Snap | null>((best, snap) => {
        if (!best) return snap;
        return Math.abs(snap.pst - target) < Math.abs(best.pst - target) ? snap : best;
      }, null);
      if (!near || Math.abs(near.pst - target) > 2.5 || target > 100) {
        row[horizon] = null;
        continue;
      }
      const predicted = interp(curve, near.pst, candidate);
      row[horizon] =
        predicted == null
          ? null
          : roundTo(Math.abs(predicted - shareOf(near.votes, candidate, 0) * 100));
    }
    horizons[candidate] = row;
  }
  return horizons;
}

function thin(curve: Curve[]) {
  const kept: Curve[] = [];
  for (const point of curve) {
    const last = kept[kept.length - 1];
    if (last && point.pst - last.pst < 1.5 && point !== curve[curve.length - 1]) continue;
    kept.push({
      pst: roundTo(point.pst, 2),
      percent: {
        "13": roundTo(point.percent["13"], 2),
        "22": roundTo(point.percent["22"], 2),
      },
    });
  }
  return kept;
}

async function fetchSections(code: string) {
  const padded = code.padStart(6, "0");
  const response = await fetch(
    `https://resultados.tse.jus.br/oficial/ele2026/${code}/dados/br/br-e${padded}-ab.json`,
  );
  if (!response.ok) throw new Error(`abrangência ${code} HTTP ${response.status}`);
  const data = (await response.json()) as {
    abr?: { tpabr?: string; cdabr?: string; s?: { ts?: unknown } }[];
  };
  const sections = new Map<string, number>();
  for (const item of data.abr ?? []) {
    if ((item.tpabr ?? "").toLowerCase() !== "uf" || !item.cdabr) continue;
    const total = Number(String(item.s?.ts ?? "").replace(",", "."));
    if (Number.isFinite(total) && total > 0) sections.set(item.cdabr.toLowerCase(), total);
  }
  return sections;
}

function parseVotes(value: unknown): Votes {
  if (!value || typeof value !== "object") return {};
  const votes: Votes = {};
  for (const [number, votesValue] of Object.entries(value)) {
    const parsed = Number(votesValue);
    if (Number.isFinite(parsed)) votes[number] = parsed;
  }
  return votes;
}

async function loadRound(pool: Pool, code: string) {
  const result = await pool.query<{
    race: string;
    pst: number;
    captured_at: Date;
    votes: unknown;
  }>(
    `SELECT race, pst, captured_at,
            COALESCE((
              SELECT jsonb_object_agg(c->>'number', (c->>'votes')::double precision)
              FROM jsonb_array_elements(candidates) c
              WHERE c->>'destination' = 'Válido'
            ), '{}'::jsonb) AS votes
     FROM snapshots
     WHERE race = $1 OR race LIKE $2
     ORDER BY race, captured_at, pst`,
    [`presidente:${code}`, `presidente-%:${code}`],
  );

  const national: Snap[] = [];
  const states = new Map<string, Snap[]>();
  for (const row of result.rows) {
    const snap: Snap = {
      pst: row.pst,
      at: row.captured_at.getTime(),
      votes: parseVotes(row.votes),
    };
    if (row.race === `presidente:${code}`) {
      national.push(snap);
      continue;
    }
    const state = row.race.slice("presidente-".length, row.race.indexOf(":"));
    const series = states.get(state) ?? [];
    series.push(snap);
    states.set(state, series);
  }
  national.sort((a, b) => a.pst - b.pst || a.at - b.at);
  return { national, states };
}

function headToHead(votes: Votes): Record<CandidateId, number> {
  const left = votes["13"] ?? 0;
  const right = votes["22"] ?? 0;
  const total = left + right;
  if (!(total > 0)) return { "13": 0.5, "22": 0.5 };
  return { "13": left / total, "22": right / total };
}

function regionPriorOnly(
  _row: StateEst,
  regionPrior: Record<CandidateId, number>,
) {
  return regionPrior;
}

function assertHyperbola() {
  const votes = 100;
  const candidate = 60;
  const remain = 100;
  const remainCandidate = 40;
  const mid = ((candidate + 0.5 * remainCandidate) / (votes + 0.5 * remain)) * 100;
  if (Math.abs(mid - 100 / 3 * 1.6) > 0.05) {
    throw new Error(`hipérbole de controle deu ${mid}, esperado 53,33`);
  }
}

async function main() {
  assertHyperbola();
  loadEnv();
  const connectionString = process.env.DATABASE_URL?.replace(
    /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/g,
    "$1sslmode=verify-full",
  );
  if (!connectionString) throw new Error("DATABASE_URL não está definida");

  const pool = new Pool({ connectionString, max: 1 });
  const sections = {
    "1": await fetchSections(CODES["1"]),
    "2": await fetchSections(CODES["2"]),
  };
  const rounds = {
    "1": await loadRound(pool, CODES["1"]),
    "2": await loadRound(pool, CODES["2"]),
  };
  await pool.end();

  const firstFinal = new Map<string, Record<CandidateId, number>>();
  for (const [state, snaps] of rounds["1"].states) {
    const finalSnap = snaps[snaps.length - 1];
    if (finalSnap) firstFinal.set(state, headToHead(finalSnap.votes));
  }

  const output: Record<string, unknown> = {};

  for (const round of ["1", "2"] as RoundId[]) {
    const { national, states } = rounds[round];
    const finalSnap = national[national.length - 1];
    if (!finalSnap) continue;
    const stateModels = round === "2" && [...states.values()].some((series) => series.length > 1);
    const marks = [];

    for (const target of MARKS[round]) {
      const mark = closest(national, target);
      if (Math.abs(mark.pst - target) > 3) continue;
      const later = national.filter((snap) => snap.pst > mark.pst + 0.05);
      const nationalNow = {
        "13": shareOf(mark.votes, "13", 0) * 100,
        "22": shareOf(mark.votes, "22", 0) * 100,
      } as Record<CandidateId, number>;
      const history = national
        .filter((snap) => snap.pst <= mark.pst + 1e-9 && snap.pst > 1e-9)
        .map((snap) => snap);

      const models: Record<string, unknown> = {};

      for (const candidate of CANDIDATES) {
        const slope = lineFromSlope(
          history.map((snap) => ({
            pst: snap.pst,
            percent: shareOf(snap.votes, candidate, 0) * 100,
          })),
          mark.pst,
          nationalNow[candidate],
        );
        const key = "reta-atual";
        const entry = (models[key] as {
          path: Record<string, number | null>;
          destination: Record<string, number | null>;
          horizons: Record<string, Record<number, number | null>>;
          finish: Record<string, number | null>;
          curve: Record<string, { pst: number; percent: number }[]>;
        }) ?? {
          path: {},
          destination: {},
          horizons: {},
          finish: {},
          curve: {},
        };
        if (!slope) {
          entry.path[candidate] = null;
          entry.destination[candidate] = null;
          entry.horizons[candidate] = {};
          entry.finish[candidate] = null;
          entry.curve[candidate] = [];
        } else {
          const curve: Curve[] = slope.curve.map((point) => ({
            pst: point.pst,
            percent: { "13": 0, "22": 0, [candidate]: point.percent },
          }));
          const scored = scoreCurve(
            curve,
            later,
            finalSnap,
            { "13": slope.finish, "22": slope.finish },
          );
          entry.path[candidate] = scored.path[candidate];
          entry.destination[candidate] = scored.destination[candidate];
          entry.horizons[candidate] = scoreHorizons(curve, mark.pst, later)[candidate];
          entry.finish[candidate] = roundTo(slope.finish, 2);
          entry.curve[candidate] = thin(curve).map((point) => ({
            pst: point.pst,
            percent: point.percent[candidate],
          }));
        }
        models[key] = entry;
      }

      for (const candidate of CANDIDATES) {
        const slope = rawSlopeLine(
          history.map((snap) => ({
            pst: snap.pst,
            percent: shareOf(snap.votes, candidate, 0) * 100,
          })),
          mark.pst,
          nationalNow[candidate],
        );
        const key = "inclinacao-crua";
        const entry = (models[key] as {
          path: Record<string, number | null>;
          destination: Record<string, number | null>;
          horizons: Record<string, Record<number, number | null>>;
          finish: Record<string, number | null>;
          curve: Record<string, { pst: number; percent: number }[]>;
        }) ?? {
          path: {},
          destination: {},
          horizons: {},
          finish: {},
          curve: {},
        };
        if (!slope) {
          entry.path[candidate] = null;
          entry.destination[candidate] = null;
          entry.horizons[candidate] = {};
          entry.finish[candidate] = null;
          entry.curve[candidate] = [];
        } else {
          const curve: Curve[] = [
            { pst: mark.pst, percent: { "13": nationalNow["13"], "22": nationalNow["22"], [candidate]: nationalNow[candidate] } },
            { pst: 100, percent: { "13": 0, "22": 0, [candidate]: slope.finish } },
          ];
          curve[0] = { pst: mark.pst, percent: { ...nationalNow, [candidate]: nationalNow[candidate] } };
          const scored = scoreCurve(curve, later, finalSnap, {
            "13": slope.finish,
            "22": slope.finish,
          });
          entry.path[candidate] = scored.path[candidate];
          entry.destination[candidate] = scored.destination[candidate];
          entry.horizons[candidate] = scoreHorizons(curve, mark.pst, later)[candidate];
          entry.finish[candidate] = roundTo(slope.finish, 2);
          entry.curve[candidate] = [
            { pst: roundTo(mark.pst, 2), percent: roundTo(nationalNow[candidate], 2) },
            { pst: 100, percent: roundTo(slope.finish, 2) },
          ];
        }
        models[key] = entry;
      }

      if (stateModels) {
        const built = {
          regiao: estimates(states, sections[round], mark.at, regionPriorOnly),
          priori: estimates(states, sections[round], mark.at, (row, region) => {
            return firstFinal.get(row.id) ?? region;
          }),
        };

        const learned = persistenceBeta(states, mark.at);
        const pace = paceGamma(states, mark.at);
        const specs = [
          { id: "reta-nowcast", model: built.regiao, kind: "reta" as const },
          { id: "hiperbole-ritmo", model: built.regiao, kind: "ritmo" as const },
          { id: "derivada-fim", model: built.regiao, kind: "derivada" as const },
          { id: "derivada-persistencia", model: built.regiao, kind: "persistencia" as const },
          { id: "mistura-recente", model: built.regiao, kind: "mistura" as const },
          { id: "derivada-ritmo", model: built.regiao, kind: "ritmo-muda" as const },
          { id: "derivada-regiao", model: built.regiao, kind: "regiao" as const },
        ];

        for (const spec of specs) {
          if (spec.model.finish["13"] == null || spec.model.finish["22"] == null) continue;
          const raw =
            spec.kind === "reta"
              ? straight(mark.pst, spec.model.level as Record<CandidateId, number>, {
                  "13": spec.model.finish["13"],
                  "22": spec.model.finish["22"],
                })
              : spec.kind === "ritmo"
                ? finishByPace(spec.model)
                : spec.kind === "mistura"
                  ? finishByMarginal(spec.model)
                  : spec.kind === "ritmo-muda"
                    ? finishByDerivative(withPaceChange(spec.model, pace.gamma), "full")
                    : spec.kind === "regiao"
                      ? finishByRegion(spec.model, states, mark.at)
                : spec.kind === "esperada"
                  ? finishExpected(spec.model)
                  : finishByDerivative(
                      spec.model,
                      spec.kind === "decaimento"
                        ? "decay"
                        : spec.kind === "janela"
                          ? "window"
                          : "full",
                      spec.kind === "persistencia" ? learned.beta : 1,
                    );
          const level = spec.model.level;
          const curved = anchor(raw, mark.pst, nationalNow, level);
          const finish = {
            "13": curved[curved.length - 1]?.percent["13"] ?? nationalNow["13"],
            "22": curved[curved.length - 1]?.percent["22"] ?? nationalNow["22"],
          };
          if (spec.kind === "reta") {
            curved[0] = { pst: mark.pst, percent: nationalNow };
            const end = curved[curved.length - 1];
            const shifted = {
              "13": (spec.model.finish["13"] ?? 0) + (nationalNow["13"] - (level["13"] ?? nationalNow["13"])),
              "22": (spec.model.finish["22"] ?? 0) + (nationalNow["22"] - (level["22"] ?? nationalNow["22"])),
            };
            if (end) end.percent = shifted;
            finish["13"] = shifted["13"];
            finish["22"] = shifted["22"];
          }
          const scored = scoreCurve(curved, later, finalSnap, finish);
          models[spec.id] = {
            path: scored.path,
            destination: scored.destination,
            horizons: scoreHorizons(curved, mark.pst, later),
            finish: { "13": roundTo(finish["13"], 2), "22": roundTo(finish["22"], 2) },
            curve: {
              "13": thin(curved).map((point) => ({ pst: point.pst, percent: point.percent["13"] })),
              "22": thin(curved).map((point) => ({ pst: point.pst, percent: point.percent["22"] })),
            },
            gap: level["13"] == null ? null : roundTo(nationalNow["13"] - level["13"], 2),
            beta: roundTo(learned.beta, 3),
            pairs: learned.pairs,
            gamma: roundTo(pace.gamma, 3),
            pacePairs: pace.pairs,
          };
        }
      }

      marks.push({
        target,
        pst: roundTo(mark.pst, 2),
        lula: roundTo(nationalNow["13"], 2),
        flavio: roundTo(nationalNow["22"], 2),
        later: later.length,
        models,
      });
    }

    output[round] = {
      final: {
        pst: roundTo(finalSnap.pst, 2),
        lula: roundTo(shareOf(finalSnap.votes, "13", 0) * 100, 2),
        flavio: roundTo(shareOf(finalSnap.votes, "22", 0) * 100, 2),
      },
      actual: national
        .filter((snap) => snap.pst > 1e-9)
        .map((snap) => ({
          pst: roundTo(snap.pst, 2),
          lula: roundTo(shareOf(snap.votes, "13", 0) * 100, 2),
          flavio: roundTo(shareOf(snap.votes, "22", 0) * 100, 2),
        })),
      marks,
      sections: sections[round].size,
    };
  }

  const file = join(tmpdir(), "curve-backtest.json");
  writeFileSync(file, JSON.stringify(output));
  console.log(file);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
