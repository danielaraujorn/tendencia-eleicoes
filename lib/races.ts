import { LIST_OFFICES, STATE_OPTIONS, type StateId } from "./labels";

export type RaceKind = "chart" | "list";

export type RaceConfig = {
  id: string;
  title: string;
  scope: string;
  electionCode: string;
  cargo: string;
  abrangencia: string;
  kind: RaceKind;
};

export type ElectionCodes = {
  federal: string;
  state: string;
};

/** Federal e estadual de 2026, nos dois turnos. */
export const ELECTION_ROUNDS: {
  first: ElectionCodes;
  second: ElectionCodes;
} = {
  first: { federal: "6257", state: "6259" },
  second: { federal: "6258", state: "6260" },
};

const TSE_BASE_URL = "https://resultados.tse.jus.br/oficial";

export function storageKey(race: RaceConfig) {
  return `${race.id}:${race.electionCode}`;
}

export function tseBase() {
  return TSE_BASE_URL;
}

const LIST_CARGO: Record<(typeof LIST_OFFICES)[number]["id"], string> = {
  senador: "0005",
  "deputado-federal": "0006",
  "deputado-estadual": "0007",
};

export type RaceOptions = {
  includeLists?: boolean;
  governors?: readonly StateId[] | "all";
};

export function races(codes: ElectionCodes, options: RaceOptions = {}): RaceConfig[] {
  const includeLists = options.includeLists !== false;
  const governorIds = options.governors ?? "all";
  const governorStates =
    governorIds === "all"
      ? [...STATE_OPTIONS]
      : STATE_OPTIONS.filter((state) => governorIds.includes(state.id));

  const governors: RaceConfig[] = governorStates.map((state) => ({
    id: `governador-${state.id}`,
    title: "Governador",
    scope: state.label,
    electionCode: codes.state,
    cargo: "0003",
    abrangencia: state.id,
    kind: "chart",
  }));

  const presidentStates: RaceConfig[] = STATE_OPTIONS.map((state) => ({
    id: `presidente-${state.id}`,
    title: "Presidente",
    scope: state.label,
    electionCode: codes.federal,
    cargo: "0001",
    abrangencia: state.id,
    kind: "chart",
  }));

  const lists: RaceConfig[] = includeLists
    ? STATE_OPTIONS.flatMap((state) =>
      LIST_OFFICES.map((office) => {
        const distrital = office.id === "deputado-estadual" && state.id === "df";
        return {
          id: `${office.id}-${state.id}`,
          title: distrital ? "Deputado Distrital" : office.title,
          scope: state.label,
          electionCode: codes.state,
          cargo: distrital ? "0008" : LIST_CARGO[office.id],
          abrangencia: state.id,
          kind: "list" as const,
        };
      }),
    )
    : [];

  return [
    {
      id: "presidente",
      title: "Presidente",
      scope: "Brasil",
      electionCode: codes.federal,
      cargo: "0001",
      abrangencia: "br",
      kind: "chart",
    },
    ...presidentStates,
    ...governors,
    ...lists,
  ];
}

/** A página abre no 2º turno. */
export function configuredRound(): 1 | 2 {
  return 2;
}

export function resolveElectionRounds() {
  return ELECTION_ROUNDS;
}

export function raceUrl(race: RaceConfig) {
  const code = race.electionCode.padStart(6, "0");
  const abr = race.abrangencia;
  return `${tseBase()}/ele2026/${race.electionCode}/dados/${abr}/${abr}-c${race.cargo}-e${code}-u.json`;
}

export function dataSource(): "oficial" | "simulado" {
  return "oficial";
}
