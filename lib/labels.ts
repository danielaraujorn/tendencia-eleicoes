export const PRESIDENT_ID = "presidente";

export const STATE_OPTIONS = [
  { id: "ac", label: "Acre" },
  { id: "al", label: "Alagoas" },
  { id: "ap", label: "Amapá" },
  { id: "am", label: "Amazonas" },
  { id: "ba", label: "Bahia" },
  { id: "ce", label: "Ceará" },
  { id: "df", label: "Distrito Federal" },
  { id: "es", label: "Espírito Santo" },
  { id: "go", label: "Goiás" },
  { id: "ma", label: "Maranhão" },
  { id: "mt", label: "Mato Grosso" },
  { id: "ms", label: "Mato Grosso do Sul" },
  { id: "mg", label: "Minas Gerais" },
  { id: "pa", label: "Pará" },
  { id: "pb", label: "Paraíba" },
  { id: "pr", label: "Paraná" },
  { id: "pe", label: "Pernambuco" },
  { id: "pi", label: "Piauí" },
  { id: "rj", label: "Rio de Janeiro" },
  { id: "rn", label: "Rio Grande do Norte" },
  { id: "rs", label: "Rio Grande do Sul" },
  { id: "ro", label: "Rondônia" },
  { id: "rr", label: "Roraima" },
  { id: "sc", label: "Santa Catarina" },
  { id: "sp", label: "São Paulo" },
  { id: "se", label: "Sergipe" },
  { id: "to", label: "Tocantins" },
] as const;

export type StateId = (typeof STATE_OPTIONS)[number]["id"];

export const DEFAULT_STATE: StateId = "rn";

export const STATE_COOKIE = "estado";

export const STATE_HEADER = "x-estado";

const STATE_IDS: ReadonlySet<string> = new Set(
  STATE_OPTIONS.map((state) => state.id),
);

export function isStateId(value: string | null | undefined): value is StateId {
  return typeof value === "string" && STATE_IDS.has(value);
}

export function stateFromCookie(value: string | null | undefined): StateId {
  return isStateId(value) ? value : DEFAULT_STATE;
}

export const LIST_OFFICES = [
  { id: "senador", title: "Senador" },
  { id: "deputado-federal", title: "Deputado Federal" },
  { id: "deputado-estadual", title: "Deputado Estadual" },
] as const;

export type ListOfficeId = (typeof LIST_OFFICES)[number]["id"];

export function stateRaceId(
  office: "governador" | ListOfficeId,
  state: StateId,
) {
  return `${office}-${state}`;
}
