const FIXED_NUMBER_COLORS: Record<string, string> = {
  "10": "#e6b000",
  "13": "#C0122D",
  "22": "#30306C",
  "44": "#0011ff",
  "70": "#1d4ed8",
  "80": "#141414",
};

const PALETTE = [
  "#9a3412",
  "#1d4e89",
  "#0f766e",
  "#a16207",
  "#6d28d9",
  "#be185d",
  "#0e7490",
  "#c2410c",
  "#4d7c0f",
  "#7c2d12",
];

export function colorFor(id: string, ids: string[], number = "") {
  const fixed = FIXED_NUMBER_COLORS[number.trim()];
  if (fixed) return fixed;
  const index = [...ids].sort().indexOf(id);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}
