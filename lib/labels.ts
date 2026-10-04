export const PRESIDENT_ID = "presidente";

export const STATE_OPTIONS = [
  { id: "rn", label: "Rio Grande do Norte" },
  { id: "sp", label: "São Paulo" },
  { id: "rj", label: "Rio de Janeiro" },
] as const;

export type StateId = (typeof STATE_OPTIONS)[number]["id"];

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
