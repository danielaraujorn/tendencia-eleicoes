const HALF_LIFE_PST = 8;
const MIN_POINTS = 3;
const MIN_PST = 5;
const MAX_PST = 99.9;
const MIN_SPAN = 2;

export type VotePoint = { pst: number; votes: number };
export type ValidTotal = { pst: number; validVotes: number };

export function trendAt(
  pst: number,
  currentPst: number,
  currentPercent: number,
  marginal: number,
) {
  const x = pst / 100;
  const p = currentPst / 100;
  if (!(x > 0)) return currentPercent;
  return (p / x) * currentPercent + (1 - p / x) * marginal;
}

export function trendCurve(
  currentPst: number,
  currentPercent: number,
  marginal: number,
  steps = 16,
) {
  const curve: { pst: number; percent: number }[] = [];
  for (let step = 1; step <= steps; step += 1) {
    const pst =
      step === steps
        ? 100
        : currentPst + ((100 - currentPst) * step) / steps;
    curve.push({
      pst,
      percent: trendAt(pst, currentPst, currentPercent, marginal),
    });
  }
  return curve;
}

export function projectPercent(candidate: VotePoint[], totals: ValidTotal[]) {
  if (candidate.length < MIN_POINTS) return null;

  const rows = [...candidate]
    .sort((a, b) => a.pst - b.pst)
    .flatMap((point) => {
      const validVotes = totals.find(
        (total) => Math.abs(total.pst - point.pst) < 1e-6,
      )?.validVotes;
      if (validVotes === undefined) return [];
      return [{ pst: point.pst, votes: point.votes, validVotes }];
    });

  const last = rows[rows.length - 1];
  if (!last || rows.length < MIN_POINTS) return null;
  if (last.pst < MIN_PST || last.pst >= MAX_PST) return null;
  if (!(last.validVotes > 0)) return null;

  let weightedVotes = 0;
  let weightedTotal = 0;
  let spanStart: number | null = null;
  let spanEnd: number | null = null;

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) continue;
    const voteDelta = current.votes - previous.votes;
    const totalDelta = current.validVotes - previous.validVotes;
    if (!(totalDelta > 0)) continue;
    const age = last.pst - current.pst;
    const weight = Math.exp((-Math.LN2 * age) / HALF_LIFE_PST);
    weightedVotes += weight * voteDelta;
    weightedTotal += weight * totalDelta;
    if (spanStart === null) spanStart = previous.pst;
    spanEnd = current.pst;
  }

  if (
    spanStart === null ||
    spanEnd === null ||
    spanEnd - spanStart < MIN_SPAN ||
    !(weightedTotal > 0)
  ) {
    return null;
  }

  const marginal = (100 * weightedVotes) / weightedTotal;
  const currentPercent = (100 * last.votes) / last.validVotes;
  const projected = trendAt(100, last.pst, currentPercent, marginal);
  if (!Number.isFinite(projected) || !Number.isFinite(marginal)) return null;
  return { projected, marginal };
}
