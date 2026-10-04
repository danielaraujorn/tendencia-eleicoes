export const PRESIDENT_ID = "presidente";

export const GOVERNOR_OPTIONS = [
  { id: "governador-rn", label: "Rio Grande do Norte" },
  { id: "governador-sp", label: "São Paulo" },
  { id: "governador-rj", label: "Rio de Janeiro" },
] as const;

export type GovernorId = (typeof GOVERNOR_OPTIONS)[number]["id"];
