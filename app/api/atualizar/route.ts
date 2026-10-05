import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/auth";
import { isStateId, type StateId } from "@/lib/labels";
import {
  races,
  resolveElectionRounds,
  storageKey,
  type ElectionCodes,
  type RaceConfig,
} from "@/lib/races";
import {
  encodeRegions,
  fetchRegionProgress,
  regionRaceKey,
} from "@/lib/regions";
import { seatsForList } from "@/lib/seats";
import { getRaceCursor, loadSeries, recordSnapshot } from "@/lib/store";
import { fetchRace } from "@/lib/tse";
import { candidatesToStore, governorRunoff } from "@/lib/view";

export const maxDuration = 120;

const UPDATE_BATCH = 20;

type RaceResult = {
  race: string;
  status: "waiting" | "unchanged" | "updated" | "finalized" | "error";
  pst?: number;
  message?: string;
};

function revalidate() {
  revalidateTag("apuracao", "max");
}

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

  const seats = seatsForList(race.id, race.abrangencia);
  const payload =
    race.kind === "list" && seats != null
      ? {
          ...fetched.payload,
          candidates: candidatesToStore(fetched.payload.candidates, seats),
        }
      : fetched.payload;
  await recordSnapshot(key, payload, fetched.etag, {
    history: race.kind === "chart",
  });
  return {
    race: race.id,
    status: "updated",
    pst: fetched.payload.pst,
  };
}

async function updateRegions(electionCode: string): Promise<RaceResult> {
  const key = regionRaceKey(electionCode);
  const cursor = await getRaceCursor(key);
  const fetched = await fetchRegionProgress(electionCode, cursor?.etag ?? null);
  if (fetched.status === "missing") return { race: key, status: "waiting" };
  if (fetched.status === "not-modified") return { race: key, status: "unchanged" };
  if (fetched.status === "error") {
    return { race: key, status: "error", message: fetched.message };
  }
  await recordSnapshot(
    key,
    {
      pst: 0,
      finalized: false,
      sourceUpdatedAt: null,
      candidates: encodeRegions(fetched.regions),
    },
    fetched.etag,
    { history: false },
  );
  return { race: key, status: "updated" };
}

async function updateBatch(configs: RaceConfig[], results: RaceResult[]) {
  for (let index = 0; index < configs.length; index += UPDATE_BATCH) {
    const batch = configs.slice(index, index + UPDATE_BATCH);
    const batchResults = await Promise.all(batch.map((race) => updateRace(race)));
    results.push(...batchResults);
    if (batchResults.some((result) => result.status === "updated")) revalidate();
  }
}

async function runoffStates(codes: ElectionCodes): Promise<StateId[]> {
  const governors = races(codes, { includeLists: false }).filter((race) =>
    race.id.startsWith("governador-"),
  );
  const { states } = await loadSeries(governors.map(storageKey));
  const ids: StateId[] = [];
  for (const race of governors) {
    const stored = states.find((item) => item.race === storageKey(race));
    if (!stored || !isStateId(race.abrangencia)) continue;
    const runoff = governorRunoff({
      available: true,
      finalized: stored.finalized,
      roster: stored.candidates,
    });
    if (runoff === "yes") ids.push(race.abrangencia);
  }
  return ids;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rounds = resolveElectionRounds();

  const results: RaceResult[] = [];
  await updateBatch(races(rounds.first), results);
  const regions = await updateRegions(rounds.first.federal);
  results.push(regions);
  if (regions.status === "updated") revalidate();

  if (rounds.second) {
    const probe = races(rounds.second, {
      includeLists: false,
      governors: [],
    }).find((race) => race.id === "presidente");
    if (probe) {
      const probed = await updateRace(probe);
      results.push(probed);
      if (probed.status === "updated") revalidate();
      const opened =
        probed.status === "updated" ||
        probed.status === "unchanged" ||
        probed.status === "finalized";
      if (opened) {
        const runoff = await runoffStates(rounds.first);
        const rest = races(rounds.second, {
          includeLists: false,
          governors: runoff,
        }).filter((race) => race.id !== "presidente");
        await updateBatch(rest, results);
        const secondRegions = await updateRegions(rounds.second.federal);
        results.push(secondRegions);
        if (secondRegions.status === "updated") revalidate();
      }
    }
  }

  const errors = results.filter((result) => result.status === "error");
  if (errors.length > 0) {
    return Response.json({ ok: false, results });
  }
  return Response.json({ ok: true, results });
}
