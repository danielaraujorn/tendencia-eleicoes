import assert from "node:assert/strict";
import test from "node:test";
import { chartRows } from "../components/race-chart";
import { shouldRecordHistory } from "../lib/history";
import { projectPercent, trendAt, trendCurve } from "../lib/trend";
import { parseTsePayload } from "../lib/tse";
import { buildRaceView, rosterCandidates, topCandidates } from "../lib/view";
import type { Candidate } from "../lib/types";
import { pickElections, races, type EleConfig, type RaceConfig } from "../lib/races";

const president: RaceConfig = {
  id: "presidente",
  title: "Presidente",
  scope: "Brasil",
  electionCode: "21270",
  cargo: "0001",
  abrangencia: "br",
  kind: "chart",
};

function candidate(partial: Partial<Candidate> & Pick<Candidate, "id" | "percent">): Candidate {
  return {
    number: partial.number ?? partial.id,
    name: partial.name ?? partial.id,
    party: partial.party ?? "PT",
    votes: partial.votes ?? 10,
    seq: partial.seq ?? 1,
    destination: partial.destination ?? "Válido",
    ...partial,
  };
}

test("interpreta percentual com vírgula e achata os candidatos", () => {
  const parsed = parseTsePayload({
    and: "n",
    dt: "04/10/2026",
    ht: "17:10:00",
    s: { pst: "12,50", pstn: "12,5" },
    carg: [
      {
        agr: [
          {
            par: [
              {
                sg: "PT",
                cand: [
                  {
                    n: "13",
                    sqcand: "1",
                    nmu: "Lula",
                    vap: "1000",
                    pvap: "40,00",
                    pvapn: "40,123456789",
                    seq: "1",
                    dvt: "Válido",
                  },
                ],
              },
              {
                sg: "PL",
                cand: [
                  {
                    n: "22",
                    sqcand: "2",
                    nmu: "Flávio",
                    vap: "800",
                    pvap: "32,00",
                    pvapn: "32,0",
                    seq: "2",
                    dvt: "Válido",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.pst, 12.5);
  assert.equal(parsed.finalized, false);
  assert.equal(parsed.sourceUpdatedAt, "04/10/2026 17:10:00");
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.candidates.find((item) => item.id === "1")?.percent, 40.123456789);
  assert.equal(parsed.candidates.find((item) => item.id === "1")?.party, "PT");
});

test("guarda ponto novo a cada 0,1 e no fechamento", () => {
  assert.equal(shouldRecordHistory(null, 0, false), true);
  assert.equal(shouldRecordHistory(10, 10.05, false), false);
  assert.equal(shouldRecordHistory(10, 10.1, false), true);
  assert.equal(shouldRecordHistory(99.95, 100, true), true);
});

test("a tendência mistura o acumulado com a composição recente", () => {
  assert.equal(
    projectPercent(
      [
        { pst: 6, votes: 40 },
        { pst: 8, votes: 42 },
      ],
      [
        { pst: 6, validVotes: 100 },
        { pst: 8, validVotes: 100 },
      ],
    ),
    null,
  );
  assert.equal(
    projectPercent(
      [
        { pst: 1, votes: 40 },
        { pst: 3, votes: 80 },
        { pst: 4, votes: 120 },
      ],
      [
        { pst: 1, validVotes: 100 },
        { pst: 3, validVotes: 200 },
        { pst: 4, validVotes: 300 },
      ],
    ),
    null,
  );
  assert.equal(
    projectPercent(
      [
        { pst: 10, votes: 40 },
        { pst: 10.5, votes: 50 },
        { pst: 11, votes: 60 },
      ],
      [
        { pst: 10, validVotes: 100 },
        { pst: 10.5, validVotes: 120 },
        { pst: 11, validVotes: 140 },
      ],
    ),
    null,
  );

  // Percentuais 40, 42 e 44. A reta antiga terminaria em 58.
  // Os incrementos são todos de 50%, então o fechamento é 0,3*44 + 0,7*50.
  const fit = projectPercent(
    [
      { pst: 10, votes: 240 },
      { pst: 20, votes: 315 },
      { pst: 30, votes: 440 },
    ],
    [
      { pst: 10, validVotes: 600 },
      { pst: 20, validVotes: 750 },
      { pst: 30, validVotes: 1000 },
    ],
  );
  assert.ok(fit);
  assert.ok(Math.abs(fit.marginal - 50) < 1e-9);
  assert.ok(Math.abs(fit.projected - 48.2) < 1e-9);

  const curve = trendCurve(30, 44, fit.marginal);
  const mid = curve[7];
  assert.ok(mid);
  assert.ok(Math.abs(mid.pst - 65) < 1e-9);
  assert.ok(Math.abs(mid.percent - 614 / 13) < 1e-9);
  assert.ok(Math.abs(trendAt(100, 30, 44, fit.marginal) - 48.2) < 1e-9);
});

test("mostra os quatro primeiros e a diferença", () => {
  const candidates = [5, 4, 3, 2, 1].map((percent, index) =>
    candidate({ id: String(index), percent, name: `C${index}` }),
  );
  const view = buildRaceView(
    president,
    [
      {
        race: "presidente:21270",
        pst: 20,
        candidates,
      },
    ],
    {
      race: "presidente:21270",
      pst: 20,
      finalized: false,
      sourceUpdatedAt: "04/10/2026 18:00:00",
      candidates,
    },
  );

  assert.deepEqual(
    topCandidates(candidates).map((item) => item.percent),
    [5, 4, 3, 2],
  );
  assert.equal(view.top.length, 4);
  assert.deepEqual(
    rosterCandidates(candidates).map((item) => item.number),
    ["0", "1", "2", "3", "4"],
  );
  assert.equal(view.roster.length, 5);
  assert.equal(view.leader?.name, "C0");
  assert.equal(view.gap, 1);
  assert.equal(view.points.length, 1);
  assert.equal(view.trends.length, 0);
});

test("projeta a mistura a partir dos votos válidos da disputa", () => {
  const snapshots = [
    { pst: 10, votes: [240, 360], percents: [40, 60] },
    { pst: 20, votes: [315, 435], percents: [42, 58] },
    { pst: 30, votes: [440, 560], percents: [44, 56] },
  ];
  const history = snapshots.map((snapshot) => ({
    race: "presidente:21270",
    pst: snapshot.pst,
    candidates: snapshot.votes.map((votes, index) =>
      candidate({
        id: String(index),
        percent: snapshot.percents[index] ?? 0,
        votes,
        seq: index,
      }),
    ),
  }));
  const latest = history[history.length - 1];
  assert.ok(latest);
  const view = buildRaceView(president, history, {
    ...latest,
    finalized: false,
    sourceUpdatedAt: "04/10/2026 18:00:00",
  });
  const trend = view.trends.find((item) => item.id === "0");
  assert.ok(trend);
  assert.ok(Math.abs(trend.marginal - 50) < 1e-9);
  assert.ok(Math.abs(trend.projected - 48.2) < 1e-9);

  const rows = chartRows(view);
  const end = rows[rows.length - 1];
  const mid = rows.find((row) => Math.abs(Number(row.pst) - 65) < 1e-9);
  assert.ok(end);
  assert.equal(end.pst, 100);
  assert.equal(end["0"], null);
  assert.ok(Math.abs(Number(end["0__trend"]) - 48.2) < 1e-9);
  assert.ok(mid);
  assert.ok(Math.abs(Number(mid["0__trend"]) - 614 / 13) < 1e-9);
});

const eleConfig: EleConfig = {
  pl: [
    {
      e: [
        {
          cd: "6278",
          cdt2: "",
          nm: "Eleição Suplementar - Roraima",
          t: "1",
          tp: "2",
          abr: [{ cp: [{ cd: "3" }] }],
        },
        {
          cd: "6257",
          cdt2: "6258",
          nm: "Eleição Ordinária Federal - 2026 1º Turno",
          t: "1",
          tp: "8",
          abr: [{ cp: [{ cd: "1" }] }],
        },
        {
          cd: "6259",
          cdt2: "6260",
          nm: "Eleição Ordinária Estadual - 2026 1º Turno",
          t: "1",
          tp: "1",
          abr: [{ cp: [{ cd: "3" }, { cd: "5" }, { cd: "6" }] }],
        },
        {
          cd: "6261",
          cdt2: "",
          nm: "Eleição Ordinária Municipal - 2026 1º Turno",
          t: "1",
          tp: "3",
          abr: [{ cp: [{ cd: "25" }] }],
        },
      ],
    },
  ],
};

test("emite senador e deputados de cada estado na eleição estadual", () => {
  const configs = races({ federal: "6257", state: "6259" });
  assert.equal(configs.filter((race) => race.kind === "chart").length, 4);
  const lists = configs.filter((race) => race.kind === "list");
  assert.equal(lists.length, 9);

  const expected = [
    ["senador-rn", "0005", "rn", "Senador"],
    ["deputado-federal-sp", "0006", "sp", "Deputado Federal"],
    ["deputado-estadual-rj", "0007", "rj", "Deputado Estadual"],
  ] as const;

  for (const [id, cargo, abrangencia, title] of expected) {
    const race = configs.find((item) => item.id === id);
    assert.ok(race);
    assert.equal(race.kind, "list");
    assert.equal(race.cargo, cargo);
    assert.equal(race.electionCode, "6259");
    assert.equal(race.abrangencia, abrangencia);
    assert.equal(race.title, title);
  }
});

test("a lista guarda só os dez válidos e não monta série", () => {
  const senator: RaceConfig = {
    id: "senador-rn",
    title: "Senador",
    scope: "Rio Grande do Norte",
    electionCode: "6259",
    cargo: "0005",
    abrangencia: "rn",
    kind: "list",
  };
  const candidates = [
    ...Array.from({ length: 12 }, (_, index) =>
      candidate({
        id: String(index),
        percent: index,
        votes: index * 10,
        destination: "Válido",
        seq: index,
      }),
    ),
    candidate({
      id: "nulo",
      percent: 99,
      votes: 5000,
      destination: "Anulado",
      seq: 0,
    }),
  ];
  const latest = {
    race: "senador-rn:6259",
    pst: 40,
    finalized: false,
    sourceUpdatedAt: "04/10/2026 18:00:00",
    candidates,
  };
  const view = buildRaceView(
    senator,
    [
      {
        race: latest.race,
        pst: 20,
        candidates,
      },
    ],
    latest,
  );

  assert.equal(view.top.length, 10);
  assert.deepEqual(
    view.top.map((item) => item.id),
    ["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"],
  );
  assert.ok(view.top.every((item) => item.destination === "Válido"));
  assert.deepEqual(view.roster, []);
  assert.deepEqual(view.points, []);
  assert.deepEqual(view.trends, []);
});

test("escolhe a ordinária federal e estadual e ignora a suplementar", () => {
  assert.deepEqual(pickElections(eleConfig, 1), {
    federal: "6257",
    state: "6259",
  });
  assert.deepEqual(pickElections(eleConfig, 2), {
    federal: "6258",
    state: "6260",
  });
});

type TseResultFile = {
  s?: { pstn?: unknown };
  carg?: {
    agr?: { par?: { cand?: Record<string, unknown>[] }[] }[];
  }[];
};

function assertResultFields(data: TseResultFile, url: string) {
  assert.ok(data.s?.pstn != null && String(data.s.pstn) !== "", url);
  const candidates = (data.carg ?? []).flatMap((cargo) =>
    (cargo.agr ?? []).flatMap((group) =>
      (group.par ?? []).flatMap((party) => party.cand ?? []),
    ),
  );
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.pvapn != null &&
        candidate.sqcand &&
        candidate.nmu &&
        candidate.vap != null,
    ),
    url,
  );
}

test("interpreta o simulado do TSE para presidente, governadores e listas", async () => {
  const urls = [
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21270/dados/br/br-c0001-e021270-u.json",
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/dados/rn/rn-c0003-e021272-u.json",
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/dados/sp/sp-c0003-e021272-u.json",
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/dados/rj/rj-c0003-e021272-u.json",
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/dados/rn/rn-c0005-e021272-u.json",
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/dados/rn/rn-c0006-e021272-u.json",
    "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21272/dados/rn/rn-c0007-e021272-u.json",
  ];

  for (const url of urls) {
    const response = await fetch(url);
    assert.equal(response.status, 200, url);
    const data = await response.json();
    assertResultFields(data, url);
    const parsed = parseTsePayload(data);
    assert.ok(parsed.pst >= 0, url);
    assert.ok(parsed.candidates.length >= 4, url);
    assert.ok(parsed.candidates.every((item) => item.name && Number.isFinite(item.percent)));
  }
});
