import assert from "node:assert/strict";
import test from "node:test";
import { mockFirstApuracao, mockSecondApuracao } from "../lib/mock-apuracao";
import { seatsFor } from "../lib/seats";
import type { RaceView } from "../lib/types";
import { governorRunoff } from "../lib/view";

function chartReady(view: RaceView | undefined, label: string) {
  assert.ok(view?.available, label);
  assert.ok(view.points.length >= 4, label);
  assert.ok(view.top.length >= 2, label);
  assert.ok(view.trends.length >= 1, label);
  assert.ok(view.top.every((candidate) => candidate.votes > 0), label);
  assert.equal(view.zeroed, false, label);
}

test("o mock do primeiro turno traz série, listas e regiões do Rio Grande do Norte", () => {
  const data = mockFirstApuracao();
  const races = data.rounds["1"].races;
  chartReady(races.presidente, "presidente");
  chartReady(races["presidente-rn"], "presidente-rn");
  chartReady(races["governador-rn"], "governador-rn");
  assert.notEqual(
    races.presidente?.top[0]?.percent,
    races["presidente-rn"]?.top[0]?.percent,
  );
  assert.notEqual(races.presidente?.pst, races["presidente-rn"]?.pst);
  assert.equal(races["governador-rn"]?.finalized, false);

  const senate = races["senador-rn"];
  const federal = races["deputado-federal-rn"];
  const state = races["deputado-estadual-rn"];
  assert.ok(senate && senate.top.length > seatsFor("senador", "rn"));
  assert.ok(federal && federal.top.length > seatsFor("deputado-federal", "rn"));
  assert.ok(state && state.top.length > seatsFor("deputado-estadual", "rn"));
  for (const view of [senate, federal, state]) {
    assert.ok(view?.available);
    assert.ok(view.top.every((candidate) => candidate.votes > 0));
  }

  assert.equal(data.rounds["1"].regions.length, 5);
  assert.ok(data.rounds["1"].regions.every((region) => region.pst != null));
  assert.equal(Object.keys(data.rounds["2"].races).length, 0);
});

test("o mock do segundo turno cobre governador decidido e governador em disputa", () => {
  const data = mockSecondApuracao();
  const first = data.rounds["1"].races;
  const second = data.rounds["2"].races;

  assert.equal(governorRunoff(first["governador-rn"]), "no");
  assert.equal(governorRunoff(first["governador-sp"]), "yes");
  chartReady(second.presidente, "presidente");
  chartReady(second["presidente-rn"], "presidente-rn");
  chartReady(second["presidente-sp"], "presidente-sp");
  chartReady(second["governador-sp"], "governador");
  assert.equal(second["governador-rn"]?.available ?? false, false);
  assert.equal(second["senador-rn"], undefined);
  assert.notEqual(second.presidente?.pst, second["presidente-rn"]?.pst);
  assert.notEqual(second.presidente?.top[0]?.percent, second["presidente-rn"]?.top[0]?.percent);
  assert.notEqual(second.presidente?.top[0]?.percent, second["presidente-sp"]?.top[0]?.percent);
  assert.equal(data.rounds["2"].regions.length, 5);
  assert.ok(data.rounds["2"].regions.every((region) => region.pst != null));
});
