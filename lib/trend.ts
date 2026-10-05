const HALF_LIFE_PST = 8;
const MIN_POINTS = 3;
const MIN_PST = 5;
const MAX_PST = 99.9;
const WINDOW_PST = 10;

export type PercentPoint = { pst: number; percent: number };

function fitSlope(rows: PercentPoint[]) {
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const row of rows) {
    sumX += row.pst;
    sumY += row.percent;
    sumXY += row.pst * row.percent;
    sumX2 += row.pst * row.pst;
  }
  const n = rows.length;
  const denom = n * sumX2 - sumX * sumX;
  if (!(Math.abs(denom) > 1e-9)) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  if (!Number.isFinite(slope)) return null;
  return slope;
}

function dampToFinish(last: PercentPoint, slope: number) {
  const projected = last.percent + ((last.pst * (100 - last.pst)) / 100) * slope;
  if (!Number.isFinite(projected)) return null;
  return projected;
}

export function projectPercent(points: PercentPoint[]) {
  if (points.length < MIN_POINTS) return null;

  const rows = [...points].sort((a, b) => a.pst - b.pst);
  const last = rows[rows.length - 1];
  if (!last || last.pst < MIN_PST || last.pst >= MAX_PST) return null;

  const window = rows.filter((row) => row.pst >= last.pst - WINDOW_PST - 1e-9);
  // Um salto maior que a janela (a apuração nacional) deixa uma leitura só.
  // As últimas leituras seguem a direção recente; a série inteira puxa o começo da noite.
  const sample = window.length >= MIN_POINTS ? window : rows.slice(-MIN_POINTS);
  const slope = fitSlope(sample);
  if (slope === null) return null;
  // A inclinação recente descreve a mistura das seções que faltam.
  // Esticar a mesma reta até 100% exagera o movimento no começo da noite.
  return dampToFinish(last, slope);
}

export function crossoverPst(
  currentPst: number,
  percentA: number,
  projectedA: number,
  percentB: number,
  projectedB: number,
) {
  const riseGap = projectedA - percentA - (projectedB - percentB);
  if (!(Math.abs(riseGap) > 1e-9)) return null;
  if (!(currentPst > 0) || !(currentPst < 100)) return null;
  const pst = currentPst + ((percentB - percentA) * (100 - currentPst)) / riseGap;
  if (!Number.isFinite(pst)) return null;
  if (!(pst > currentPst + 1e-6) || pst > 100 + 1e-6) return null;
  if (pst > 100 - 1e-6) return 100;
  return pst;
}

export type PacePoint = { pst: number; at: Date };

export function arrivalAt(
  points: PacePoint[],
  currentPst: number,
  targetPst: number,
  latestAt: Date,
) {
  if (!(targetPst > currentPst) || Number.isNaN(latestAt.getTime())) return null;

  const rows = points
    .filter((point) => Number.isFinite(point.pst) && !Number.isNaN(point.at.getTime()))
    .sort((a, b) => a.pst - b.pst || a.at.getTime() - b.at.getTime());

  let weightedPst = 0;
  let weightedMs = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) continue;
    const pstDelta = current.pst - previous.pst;
    const timeDelta = current.at.getTime() - previous.at.getTime();
    if (!(pstDelta > 0) || !(timeDelta > 0)) continue;
    const age = currentPst - current.pst;
    const weight = Math.exp((-Math.LN2 * age) / HALF_LIFE_PST);
    weightedPst += weight * pstDelta;
    weightedMs += weight * timeDelta;
  }

  if (!(weightedPst > 0) || !(weightedMs > 0)) return null;
  const eta = new Date(latestAt.getTime() + (targetPst - currentPst) / (weightedPst / weightedMs));
  if (!Number.isFinite(eta.getTime()) || eta.getTime() < latestAt.getTime()) return null;
  return eta;
}
