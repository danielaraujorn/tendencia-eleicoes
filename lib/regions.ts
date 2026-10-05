import { REGIONS } from "./labels";
import { tseBase } from "./races";
import { parseTseNumber } from "./tse";
import type { Candidate, RegionView } from "./types";

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
