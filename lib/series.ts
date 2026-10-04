import { cacheLife, cacheTag } from "next/cache";
import { dataSource, races, resolveElectionCodes, storageKey } from "./races";
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

  const configs = races(await resolveElectionCodes());
  const { states, history } = await loadSeries(configs.map(storageKey));
  return buildApuracao(configs, states, history, dataSource());
}
