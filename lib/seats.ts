import { isStateId, type ListOfficeId, type StateId } from "./labels";

/** Bancada federal de 2026, igual à de 2022. O STF manteve as 513 cadeiras. */
const FEDERAL_SEATS: Record<StateId, number> = {
  ac: 8,
  al: 9,
  ap: 8,
  am: 8,
  ba: 39,
  ce: 22,
  df: 8,
  es: 10,
  go: 17,
  ma: 18,
  mt: 8,
  ms: 8,
  mg: 53,
  pa: 17,
  pb: 12,
  pr: 30,
  pe: 25,
  pi: 10,
  rj: 46,
  rn: 8,
  rs: 31,
  ro: 8,
  rr: 8,
  sc: 16,
  sp: 70,
  se: 8,
  to: 8,
};

/** Em 2026 cada estado e o DF elegem dois senadores. */
export const SENATE_SEATS = 2;

/** A Câmara Legislativa do DF tem 24 deputados distritais. */
export const DISTRICT_SEATS = 24;

/** Art. 27 da Constituição: triplo da bancada federal até 36, e depois uma cadeira por deputado federal acima de 12. */
export function stateDeputySeats(federalSeats: number) {
  if (federalSeats <= 12) return federalSeats * 3;
  return 36 + (federalSeats - 12);
}

export function seatsFor(office: ListOfficeId, state: StateId) {
  if (office === "senador") return SENATE_SEATS;
  if (office === "deputado-estadual" && state === "df") return DISTRICT_SEATS;
  const federal = FEDERAL_SEATS[state];
  if (office === "deputado-federal") return federal;
  return stateDeputySeats(federal);
}

export function seatsLabel(count: number) {
  return count === 1 ? "1 vaga" : `${count} vagas`;
}

export function seatsForList(id: string, abrangencia: string) {
  if (!isStateId(abrangencia)) return null;
  const office = id.slice(0, -(abrangencia.length + 1));
  if (
    office === "senador" ||
    office === "deputado-federal" ||
    office === "deputado-estadual"
  ) {
    return seatsFor(office, abrangencia);
  }
  return null;
}
