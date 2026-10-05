import { formatPercent } from "@/lib/format";
import { REGIONS } from "@/lib/labels";
import type { RegionView } from "@/lib/types";

export function RegionsPanel({
  regions,
}: {
  regions: RegionView[];
}) {
  const rows = REGIONS.map((region) => {
    const found = regions.find(
      (item) => item.id === region.id,
    );
    return {
      id: region.id,
      label: region.label,
      pst: found?.pst ?? null,
    };
  });

  return (
    <aside
      className="regions"
      aria-label="Apuração por região"
    >
      <p className="kicker">Apuração por região</p>
      <ul>
        {rows.map((region) => (
          <li key={region.id}>
            <span>{region.label}</span>
            <span>
              {region.pst == null
                ? "—"
                : formatPercent(region.pst)}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
