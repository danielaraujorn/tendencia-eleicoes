import { races, type RaceConfig } from "./races";
import type { ApuracaoResponse, Candidate } from "./types";
import { buildApuracao, type StoredPoint, type StoredState } from "./view";

const FEDERAL = "21270";
const STATE = "21272";
const NATIONAL_PST = [8, 14, 20, 26, 30] as const;
const STATE_PST = [4, 8, 12, 17, 22] as const;
const READ_AT = [
  "2026-10-04T20:12:00.000Z",
  "2026-10-04T20:28:00.000Z",
  "2026-10-04T20:46:00.000Z",
  "2026-10-04T21:04:00.000Z",
  "2026-10-04T21:18:00.000Z",
] as const;
const SOURCE_UPDATED_AT = "04/10/2026 18:18:00";

type ChartPerson = {
  id: string;
  number: string;
  name: string;
  party: string;
  shares: readonly number[];
};

type ListPerson = {
  id: string;
  number: string;
  name: string;
  party: string;
  percent: number;
};

const PRESIDENT: ChartPerson[] = [
  {
    id: "helena-costa",
    number: "13",
    name: "Helena Costa",
    party: "PT",
    shares: [51.8, 49.6, 47.8, 46.4, 45.6],
  },
  {
    id: "marcos-leme",
    number: "22",
    name: "Marcos Leme",
    party: "PL",
    shares: [34.2, 36.8, 39.1, 41.0, 42.4],
  },
  {
    id: "irene-duarte",
    number: "15",
    name: "Irene Duarte",
    party: "MDB",
    shares: [9.4, 9.0, 8.6, 8.2, 7.9],
  },
  {
    id: "paulo-neri",
    number: "40",
    name: "Paulo Neri",
    party: "PSB",
    shares: [2.8, 2.7, 2.6, 2.5, 2.4],
  },
  {
    id: "lucia-braga",
    number: "12",
    name: "Lúcia Braga",
    party: "PDT",
    shares: [1.8, 1.9, 1.9, 1.9, 1.7],
  },
];

const GOVERNOR: ChartPerson[] = [
  {
    id: "anita-holanda",
    number: "13",
    name: "Anita Holanda",
    party: "PT",
    shares: [55.2, 54.8, 54.4, 54.1, 54.0],
  },
  {
    id: "rogerio-paiva",
    number: "22",
    name: "Rogério Paiva",
    party: "PL",
    shares: [30.4, 30.8, 31.1, 31.3, 31.4],
  },
  {
    id: "celia-morais",
    number: "15",
    name: "Célia Morais",
    party: "MDB",
    shares: [10.1, 10.0, 10.0, 10.0, 9.9],
  },
  {
    id: "damiao-lopes",
    number: "40",
    name: "Damião Lopes",
    party: "PSB",
    shares: [4.3, 4.4, 4.5, 4.6, 4.7],
  },
];

const SENATORS: ListPerson[] = [
  { id: "nestor-galvao", number: "133", name: "Nestor Galvão", party: "PT", percent: 28.4 },
  { id: "elias-camara", number: "222", name: "Elias Câmara", party: "PL", percent: 24.1 },
  { id: "marta-queiroz", number: "456", name: "Marta Queiroz", party: "PSD", percent: 16.8 },
  { id: "vera-lustosa", number: "151", name: "Vera Lustosa", party: "MDB", percent: 11.2 },
  { id: "helio-sampaio", number: "400", name: "Hélio Sampaio", party: "PSB", percent: 8.5 },
  { id: "tereza-dantas", number: "123", name: "Tereza Dantas", party: "PDT", percent: 5.4 },
  { id: "ivo-medeiros", number: "555", name: "Ivo Medeiros", party: "PSOL", percent: 3.6 },
  { id: "cida-ramalho", number: "777", name: "Cida Ramalho", party: "REDE", percent: 2.0 },
];

const FEDERAL_DEPUTIES: ListPerson[] = [
  { id: "liana-farias", number: "1313", name: "Liana Farias", party: "PT", percent: 8.6 },
  { id: "caio-pimentel", number: "2222", name: "Caio Pimentel", party: "PL", percent: 7.1 },
  { id: "bruno-seixas", number: "4444", name: "Bruno Seixas", party: "PSD", percent: 6.4 },
  { id: "rita-amancio", number: "1515", name: "Rita Amâncio", party: "MDB", percent: 5.2 },
  { id: "nilo-barbosa", number: "1212", name: "Nilo Barbosa", party: "PDT", percent: 4.8 },
  { id: "silvia-moura", number: "4040", name: "Sílvia Moura", party: "PSB", percent: 4.1 },
  { id: "heitor-lins", number: "5555", name: "Heitor Lins", party: "PSOL", percent: 3.5 },
  { id: "paula-guedes", number: "1010", name: "Paula Guedes", party: "REPUBLICANOS", percent: 3.2 },
];

const STATE_DEPUTIES: ListPerson[] = [
  { id: "otavio-serafim", number: "13123", name: "Otávio Serafim", party: "PT", percent: 6.8 },
  { id: "diana-frota", number: "22210", name: "Diana Frota", party: "PL", percent: 5.9 },
  { id: "vicente-paes", number: "45678", name: "Vicente Paes", party: "PSD", percent: 5.1 },
  { id: "neide-carvalho", number: "15111", name: "Neide Carvalho", party: "MDB", percent: 4.4 },
  { id: "jairton-melo", number: "12345", name: "Jairton Melo", party: "PDT", percent: 3.8 },
  { id: "leda-vasconcelos", number: "40777", name: "Leda Vasconcelos", party: "PSB", percent: 3.3 },
  { id: "rafael-pires", number: "55512", name: "Rafael Pires", party: "PSOL", percent: 2.7 },
  { id: "aline-bentes", number: "10023", name: "Aline Bentes", party: "REPUBLICANOS", percent: 2.2 },
];

function chartCandidates(
  people: ChartPerson[],
  step: number,
  scale: number,
  series: readonly number[],
): Candidate[] {
  const pst = series[step] ?? 0;
  const total = pst * scale;
  return people.map((person, index) => {
    const percent = person.shares[step] ?? 0;
    return {
      id: person.id,
      number: person.number,
      name: person.name,
      party: person.party,
      percent,
      votes: Math.round((percent / 100) * total),
      seq: index + 1,
      destination: "Válido",
    };
  });
}

function chartHistory(
  config: RaceConfig,
  people: ChartPerson[],
  scale: number,
  series: readonly number[],
) {
  const key = `${config.id}:${config.electionCode}`;
  const history: StoredPoint[] = series.slice(0, -1).map((pst, step) => ({
    race: key,
    pst,
    capturedAt: new Date(READ_AT[step] ?? READ_AT[0]),
    candidates: chartCandidates(people, step, scale, series),
  }));
  const last = series.length - 1;
  const latest: StoredState = {
    race: key,
    pst: series[last] ?? 0,
    capturedAt: new Date(READ_AT[last] ?? READ_AT[0]),
    finalized: false,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
    candidates: chartCandidates(people, last, scale, series),
  };
  return { history, latest };
}

function listState(
  config: RaceConfig,
  people: ListPerson[],
  pst: number,
  pool: number,
): StoredState {
  return {
    race: `${config.id}:${config.electionCode}`,
    pst,
    capturedAt: new Date(READ_AT[READ_AT.length - 1] ?? READ_AT[0]),
    finalized: false,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
    candidates: people.map((person, index) => ({
      id: person.id,
      number: person.number,
      name: person.name,
      party: person.party,
      percent: person.percent,
      votes: Math.round((person.percent / 100) * pool),
      seq: index + 1,
      destination: "Válido",
    })),
  };
}

function requireRace(configs: RaceConfig[], id: string) {
  const config = configs.find((item) => item.id === id);
  if (!config) throw new Error(`Disputa ausente no mock: ${id}`);
  return config;
}

export const MOCK_READ_AT = READ_AT[READ_AT.length - 1] ?? READ_AT[0];

export function mockApuracao(): ApuracaoResponse {
  const configs = races({ federal: FEDERAL, state: STATE });
  const president = chartHistory(
    requireRace(configs, "presidente"),
    PRESIDENT,
    1_200_000,
    NATIONAL_PST,
  );
  const governor = chartHistory(
    requireRace(configs, "governador-rn"),
    GOVERNOR,
    24_000,
    STATE_PST,
  );
  const statePst = STATE_PST[STATE_PST.length - 1] ?? 0;
  const pool = statePst * 24_000;
  const states: StoredState[] = [
    president.latest,
    governor.latest,
    listState(requireRace(configs, "senador-rn"), SENATORS, statePst, pool),
    listState(requireRace(configs, "deputado-federal-rn"), FEDERAL_DEPUTIES, statePst, pool),
    listState(requireRace(configs, "deputado-estadual-rn"), STATE_DEPUTIES, statePst, pool),
  ];
  const history = [...president.history, ...governor.history];
  return buildApuracao(configs, states, history, "oficial");
}
