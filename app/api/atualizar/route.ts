import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/auth";
import {
  ElectionConfigError,
  races,
  resolveElectionCodes,
  storageKey,
  type RaceConfig,
} from "@/lib/races";
import { getRaceCursor, recordSnapshot } from "@/lib/store";
import { fetchRace } from "@/lib/tse";
import { rankedCandidates } from "@/lib/view";

export const maxDuration = 30;

const UPDATE_BATCH = 20;

type RaceResult = {
  race: string;
  status: "waiting" | "unchanged" | "updated" | "finalized" | "error";
  pst?: number;
  message?: string;
};

async function updateRace(race: RaceConfig): Promise<RaceResult> {
  const key = storageKey(race);
  const cursor = await getRaceCursor(key);
  if (cursor?.finalized) return { race: race.id, status: "finalized" };

  const fetched = await fetchRace(race, cursor?.etag ?? null);
  if (fetched.status === "missing") return { race: race.id, status: "waiting" };
  if (fetched.status === "not-modified") {
    return { race: race.id, status: "unchanged" };
  }
  if (fetched.status === "error") {
    return { race: race.id, status: "error", message: fetched.message };
  }

  const payload =
    race.kind === "list"
      ? { ...fetched.payload, candidates: rankedCandidates(fetched.payload.candidates) }
      : fetched.payload;
  const wrote = await recordSnapshot(key, payload, fetched.etag, {
    history: race.kind === "chart",
  });
  return {
    race: race.id,
    status: wrote || race.kind === "list" ? "updated" : "unchanged",
    pst: fetched.payload.pst,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let configs;
  try {
    configs = races(await resolveElectionCodes());
  } catch (error) {
    if (error instanceof ElectionConfigError) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    throw error;
  }

  const results: RaceResult[] = [];
  for (let index = 0; index < configs.length; index += UPDATE_BATCH) {
    const batch = configs.slice(index, index + UPDATE_BATCH);
    results.push(...(await Promise.all(batch.map((race) => updateRace(race)))));
  }
  const errors = results.filter((result) => result.status === "error");
  if (results.some((result) => result.status === "updated")) {
    revalidateTag("apuracao", "max");
  }

  if (errors.length > 0) {
    return Response.json({ ok: false, results }, { status: 500 });
  }

  return Response.json({ ok: true, results });
}
