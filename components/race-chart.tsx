"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colorFor } from "@/lib/colors";
import { formatPercent } from "@/lib/format";
import { trendCurve } from "@/lib/trend";
import type { RaceView } from "@/lib/types";

export function chartRows(view: RaceView) {
  const rows = view.points.map((point) => {
    const row: Record<string, number | null> = { pst: point.pst };
    for (const candidate of view.top) {
      row[candidate.id] = point.percents[candidate.id] ?? null;
      row[`${candidate.id}__trend`] = null;
    }
    return row;
  });

  if (view.trends.length === 0 || rows.length === 0) return rows;

  const last = rows[rows.length - 1];
  const currentPst = Number(last.pst);
  for (const trend of view.trends) {
    last[`${trend.id}__trend`] = last[trend.id] ?? null;
  }

  const curves = view.trends.flatMap((trend) => {
    const current = last[trend.id];
    if (typeof current !== "number") return [];
    return [
      {
        id: trend.id,
        points: trendCurve(currentPst, current, trend.marginal),
      },
    ];
  });
  const samples = curves[0]?.points.length ?? 0;
  for (let index = 0; index < samples; index += 1) {
    const row: Record<string, number | null> = {
      pst: curves[0]?.points[index]?.pst ?? currentPst,
    };
    for (const candidate of view.top) {
      row[candidate.id] = null;
      row[`${candidate.id}__trend`] =
        curves.find((curve) => curve.id === candidate.id)?.points[index]
          ?.percent ?? null;
    }
    rows.push(row);
  }
  return rows;
}

function yDomain(rows: Record<string, number | null>[]) {
  const values = rows.flatMap((row) =>
    Object.entries(row)
      .filter(([key, value]) => key !== "pst" && typeof value === "number")
      .map(([, value]) => value as number),
  );
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  return [min - span * 0.15, max + span * 0.15];
}

export function RaceChart({
  view,
  rows,
  ids,
}: {
  view: RaceView;
  rows: Record<string, number | null>[];
  ids: string[];
}) {
  if (rows.length === 0) return null;
  const domain = yDomain(rows);

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6dfd2" vertical={false} />
          <XAxis
            dataKey="pst"
            type="number"
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            stroke="#8a8175"
            tick={{ fill: "#5c564c", fontSize: 12 }}
          />
          <YAxis
            domain={domain}
            tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
            stroke="#8a8175"
            tick={{ fill: "#5c564c", fontSize: 12 }}
            width={42}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = payload.filter(
                (item) =>
                  !String(item.dataKey).endsWith("__trend") &&
                  typeof item.value === "number",
              );
              if (items.length === 0) return null;
              return (
                <div className="tooltip">
                  <p>{formatPercent(Number(label))} apurado</p>
                  <ul>
                    {items.map((item) => (
                      <li key={String(item.dataKey)}>
                        <span style={{ background: item.color }} />
                        {item.name}: {formatPercent(Number(item.value))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          />
          {view.top.map((candidate) => (
            <Line
              key={candidate.id}
              type="monotone"
              dataKey={candidate.id}
              name={candidate.name}
              stroke={colorFor(candidate.id, ids, candidate.number)}
              strokeWidth={2.4}
              dot={rows.length < 8}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {view.top.map((candidate) => (
            <Line
              key={`${candidate.id}-trend`}
              type="linear"
              dataKey={`${candidate.id}__trend`}
              stroke={colorFor(candidate.id, ids, candidate.number)}
              strokeWidth={1.6}
              strokeDasharray="6 5"
              dot={false}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
