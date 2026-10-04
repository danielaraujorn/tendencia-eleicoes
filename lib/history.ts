export const HISTORY_STEP = 0.1;

export function shouldRecordHistory(
  lastPst: number | null,
  nextPst: number,
  finalized: boolean,
) {
  if (lastPst === null) return true;
  if (Math.abs(nextPst - lastPst) >= HISTORY_STEP - 1e-9) return true;
  if (finalized && Math.abs(nextPst - lastPst) > 1e-6) return true;
  return false;
}
