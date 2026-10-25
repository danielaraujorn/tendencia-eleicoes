"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colorFor } from "@/lib/colors";
import { formatArrival, formatPercent } from "@/lib/format";
import type { RaceView } from "@/lib/types";

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

const PLOTTED_CANDIDATES = 2;

function plottedCandidates(view: RaceView) {
  return view.top.slice(0, PLOTTED_CANDIDATES);
}

export function chartRows(view: RaceView) {
  const plotted = plottedCandidates(view);
  const rows = view.points.map((point) => {
    const row: Record<string, number | null> = {
      pst: point.pst,
    };
    for (const candidate of plotted) {
      const percent = point.percents[candidate.id];
      row[candidate.id] =
        typeof percent === "number"
          ? clampPercent(percent)
          : null;
      row[`${candidate.id}__trend`] = null;
    }
    return row;
  });

  if (view.trends.length === 0 || rows.length === 0)
    return rows;

  const last = rows[rows.length - 1];
  for (const candidate of plotted) {
    const trend = view.trends.find(
      (item) => item.id === candidate.id,
    );
    if (!trend) continue;
    last[`${trend.id}__trend`] = last[trend.id] ?? null;
  }

  const end: Record<string, number | null> = { pst: 100 };
  for (const candidate of plotted) {
    end[candidate.id] = null;
    const projected = view.trends.find(
      (trend) => trend.id === candidate.id,
    )?.projected;
    end[`${candidate.id}__trend`] =
      typeof projected === "number"
        ? clampPercent(projected)
        : null;
  }
  rows.push(end);
  return rows;
}

type TooltipEntry = {
  dataKey?: unknown;
  value?: unknown;
};

export function tooltipItems<T extends TooltipEntry>(
  payload: readonly T[],
) {
  const numeric = (item: T, trend: boolean) => {
    if (!item.dataKey) return false;
    const key = String(item.dataKey);
    if (key.endsWith("__trend") !== trend) return false;
    return typeof item.value === "number";
  };
  const solid = payload.filter((item) =>
    numeric(item, false),
  );
  if (solid.length > 0) return solid;
  return payload.filter((item) => numeric(item, true));
}

function useNarrowScreen() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(max-width: 720px)");
      query.addEventListener("change", onChange);
      return () =>
        query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 720px)").matches,
    () => false,
  );
}

const X_CEILINGS = [1, 2, 5];
const TREND_AXIS_PST = 5;

export function xDomain(lastPst: number, hasTrend: boolean) {
  if (hasTrend || lastPst >= TREND_AXIS_PST - 1e-9) return [0, 100] as const;
  const ceiling =
    X_CEILINGS.find((edge) => lastPst <= edge + 1e-9) ?? TREND_AXIS_PST;
  return [0, ceiling] as const;
}

export function xTicks(right: number, narrow: boolean) {
  if (right >= 100) {
    return narrow
      ? [0, 25, 50, 75, 100]
      : [0, 20, 40, 60, 80, 100];
  }
  if (right <= 1) return [0, 1];
  if (right <= 2) return [0, 1, 2];
  return narrow ? [0, 2.5, 5] : [0, 1, 2, 3, 4, 5];
}

export function yDomain(
  rows: Record<string, number | null>[],
) {
  const values = rows.flatMap((row) =>
    Object.entries(row)
      .filter(
        ([key, value]) =>
          key !== "pst" && typeof value === "number",
      )
      .map(([, value]) => value as number),
  );
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values, 50);
  const max = Math.max(...values, 50);
  const span = Math.max(max - min, 1);
  return [
    Math.max(0, min - span * 0.15),
    Math.min(100, max + span * 0.15),
  ];
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
  const narrow = useNarrowScreen();
  const crossoverAt = view.crossover?.at ?? null;
  const crossoverReadAt = view.crossover?.readAt ?? null;
  const [crossoverLabel, setCrossoverLabel] = useState("");
  useEffect(() => {
    if (!crossoverAt || !crossoverReadAt) {
      setCrossoverLabel("");
      return;
    }
    setCrossoverLabel(
      formatArrival(
        new Date(crossoverAt),
        new Date(crossoverReadAt),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    );
  }, [crossoverAt, crossoverReadAt]);

  if (rows.length === 0) return null;
  const domain = yDomain(rows);
  const lastPst = view.points[view.points.length - 1]?.pst ?? 0;
  const [xMin, xMax] = xDomain(lastPst, view.trends.length > 0);
  const singleReading = view.points.length === 1;

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{
            top: view.crossover ? 28 : 8,
            right: 8,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid
            stroke="#e6dfd2"
            vertical={false}
          />
          <XAxis
            dataKey="pst"
            type="number"
            domain={[xMin, xMax]}
            ticks={xTicks(xMax, narrow)}
            allowDataOverflow
            tickFormatter={(value) => `${value}%`}
            stroke="#8a8175"
            tick={{
              fill: "#5c564c",
              fontSize: narrow ? 11 : 12,
            }}
          />
          <YAxis
            domain={domain}
            tickFormatter={(value) =>
              `${Number(value).toFixed(0)}%`
            }
            stroke="#8a8175"
            tick={{
              fill: "#5c564c",
              fontSize: narrow ? 11 : 12,
            }}
            width={narrow ? 32 : 42}
          />
          <Tooltip
            allowEscapeViewBox={
              narrow ? { x: false, y: false } : undefined
            }
            wrapperStyle={
              narrow
                ? { maxWidth: "100%", zIndex: 2 }
                : undefined
            }
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = tooltipItems(payload);
              if (items.length === 0) return null;
              return (
                <div className="tooltip">
                  <p>
                    {formatPercent(Number(label))} apurado
                  </p>
                  <ul>
                    {items.map((item) => (
                      <li key={String(item.dataKey)}>
                        <span
                          style={{ background: item.color }}
                        />
                        {item.name}:{" "}
                        {formatPercent(Number(item.value))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          />
          {plottedCandidates(view).map((candidate) => (
            <Line
              key={candidate.id}
              type="monotone"
              dataKey={candidate.id}
              name={candidate.name}
              stroke={colorFor(
                candidate.id,
                ids,
                candidate.number,
              )}
              strokeWidth={3.5}
              dot={singleReading ? { r: 4 } : false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {plottedCandidates(view).map((candidate) => (
            <Line
              key={`${candidate.id}-trend`}
              type="linear"
              dataKey={`${candidate.id}__trend`}
              name={candidate.name}
              stroke={colorFor(
                candidate.id,
                ids,
                candidate.number,
              )}
              strokeWidth={1.6}
              strokeDasharray="6 5"
              dot={false}
              activeDot={false}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          ))}
          {view.crossover ? (
            <ReferenceLine
              x={view.crossover.pst}
              stroke="#9a3412"
              strokeDasharray="3 3"
              label={
                crossoverLabel
                  ? {
                      value: crossoverLabel,
                      position: "top",
                      fill: "#9a3412",
                      fontSize: 12,
                      fontWeight: 700,
                    }
                  : undefined
              }
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
