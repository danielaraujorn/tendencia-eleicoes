import { LIST_OFFICES, STATE_OPTIONS } from "./labels";

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

export type EleConfig = {
  pl?: {
    e?: EleElection[];
  }[];
};

type EleElection = {
  cd?: string;
  cdt2?: string;
  nm?: string;
  t?: string;
  tp?: string;
  abr?: { cp?: { cd?: string }[] }[];
};

export class ElectionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElectionConfigError";
  }
}

export function storageKey(race: RaceConfig) {
  return `${race.id}:${race.electionCode}`;
}

export function tseBase() {
  return (
    process.env.TSE_BASE_URL ?? "https://resultados.tse.jus.br/oficial"
  ).replace(/\/$/, "");
}

const LIST_CARGO: Record<(typeof LIST_OFFICES)[number]["id"], string> = {
  senador: "0005",
  "deputado-federal": "0006",
  "deputado-estadual": "0007",
};

export function races(codes: ElectionCodes): RaceConfig[] {
  const governors: RaceConfig[] = STATE_OPTIONS.map((state) => ({
    id: `governador-${state.id}`,
    title: "Governador",
    scope: state.label,
    electionCode: codes.state,
    cargo: "0003",
    abrangencia: state.id,
    kind: "chart",
  }));

  const lists: RaceConfig[] = STATE_OPTIONS.flatMap((state) =>
    LIST_OFFICES.map((office) => ({
      id: `${office.id}-${state.id}`,
      title: office.title,
      scope: state.label,
      electionCode: codes.state,
      cargo: LIST_CARGO[office.id],
      abrangencia: state.id,
      kind: "list" as const,
    })),
  );

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
    ...governors,
    ...lists,
  ];
}

function cargoCodes(election: EleElection) {
  const codes = new Set<string>();
  for (const scope of election.abr ?? []) {
    for (const cargo of scope.cp ?? []) {
      if (cargo.cd) codes.add(cargo.cd);
    }
  }
  return codes;
}

function findOrdinary(
  config: EleConfig,
  label: string,
  match: (election: EleElection, cargos: Set<string>) => boolean,
) {
  const found: EleElection[] = [];
  for (const pleito of config.pl ?? []) {
    for (const election of pleito.e ?? []) {
      if (election.t !== "1" || !(election.nm ?? "").includes("Ordinária")) {
        continue;
      }
      if (match(election, cargoCodes(election))) found.push(election);
    }
  }

  if (found.length === 1) return found[0];
  const problem =
    found.length === 0 ? "Nenhuma eleição" : "Mais de uma eleição";
  throw new ElectionConfigError(
    `${problem} ordinária ${label} no ele-c.json`,
  );
}

function codeFor(election: EleElection, round: 1 | 2, label: string) {
  const code = round === 2 ? election.cdt2 : election.cd;
  if (code) return code;
  const turn = round === 2 ? " de 2º turno" : "";
  throw new ElectionConfigError(`Eleição ${label} sem código${turn}`);
}

export function pickElections(config: EleConfig, round: 1 | 2): ElectionCodes {
  const federal = findOrdinary(
    config,
    "federal",
    (election, cargos) => election.tp === "8" && cargos.has("1"),
  );
  const state = findOrdinary(
    config,
    "estadual",
    (election, cargos) =>
      election.tp === "1" && cargos.has("3") && cargos.has("5"),
  );

  return {
    federal: codeFor(federal, round, "federal"),
    state: codeFor(state, round, "estadual"),
  };
}

function electionRound(): 1 | 2 {
  const round = process.env.TSE_ROUND ?? "1";
  if (round === "1" || round === "2") return Number(round) as 1 | 2;
  throw new ElectionConfigError("TSE_ROUND deve ser 1 ou 2");
}

function envElectionCodes(): ElectionCodes | null {
  const federal = process.env.TSE_FEDERAL_ELECTION?.trim();
  const state = process.env.TSE_STATE_ELECTION?.trim();
  if (federal && state) return { federal, state };
  if (federal || state) {
    throw new ElectionConfigError(
      "Defina TSE_FEDERAL_ELECTION e TSE_STATE_ELECTION juntos",
    );
  }
  return null;
}

async function fetchEleConfig(): Promise<EleConfig> {
  const url = `${tseBase()}/comum/config/ele-c.json`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new ElectionConfigError(
        `ele-c.json respondeu HTTP ${response.status}`,
      );
    }
    return (await response.json()) as EleConfig;
  } catch (error) {
    if (error instanceof ElectionConfigError) throw error;
    const message = error instanceof Error ? error.message : "falha de rede";
    throw new ElectionConfigError(`ele-c.json: ${message}`);
  }
}

export async function resolveElectionCodes(): Promise<ElectionCodes> {
  const override = envElectionCodes();
  if (override) return override;
  return pickElections(await fetchEleConfig(), electionRound());
}

export function raceUrl(race: RaceConfig) {
  const code = race.electionCode.padStart(6, "0");
  const abr = race.abrangencia;
  return `${tseBase()}/ele2026/${race.electionCode}/dados/${abr}/${abr}-c${race.cargo}-e${code}-u.json`;
}

export function dataSource(): "oficial" | "simulado" {
  return (process.env.TSE_BASE_URL ?? "").includes("simulado")
    ? "simulado"
    : "oficial";
}
