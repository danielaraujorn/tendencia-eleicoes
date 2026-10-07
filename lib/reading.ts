import { formatGap, formatPercent } from "./format";
import type { RaceView } from "./types";

const WINDOW_PST = 10;
const DIRECTION_EPS = 0.05;

export type AdvantageDirection = "aumentando" | "diminuindo" | "estável";

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function advantageDirection(view: RaceView): AdvantageDirection | null {
  const leader = view.top[0];
  const runner = view.top[1];
  if (!leader || !runner) return null;

  const gaps = view.points.flatMap((point) => {
    const lead = point.percents[leader.id];
    const trail = point.percents[runner.id];
    if (typeof lead !== "number" || typeof trail !== "number") return [];
    return [{ pst: point.pst, gap: lead - trail }];
  });
  if (gaps.length < 2) return null;

  const last = gaps[gaps.length - 1];
  if (!last) return null;
  const window = gaps.filter((point) => point.pst >= last.pst - WINDOW_PST - 1e-9);
  const sample = window.length >= 2 ? window : gaps.slice(-2);
  const first = sample[0];
  const end = sample[sample.length - 1];
  if (!first || !end) return null;

  const delta = end.gap - first.gap;
  if (Math.abs(delta) < DIRECTION_EPS) return "estável";
  return delta > 0 ? "aumentando" : "diminuindo";
}

export function raceReading(view: RaceView) {
  if (!view.available || view.zeroed) return null;
  const leader = view.top[0];
  const runner = view.top[1];
  if (!leader || !runner) return null;

  const leaderTrend = view.trends.find((item) => item.id === leader.id);
  const runnerTrend = view.trends.find((item) => item.id === runner.id);
  const gap = view.gap;
  const direction = advantageDirection(view);

  if (!leaderTrend || !runnerTrend) {
    const advantage = gap == null ? "" : ` A vantagem é de ${formatGap(gap)}`;
    return `${leader.name} tem ${formatPercent(leader.percent)} contra ${formatPercent(runner.percent)}.${advantage}`;
  }

  const projected = [
    { name: leader.name, projected: leaderTrend.projected },
    { name: runner.name, projected: runnerTrend.projected },
  ].sort((a, b) => b.projected - a.projected);
  const ahead = projected[0];
  const behind = projected[1];
  if (!ahead || !behind) return null;

  const current = ahead.name === leader.name ? "A vantagem" : "A vantagem atual";
  const advantage =
    gap == null
      ? ""
      : direction
        ? ` ${current} de ${formatGap(gap)} está ${direction}.`
        : ` ${current} é de ${formatGap(gap)}`;

  return `${ahead.name} tende a ${formatPercent(clampPercent(ahead.projected))} contra ${formatPercent(clampPercent(behind.projected))}.${advantage}`;
}
