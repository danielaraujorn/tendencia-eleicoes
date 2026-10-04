import assert from "node:assert/strict";
import test from "node:test";
import { stateFromCookie } from "../lib/labels";

test("cookie ausente ou inválido usa o estado padrão", () => {
  assert.equal(stateFromCookie(undefined), "rn");
  assert.equal(stateFromCookie(null), "rn");
  assert.equal(stateFromCookie(""), "rn");
  assert.equal(stateFromCookie("xx"), "rn");
});

test("cookie de estado válido é mantido", () => {
  assert.equal(stateFromCookie("sp"), "sp");
});
