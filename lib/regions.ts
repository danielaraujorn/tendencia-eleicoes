import { REGIONS, presidentStateId } from "./labels";
import { tseBase } from "./races";
import { parseTseNumber } from "./tse";
import type { Candidate, RaceView, RegionView } from "./types";

export { REGIONS };

export function regionRaceKey(electionCode: string) {
  return `regioes:${electionCode}`;
}

export function regionUrl(electionCode: string) {
  const code = electionCode.padStart(6, "0");
  return `${tseBase()}/ele2026/${electionCode}/dados/br/br-e${code}-ab.json`;
}

type ProgressFile = {
  abr?: {
    tpabr?: string;
    cdabr?: string;
    s?: { st?: unknown; ts?: unknown };
  }[];
};

export function regionProgress(data: ProgressFile): RegionView[] {
  const byState = new Map<string, { counted: number; total: number }>();
  for (const item of data.abr ?? []) {
    if ((item.tpabr ?? "").toLowerCase() !== "uf" || !item.cdabr) continue;
    const counted = parseTseNumber(item.s?.st);
    const total = parseTseNumber(item.s?.ts);
    if (!Number.isFinite(counted) || !Number.isFinite(total) || total <= 0) continue;
    byState.set(item.cdabr.toLowerCase(), { counted, total });
  }

  return REGIONS.map((region) => {
    let counted = 0;
    let total = 0;
    for (const state of region.states) {
      const row = byState.get(state);
      if (!row) return { id: region.id, label: region.label, pst: null };
      counted += row.counted;
      total += row.total;
    }
    return {
      id: region.id,
      label: region.label,
      pst: total > 0 ? (counted / total) * 100 : null,
    };
  });
}

export function encodeRegions(regions: RegionView[]): Candidate[] {
  return regions.map((region, index) => ({
    id: region.id,
    number: "",
    name: region.label,
    party: "",
    votes: 0,
    percent: region.pst ?? -1,
    seq: index,
    destination: "regiao",
  }));
}

export function decodeRegions(candidates: Candidate[]): RegionView[] {
  return candidates
    .filter((candidate) => candidate.destination === "regiao")
    .sort((a, b) => a.seq - b.seq)
    .map((candidate) => ({
      id: candidate.id,
      label: candidate.name,
      pst: candidate.percent < 0 ? null : candidate.percent,
    }));
}

export type RegionShare = {
  id: string;
  number: string;
  name: string;
  percent: number;
};

export type RegionBallot = {
  id: string;
  label: string;
  pst: number | null;
  shares: RegionShare[];
  lagging: boolean;
};

function countedVotes(view: RaceView | undefined) {
  if (!view?.available || view.zeroed) return [];
  return view.top.filter(
    (candidate) =>
      candidate.number &&
      candidate.destination !== "regiao" &&
      (!candidate.destination || candidate.destination === "Válido") &&
      Number.isFinite(candidate.votes),
  );
}

export function regionBallots(
  regions: RegionView[],
  races: Record<string, RaceView> | undefined,
  national: RaceView | null | undefined,
): { rows: RegionBallot[]; note: string | null } {
  const pair =
    national?.available && !national.zeroed
      ? national.top.slice(0, 2).filter((candidate) => candidate.number)
      : [];
  const leader = pair[0];
  const runner = pair[1];
  const nationalPst = national?.available && !national.zeroed ? national.pst : null;

  const counted = REGIONS.map((region) => {
    const found = regions.find((item) => item.id === region.id);
    const votes = new Map<string, number>();
    let total = 0;
    if (leader && runner && races) {
      for (const state of region.states) {
        for (const candidate of countedVotes(races[presidentStateId(state)])) {
          votes.set(candidate.number, (votes.get(candidate.number) ?? 0) + candidate.votes);
          total += candidate.votes;
        }
      }
    }
    const shares =
      leader && runner && total > 0
        ? pair.map((candidate) => ({
            id: candidate.id,
            number: candidate.number,
            name: candidate.name,
            percent: ((votes.get(candidate.number) ?? 0) / total) * 100,
          }))
        : [];
    const leaderVotes = leader ? (votes.get(leader.number) ?? 0) : 0;
    const runnerVotes = runner ? (votes.get(runner.number) ?? 0) : 0;
    return {
      id: region.id,
      label: region.label,
      pst: found?.pst ?? null,
      shares,
      runnerAhead: total > 0 && runnerVotes > leaderVotes,
    };
  });

  const lagging = counted
    .filter(
      (row) =>
        row.runnerAhead &&
        row.pst != null &&
        nationalPst != null &&
        row.pst < nationalPst - 1e-9,
    )
    .sort((a, b) => (a.pst ?? 0) - (b.pst ?? 0) || a.label.localeCompare(b.label, "pt-BR"))[0];

  return {
    rows: counted.map((row) => ({
      id: row.id,
      label: row.label,
      pst: row.pst,
      shares: row.shares,
      lagging: lagging?.id === row.id,
    })),
    note:
      lagging && runner
        ? `O ${lagging.label} está atrás na apuração e puxa para ${runner.name}.`
        : null,
  };
}

export type RegionFetch =
  | { status: "not-modified" }
  | { status: "missing" }
  | { status: "ok"; etag: string | null; regions: RegionView[] }
  | { status: "error"; message: string };

export async function fetchRegionProgress(
  electionCode: string,
  etag: string | null,
): Promise<RegionFetch> {
  try {
    const response = await fetch(regionUrl(electionCode), {
      headers: etag ? { "If-None-Match": etag } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return { status: "missing" };
    if (response.status === 304) return { status: "not-modified" };
    if (!response.ok) {
      return {
        status: "error",
        message: `regiões ${electionCode} respondeu HTTP ${response.status}`,
      };
    }
    const regions = regionProgress((await response.json()) as ProgressFile);
    return { status: "ok", etag: response.headers.get("etag"), regions };
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    return { status: "error", message: `regiões ${electionCode}: ${message}` };
  }
}
