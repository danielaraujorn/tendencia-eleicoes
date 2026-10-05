import assert from "node:assert/strict";
import test from "node:test";
import { POLL_END_MS, POLL_START_MS, pollPhase } from "../lib/poll";

test("o polling fica fechado até as 17h de 25 de outubro", () => {
  assert.equal(pollPhase(Date.parse("2026-10-25T16:59:59-03:00")), "before");
  assert.equal(pollPhase(POLL_START_MS), "during");
});

test("o polling segue até a meia-noite e para no dia seguinte", () => {
  assert.equal(pollPhase(Date.parse("2026-10-25T23:59:59-03:00")), "during");
  assert.equal(pollPhase(POLL_END_MS), "after");
  assert.equal(pollPhase(Date.parse("2026-10-04T21:00:00-03:00")), "before");
});
