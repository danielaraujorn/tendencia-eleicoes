import assert from "node:assert/strict";
import test from "node:test";
import { chartRows, tooltipItems, yDomain } from "../components/race-chart";
import { formatArrival } from "../lib/format";
import { shouldRecordHistory } from "../lib/history";
import { arrivalAt, crossoverPst, projectPercent } from "../lib/trend";
import { parseTsePayload } from "../lib/tse";
import { buildApuracao, buildRaceView, rosterCandidates, topCandidates } from "../lib/view";
import type { Candidate } from "../lib/types";
import { STATE_OPTIONS } from "../lib/labels";
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
  assert.equal(
    parseTsePayload({ and: "F", s: { pstn: "40" } }).finalized,
    true,
  );
  assert.equal(parsed.sourceUpdatedAt, "04/10/2026 17:10:00");
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.candidates.find((item) => item.id === "1")?.percent, 40.123456789);
  assert.equal(parsed.candidates.find((item) => item.id === "1")?.party, "PT");
});

test("a resposta traz a captura mais recente", () => {
  const response = buildApuracao(
    [president],
    [
      {
        race: "presidente:21270",
        pst: 10,
        candidates: [],
        finalized: false,
        sourceUpdatedAt: "04/10/2026 17:10:00",
        capturedAt: new Date("2026-10-04T20:10:00.000Z"),
      },
      {
        race: "presidente:21270",
        pst: 12,
        candidates: [],
        finalized: false,
        sourceUpdatedAt: "04/10/2026 17:20:00",
        capturedAt: new Date("2026-10-04T20:20:00.000Z"),
      },
    ],
    [],
    "oficial",
  );
  assert.equal(response.capturedAt, "2026-10-04T20:20:00.000Z");
});

test("guarda ponto novo a cada 0,1 e no fechamento", () => {
  assert.equal(shouldRecordHistory(null, 0, false), true);
  assert.equal(shouldRecordHistory(10, 10.05, false), false);
  assert.equal(shouldRecordHistory(10, 10.1, false), true);
  assert.equal(shouldRecordHistory(99.95, 100, true), true);
});

test("a reta só aparece com histórico e apuração acima de 5%", () => {
  assert.equal(
    projectPercent([
      { pst: 6, percent: 40 },
      { pst: 8, percent: 42 },
    ]),
    null,
  );
  assert.equal(
    projectPercent([
      { pst: 1, percent: 40 },
      { pst: 3, percent: 42 },
      { pst: 4, percent: 44 },
    ]),
    null,
  );

  // 40, 42 e 44 em 10, 20 e 30. A reta em 100% é 58.
  assert.equal(
    projectPercent([
      { pst: 10, percent: 40 },
      { pst: 20, percent: 42 },
      { pst: 30, percent: 44 },
    ]),
    58,
  );

  const turned = [
    ...Array.from({ length: 31 }, (_, index) => ({ pst: 10 + index, percent: 40 })),
    ...Array.from({ length: 10 }, (_, index) => ({ pst: 41 + index, percent: 41 + index })),
  ];
  assert.ok(Math.abs((projectPercent(turned) ?? 0) - 100) < 1e-9);
});

test("acha o ponto em que as duas primeiras tendências se cruzam", () => {
  assert.equal(crossoverPst(30, 50, 30, 40, 60), 47.5);
  assert.equal(crossoverPst(30, 44, 50, 40, 46), null);
  assert.equal(crossoverPst(30, 44, 60, 40, 42), null);
  assert.equal(crossoverPst(30, 50, 40, 40, 40), 100);
});

test("projeta o horário da troca pelo ritmo recente das seções", () => {
  const start = new Date("2026-10-04T20:00:00.000Z");
  const minute = 60_000;
  const latest = new Date(start.getTime() + 20 * minute);
  const steady = arrivalAt(
    [
      { pst: 10, at: start },
      { pst: 20, at: new Date(start.getTime() + 10 * minute) },
      { pst: 30, at: latest },
    ],
    30,
    42,
    latest,
  );
  assert.equal(steady?.toISOString(), new Date(start.getTime() + 32 * minute).toISOString());

  const weight = Math.exp((-Math.LN2 * 10) / 8);
  const weightedPst = weight * 10 + 10;
  const weightedMs = weight * 20 * minute + 5 * minute;
  const unevenLatest = new Date(start.getTime() + 25 * minute);
  const uneven = arrivalAt(
    [
      { pst: 0, at: start },
      { pst: 10, at: new Date(start.getTime() + 20 * minute) },
      { pst: 20, at: unevenLatest },
    ],
    20,
    30,
    unevenLatest,
  );
  assert.equal(
    uneven?.toISOString(),
    new Date(unevenLatest.getTime() + 10 / (weightedPst / weightedMs)).toISOString(),
  );
  assert.equal(arrivalAt([{ pst: 30, at: latest }], 30, 42, latest), null);
});

test("formata o mesmo instante no fuso de quem vê", () => {
  const at = new Date("2026-10-04T22:40:00.000Z");
  const reference = new Date("2026-10-04T21:00:00.000Z");
  assert.equal(formatArrival(at, reference, "America/Sao_Paulo"), "19:40");
  assert.equal(formatArrival(at, reference, "America/Manaus"), "18:40");
  assert.equal(formatArrival(at, reference, "America/Rio_Branco"), "17:40");
  assert.equal(formatArrival(at, reference, "America/Noronha"), "20:40");

  const nextDay = new Date("2026-10-05T03:10:00.000Z");
  assert.equal(formatArrival(nextDay, at, "America/Sao_Paulo"), "05/10 00:10");
  assert.equal(formatArrival(nextDay, at, "America/Noronha"), "05/10 01:10");
});

test("mostra só os cinco mais votados no gráfico", () => {
  const candidates = [6, 5, 4, 3, 2, 1].map((percent, index) =>
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
    [6, 5, 4, 3, 2],
  );
  assert.equal(view.top.length, 5);
  assert.deepEqual(view.others, []);
  assert.deepEqual(Object.keys(view.points[0]?.percents ?? {}), ["0", "1", "2", "3", "4"]);
  assert.deepEqual(
    rosterCandidates(candidates).map((item) => item.number),
    ["0", "1", "2", "3", "4", "5"],
  );
  assert.equal(view.roster.length, 6);
  assert.equal(view.leader?.name, "C0");
  assert.equal(view.gap, 1);
  assert.equal(view.points.length, 1);
  assert.equal(view.trends.length, 0);
  assert.equal(view.crossover, null);
});

test("o gráfico começa em 1% e descarta a apuração zerada", () => {
  const empty = [
    candidate({ id: "0", percent: 0, votes: 0, seq: 0 }),
    candidate({ id: "1", percent: 0, votes: 0, seq: 1 }),
  ];
  const counted = [
    candidate({ id: "0", percent: 52, votes: 520, seq: 0 }),
    candidate({ id: "1", percent: 48, votes: 480, seq: 1 }),
  ];
  const view = buildRaceView(
    president,
    [
      { race: "presidente:21270", pst: 0, candidates: empty },
      { race: "presidente:21270", pst: 0.4, candidates: empty },
      { race: "presidente:21270", pst: 1, candidates: counted },
    ],
    {
      race: "presidente:21270",
      pst: 2,
      finalized: false,
      sourceUpdatedAt: "04/10/2026 18:00:00",
      candidates: counted,
    },
  );

  assert.deepEqual(
    view.points.map((point) => point.pst),
    [1, 2],
  );
});

test("a leitura mais recente substitui o snapshot no mesmo percentual de seções", () => {
  const history = [
    {
      race: "presidente:21270",
      pst: 10,
      candidates: [
        candidate({ id: "0", name: "Ana", percent: 40, votes: 400, seq: 0 }),
        candidate({ id: "1", name: "Bia", percent: 60, votes: 600, seq: 1 }),
      ],
    },
    {
      race: "presidente:21270",
      pst: 30,
      candidates: [
        candidate({ id: "0", name: "Ana", percent: 42, votes: 420, seq: 0 }),
        candidate({ id: "1", name: "Bia", percent: 58, votes: 580, seq: 1 }),
      ],
    },
  ];
  const view = buildRaceView(president, history, {
    race: "presidente:21270",
    pst: 30,
    finalized: false,
    sourceUpdatedAt: "04/10/2026 18:05:00",
    candidates: [
      candidate({ id: "0", name: "Ana", percent: 55, votes: 550, seq: 0 }),
      candidate({ id: "1", name: "Bia", percent: 45, votes: 450, seq: 1 }),
    ],
  });

  assert.equal(view.leader?.name, "Ana");
  assert.equal(view.leader?.percent, 55);
  assert.equal(view.points.length, 2);
  assert.equal(view.points[0]?.percents["0"], 40);
  assert.equal(view.points[1]?.percents["0"], 55);
  assert.equal(view.points[1]?.percents["1"], 45);
});

test("candidato ausente no começo da série não entra como zero voto", () => {
  const rows = [
    { pst: 10, votes: [null, 100] as const },
    { pst: 20, votes: [200, 300] as const },
    { pst: 30, votes: [300, 450] as const },
    { pst: 40, votes: [400, 600] as const },
  ];
  const history = rows.map((row) => ({
    race: "presidente:21270",
    pst: row.pst,
    candidates: row.votes.flatMap((votes, index) =>
      votes === null
        ? []
        : [
            candidate({
              id: String(index),
              name: index === 0 ? "Ana" : "Bia",
              votes,
              percent: (100 * votes) / row.votes.reduce((sum, value) => sum + (value ?? 0), 0),
              seq: index,
            }),
          ],
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
  assert.ok(Math.abs(trend.projected - 40) < 1e-9);
  assert.equal(view.points[0]?.percents["0"], undefined);
});

test("o gráfico fica entre 0% e 100%", () => {
  assert.deepEqual(yDomain([{ pst: 10, a: 0, b: 100 }]), [0, 100]);
  assert.deepEqual(yDomain([{ pst: 10, a: -12, b: 140 }]), [0, 100]);
  const [low, high] = yDomain([{ pst: 20, a: 40, b: 55 }]);
  assert.ok(low >= 0 && high <= 100);
  assert.ok(low < 40 && high > 55);

  const rows = chartRows({
    id: "presidente",
    title: "Presidente",
    scope: "Brasil",
    available: true,
    pst: 30,
    finalized: false,
    sourceUpdatedAt: null,
    leader: null,
    runnerUp: null,
    gap: null,
    zeroed: false,
    top: [
      candidate({ id: "0", percent: 90 }),
      candidate({ id: "1", percent: 4 }),
    ],
    others: [],
    roster: [],
    points: [{ pst: 30, percents: { "0": 90, "1": 4 } }],
    trends: [
      { id: "0", projected: 160 },
      { id: "1", projected: -20 },
    ],
    crossover: null,
  });
  const values = rows.flatMap((row) =>
    Object.entries(row)
      .filter(([key]) => key !== "pst")
      .map(([, value]) => value),
  );
  assert.ok(values.some((value) => value === 100));
  assert.ok(values.some((value) => value === 0));
  assert.ok(values.every((value) => value === null || (value >= 0 && value <= 100)));
});

test("o tooltip da projeção usa a curva tracejada quando a série sólida está vazia", () => {
  const solid = tooltipItems([
    { dataKey: "0", value: 44, name: "Ana" },
    { dataKey: "0__trend", value: 44, name: "Ana" },
  ]);
  assert.deepEqual(solid.map((item) => item.dataKey), ["0"]);

  const trend = tooltipItems([
    { dataKey: "0", value: null, name: "Ana" },
    { dataKey: "0__trend", value: 48.2, name: "Ana" },
    { dataKey: "1", value: null, name: "Bia" },
    { dataKey: "1__trend", value: 51.8, name: "Bia" },
  ]);
  assert.deepEqual(
    trend.map((item) => item.dataKey),
    ["0__trend", "1__trend"],
  );
  assert.equal(tooltipItems([{ dataKey: "0__trend", value: null }]).length, 0);
});

test("projeta a reta a partir do percentual acumulado", () => {
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
  assert.ok(Math.abs(trend.projected - 58) < 1e-9);

  const rows = chartRows(view);
  const end = rows[rows.length - 1];
  assert.ok(end);
  assert.equal(end.pst, 100);
  assert.equal(end["0"], null);
  assert.ok(Math.abs(Number(end["0__trend"]) - 58) < 1e-9);
  assert.equal(view.crossover, null);
});

test("marca o instante em que o segundo lugar ultrapassa o primeiro", () => {
  const start = new Date("2026-10-04T20:00:00.000Z");
  const minute = 60_000;
  const rows = [
    { pst: 10, votes: [600, 400] as const, at: start },
    { pst: 20, votes: [850, 650] as const, at: new Date(start.getTime() + 10 * minute) },
    { pst: 30, votes: [1050, 950] as const, at: new Date(start.getTime() + 20 * minute) },
  ];
  const history = rows.map((row) => {
    const total = row.votes[0] + row.votes[1];
    return {
      race: "presidente:21270",
      pst: row.pst,
      capturedAt: row.at,
      candidates: row.votes.map((votes, index) =>
        candidate({
          id: String(index),
          name: index === 0 ? "Ana" : "Bia",
          percent: (100 * votes) / total,
          votes,
          seq: index,
        }),
      ),
    };
  });
  const latest = history[history.length - 1];
  assert.ok(latest);
  const view = buildRaceView(president, history, {
    ...latest,
    finalized: false,
    sourceUpdatedAt: "04/10/2026 17:20:00",
  });
  assert.equal(view.leader?.name, "Ana");
  const leaderTrend = view.trends.find((item) => item.id === "0");
  const runnerTrend = view.trends.find((item) => item.id === "1");
  assert.ok(leaderTrend);
  assert.ok(runnerTrend);
  const expectedPst = crossoverPst(30, 52.5, leaderTrend.projected, 47.5, runnerTrend.projected);
  assert.ok(expectedPst);
  assert.ok(expectedPst > 30 && expectedPst <= 100);
  assert.ok(view.crossover);
  assert.ok(Math.abs(view.crossover.pst - expectedPst) < 1e-9);
  const eta = arrivalAt(
    rows.map((row) => ({ pst: row.pst, at: row.at })),
    30,
    view.crossover.pst,
    latest.capturedAt,
  );
  assert.equal(view.crossover.at, eta?.toISOString());
  assert.equal(view.crossover.readAt, latest.capturedAt.toISOString());

  const withoutClock = history.map(({ capturedAt: _capturedAt, ...point }) => point);
  const latestWithoutClock = withoutClock[withoutClock.length - 1];
  assert.ok(latestWithoutClock);
  assert.equal(
    buildRaceView(president, withoutClock, {
      ...latestWithoutClock,
      finalized: false,
      sourceUpdatedAt: "04/10/2026 17:20:00",
    }).crossover,
    null,
  );
});

test("esconde a troca até 20% das seções", () => {
  const start = new Date("2026-10-04T20:00:00.000Z");
  const minute = 60_000;
  const rows = [
    { pst: 8, votes: [600, 400] as const },
    { pst: 14, votes: [850, 650] as const },
    { pst: 19.9, votes: [1050, 950] as const },
  ];
  const history = rows.map((row, index) => {
    const total = row.votes[0] + row.votes[1];
    return {
      race: "presidente:21270",
      pst: row.pst,
      capturedAt: new Date(start.getTime() + index * 10 * minute),
      candidates: row.votes.map((votes, candidateIndex) =>
        candidate({
          id: String(candidateIndex),
          name: candidateIndex === 0 ? "Ana" : "Bia",
          percent: (100 * votes) / total,
          votes,
          seq: candidateIndex,
        }),
      ),
    };
  });
  const latest = history[history.length - 1];
  assert.ok(latest);
  const early = buildRaceView(president, history, {
    ...latest,
    finalized: false,
    sourceUpdatedAt: "04/10/2026 17:20:00",
  });
  assert.ok(early.trends.length >= 2);
  assert.equal(early.crossover, null);

  const opened = history.map((point, index) =>
    index === history.length - 1 ? { ...point, pst: 20 } : point,
  );
  const openedLatest = opened[opened.length - 1];
  assert.ok(openedLatest);
  assert.ok(
    buildRaceView(president, opened, {
      ...openedLatest,
      finalized: false,
      sourceUpdatedAt: "04/10/2026 17:20:00",
    }).crossover,
  );
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
  assert.equal(STATE_OPTIONS.length, 27);
  assert.equal(configs.filter((race) => race.kind === "chart").length, 28);
  const lists = configs.filter((race) => race.kind === "list");
  assert.equal(lists.length, 81);
  for (const state of STATE_OPTIONS) {
    assert.ok(configs.some((race) => race.id === `governador-${state.id}`));
    for (const office of ["senador", "deputado-federal", "deputado-estadual"]) {
      assert.ok(configs.some((race) => race.id === `${office}-${state.id}`));
    }
  }

  const expected = [
    ["senador-rn", "0005", "rn", "Senador"],
    ["deputado-federal-sp", "0006", "sp", "Deputado Federal"],
    ["deputado-estadual-rj", "0007", "rj", "Deputado Estadual"],
    ["deputado-estadual-df", "0008", "df", "Deputado Distrital"],
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

test("a lista guarda só os vinte válidos e não monta série", () => {
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
    ...Array.from({ length: 25 }, (_, index) =>
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

  assert.equal(view.top.length, 20);
  assert.deepEqual(
    view.top.map((item) => item.id),
    Array.from({ length: 20 }, (_, index) => String(24 - index)),
  );
  assert.deepEqual(view.others, []);
  assert.ok(view.top.every((item) => item.destination === "Válido"));
  assert.deepEqual(view.roster, []);
  assert.deepEqual(view.points, []);
  assert.deepEqual(view.trends, []);
  assert.equal(view.crossover, null);
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
