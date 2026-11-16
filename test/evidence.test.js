// The measured card is static evidence (2026-11-16, act.sub case only). These tests pin its rows and its "Not measured" list so that a
// changed result, a dropped caveat or a deleted NOT-measured item fails here (review findings F01 and F02).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE } from "../server/src/scenarios.js";

test("the measured rows are exactly the three states measured on 2026-11-16", () => {
  assert.deepEqual(EVIDENCE.rows, [
    { phase: "Baseline (no policy)", CountTool: "allowed", ListIndexTool: "allowed" },
    {
      phase: "Policy A on CountTool (act.sub = the token's own agent) and policy B on ListIndexTool (act.sub = a different agent), both Active",
      CountTool: "allowed",
      ListIndexTool: "refused: action denied by policy: ListIndexTool requires act.sub to be agent-b-example (JSON-RPC -32600)"
    },
    { phase: "Both policies deleted", CountTool: "allowed", ListIndexTool: "allowed" }
  ]);
});

test("the timing line says the 7 seconds is one observation and not a propagation time", () => {
  assert.match(EVIDENCE.timing, /about 7 seconds/);
  assert.match(EVIDENCE.timing, /one observation, not a measured or guaranteed propagation time/);
});

// The five NOT-measured items of the MEASURED FACTS, each found by its own keyword; the sixth item is this lab's own (hold and scope).
const NOT_MEASURED_KEYWORDS = [
  ["a second real agent", /second real agent/],
  ["act emitted as text", /act emitted as the TEXT/],
  ["the no-token wording", /no-token wording/],
  ["Candidate not being enforced", /Candidate policy not being enforced/],
  ["exact vs substring vs set membership", /exactly, by substring or by set membership/]
];

test("notMeasured lists each of the five NOT-measured items of the measured run, plus the simulated cases", () => {
  for (const [name, re] of NOT_MEASURED_KEYWORDS) {
    assert.equal(EVIDENCE.notMeasured.filter((t) => re.test(t)).length, 1, `notMeasured has exactly one item for: ${name}`);
  }
  assert.ok(EVIDENCE.notMeasured.some((t) => /hold-for-a-human and token-scope cases of this lab: they are simulated here/.test(t)));
  assert.equal(EVIDENCE.notMeasured.length, 6);
});

test("the table says its ids are examples substituted for the real ones (F07)", () => {
  assert.match(EVIDENCE.rowsNote, /ids in this table are examples substituted for the real ones/);
  assert.match(EVIDENCE.rowsNote, /real message carried a different value/);
});
