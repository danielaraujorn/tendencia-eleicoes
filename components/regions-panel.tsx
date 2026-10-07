import { colorFor } from "@/lib/colors";
import { formatPercent } from "@/lib/format";
import { regionBallots } from "@/lib/regions";
import type { RaceView, RegionView } from "@/lib/types";

export function RegionsPanel({
  regions,
  races,
  national,
}: {
  regions: RegionView[];
  races?: Record<string, RaceView>;
  national?: RaceView | null;
}) {
  const ballot = regionBallots(regions, races, national);
  const ids =
    national?.top
      .slice(0, 2)
      .map((candidate) => candidate.id) ?? [];

  return (
    <aside
      className="regions"
      aria-label="Apuração por região"
    >
      <p className="kicker">Apuração por região</p>
      <ul>
        {ballot.rows.map((region) => (
          <li key={region.id}>
            <div className="region-line">
              <span>{region.label}</span>
              <span>
                {region.pst == null
                  ? "—"
                  : formatPercent(region.pst)}
              </span>
            </div>
            {region.shares.length > 0 ? (
              <p className="region-shares">
                {region.shares.map((share) => (
                  <span key={share.id} title={share.name}>
                    <i
                      style={{
                        background: colorFor(
                          share.id,
                          ids,
                          share.number,
                        ),
                      }}
                    />
                    {formatPercent(share.percent)}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
