import assert from "node:assert/strict";
import test from "node:test";
import { yDomain } from "../components/race-chart";
import { mockSecondApuracao } from "../lib/mock-apuracao";
import { advantageDirection, raceReading } from "../lib/reading";
import { regionBallots } from "../lib/regions";
import type { RaceView } from "../lib/types";

function view(partial: Partial<RaceView>): RaceView {
  return {
    id: "presidente",
    title: "Presidente",
    scope: "Brasil",
    available: true,
    pst: 30,
    finalized: false,
    sourceUpdatedAt: null,
    leader: { name: "Ana", party: "AA", percent: 54 },
    runnerUp: { name: "Bia", percent: 46 },
    gap: 8,
    zeroed: false,
    top: [
      {
        id: "ana",
        number: "13",
        name: "Ana",
        party: "AA",
        votes: 540,
        percent: 54,
        seq: 1,
        destination: "Válido",
      },
      {
        id: "bia",
        number: "22",
        name: "Bia",
        party: "BB",
        votes: 460,
        percent: 46,
        seq: 2,
        destination: "Válido",
      },
    ],
    others: [],
    roster: [],
    points: [],
    trends: [],
    crossover: null,
    ...partial,
  };
}

test("sem tendência a frase fica no placar atual", () => {
  const reading = raceReading(
    view({
      points: [{ pst: 4, percents: { ana: 54, bia: 46 } }],
    }),
  );
  assert.equal(
    reading,
    "Ana tem 54,00% contra 46,00%. A vantagem é de 8,00 p.p.",
  );
});

test("o gráfico reserva espaço para a linha de 50%", () => {
  const [low, high] = yDomain([{ pst: 40, a: 62, b: 70 }]);
  assert.ok(low < 50);
  assert.ok(high > 70);
});
