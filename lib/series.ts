import { cacheLife, cacheTag } from "next/cache";
import { decodeRegions, regionRaceKey } from "./regions";
import { dataSource, races, resolveElectionRounds, storageKey } from "./races";
import { loadSeries } from "./store";
import { buildApuracao } from "./view";

export async function getCachedApuracao() {
  "use cache";
  cacheTag("apuracao");
  cacheLife({
    stale: 30,
    revalidate: 30,
    expire: 60 * 60 * 24 * 30,
  });

  const rounds = resolveElectionRounds();
  const first = races(rounds.first);
  const second = rounds.second
    ? races(rounds.second, { includeLists: false })
    : [];
  const regionKeys = [regionRaceKey(rounds.first.federal)];
  if (rounds.second) regionKeys.push(regionRaceKey(rounds.second.federal));
  const { states, history } = await loadSeries([
    ...first.map(storageKey),
    ...second.map(storageKey),
    ...regionKeys,
  ]);
  const byRace = new Map(states.map((state) => [state.race, state]));

  return buildApuracao(
    {
      first,
      second,
      regions: {
        "1": decodeRegions(byRace.get(regionKeys[0] ?? "")?.candidates ?? []),
        "2": regionKeys[1]
          ? decodeRegions(byRace.get(regionKeys[1])?.candidates ?? [])
          : [],
      },
    },
    states.filter((state) => !state.race.startsWith("regioes:")),
    history.filter((point) => !point.race.startsWith("regioes:")),
    dataSource(),
  );
}
