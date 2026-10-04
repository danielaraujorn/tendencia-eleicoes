import type { Candidate } from "./types";
import { raceUrl, type RaceConfig } from "./races";

export type ParsedRace = {
  pst: number;
  finalized: boolean;
  sourceUpdatedAt: string | null;
  candidates: Candidate[];
};

type TseCandidate = {
  n?: string;
  sqcand?: string;
  nm?: string;
  nmu?: string;
  vap?: string;
  pvap?: string;
  pvapn?: string;
  seq?: string;
  dvt?: string;
};

type TseFile = {
  and?: string;
  dg?: string;
  hg?: string;
  dt?: string;
  ht?: string;
  s?: { pst?: string; pstn?: string };
  carg?: {
    agr?: {
      par?: {
        sg?: string;
        cand?: TseCandidate[];
      }[];
    }[];
  }[];
};

export function parseTseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  if (trimmed.includes(",") && trimmed.includes(".")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return Number(trimmed.replace(",", "."));
}

export function parseTsePayload(data: TseFile): ParsedRace {
  const pst = parseTseNumber(data.s?.pstn ?? data.s?.pst);
  if (!Number.isFinite(pst)) {
    throw new Error("Arquivo do TSE sem percentual de seções apuradas");
  }

  const byId = new Map<string, Candidate>();
  for (const cargo of data.carg ?? []) {
    for (const group of cargo.agr ?? []) {
      for (const party of group.par ?? []) {
        for (const candidate of party.cand ?? []) {
          const percent = parseTseNumber(
            candidate.pvapn ?? candidate.pvap ?? "0",
          );
          const votes = parseTseNumber(candidate.vap ?? "0");
          const id = candidate.sqcand || candidate.n;
          if (!id || !Number.isFinite(percent)) continue;
          byId.set(id, {
            id,
            number: candidate.n ?? "",
            name: (candidate.nmu || candidate.nm || "Candidato").trim(),
            party: (party.sg ?? "").trim(),
            votes: Number.isFinite(votes) ? votes : 0,
            percent,
            seq: parseTseNumber(candidate.seq ?? "0") || 0,
            destination: candidate.dvt ?? "",
          });
        }
      }
    }
  }

  const date = data.dt || data.dg;
  const time = data.ht || data.hg;

  return {
    pst,
    finalized:
      (typeof data.and === "string" && data.and.trim().toLowerCase() === "f") ||
      pst >= 100 - 1e-6,
    sourceUpdatedAt: date && time ? `${date} ${time}` : date ?? null,
    candidates: [...byId.values()],
  };
}

export type FetchResult =
  | { status: "not-modified" }
  | { status: "missing" }
  | { status: "ok"; etag: string | null; payload: ParsedRace }
  | { status: "error"; message: string };

export async function fetchRace(
  race: RaceConfig,
  etag: string | null,
): Promise<FetchResult> {
  try {
    const response = await fetch(raceUrl(race), {
      headers: etag ? { "If-None-Match": etag } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 404) return { status: "missing" };
    if (response.status === 304) return { status: "not-modified" };
    if (!response.ok) {
      return {
        status: "error",
        message: `${race.id} respondeu HTTP ${response.status}`,
      };
    }

    const payload = parseTsePayload((await response.json()) as TseFile);
    return {
      status: "ok",
      etag: response.headers.get("etag"),
      payload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    return { status: "error", message: `${race.id}: ${message}` };
  }
}
