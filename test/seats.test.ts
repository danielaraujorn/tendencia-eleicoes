import assert from "node:assert/strict";
import test from "node:test";
import { STATE_OPTIONS } from "../lib/labels";
import { seatsFor, stateDeputySeats } from "../lib/seats";

test("cada estado elege dois senadores em 2026", () => {
  for (const state of STATE_OPTIONS) {
    assert.equal(seatsFor("senador", state.id), 2);
  }
});

test("as bancadas federais somam 513 e as assembleias 1035, mais 24 distritais", () => {
  let federal = 0;
  let state = 0;
  for (const option of STATE_OPTIONS) {
    federal += seatsFor("deputado-federal", option.id);
    state += seatsFor("deputado-estadual", option.id);
  }
  assert.equal(federal, 513);
  assert.equal(state, 1035 + 24);
});

test("a assembleia segue o tamanho da bancada federal", () => {
  assert.equal(seatsFor("deputado-federal", "rn"), 8);
  assert.equal(seatsFor("deputado-estadual", "rn"), 24);
  assert.equal(seatsFor("deputado-federal", "sp"), 70);
  assert.equal(seatsFor("deputado-estadual", "sp"), 94);
  assert.equal(seatsFor("deputado-federal", "df"), 8);
  assert.equal(seatsFor("deputado-estadual", "df"), 24);
  assert.equal(stateDeputySeats(12), 36);
  assert.equal(stateDeputySeats(22), 46);
});
