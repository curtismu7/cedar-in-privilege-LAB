// The three rule shapes, scenario by scenario: the exact verdict, HTTP status and message of every scenario, the evaluator's edges, hostile
// input, the catalog, the traces and the honesty labels. The mock is NOT a Cedar engine; these tests pin what this lab's mock does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer, runScenario } from "../server/src/index.js";
import * as pf from "../server/src/pf.js";
import { assertTrace } from "../server/src/gatewayTrace.js";
import { SCENARIOS, CASES, EVIDENCE, MOCK_NOTE, policiesFor, POLICY_HOLD, POLICY_SCOPE, POLICY_A, POLICY_B } from "../server/src/scenarios.js";
import { GUIDE, IS_IS_NOT, LABELS } from "../server/src/guide.js";
import {
  callTool, cedarText, claimActSub, claimScopes, policyForbids, decide, makePolicy,
  DOOR_URL, ISSUER, AGENT_A, AGENT_B, APPROVER, SCOPE_SEARCH, SCOPE_LIST, ACTION_INVOKE, ACTION_UNATTENDED
} from "../server/src/cedar.js";

const byId = (id) => SCENARIOS.find((s) => s.id === id);
const run = (id) => runScenario(byId(id));
const mint = (over = {}) => pf.mintAgentToken({ agent: AGENT_A, clientId: AGENT_A, audience: DOOR_URL, issuer: ISSUER, scope: SCOPE_LIST, ...over });
const call = (policies, over = {}) => callTool({ token: mint(), tool: "SearchIndexTool", action: ACTION_INVOKE, policies, verifyFn: pf.verify, ...over });

const HOLD_TEXT = [
  '@approvers("approver-example")',
  '@reason("SearchIndexTool needs a human approval")',
  'forbid (principal, action == Action::"mcp:InvokeUnattended", resource == Tool::"SearchIndexTool")',
  'when   { context.app == "door-example" }',
  "unless { context has approval_count && context.approval_count >= 1 };"
].join("\n");
const SCOPE_TEXT = [
  '@reason("SearchIndexTool requires the index:search-example scope")',
  'forbid (principal, action == Action::"mcp:Invoke", resource == Tool::"SearchIndexTool")',
  'when   { context.app == "door-example" }',
  'unless { context has token && context.token.scopes.contains("index:search-example") };'
].join("\n");
const ACTSUB_B_TEXT = [
  '@reason("ListIndexTool requires act.sub to be agent-b-example")',
  'forbid (principal, action == Action::"mcp:Invoke", resource == Tool::"ListIndexTool")',
  'when   { context.app == "door-example" }',
  'unless { context.token.claims has "act.sub"',
  '         && context.token.claims["act.sub"].contains("agent-b-example") };'
].join("\n");
const REFUSAL_SCOPE = "action denied by policy: SearchIndexTool requires the index:search-example scope";
const REFUSAL_B = "action denied by policy: ListIndexTool requires act.sub to be agent-b-example";
const HOLD_MESSAGE = "held for a human: SearchIndexTool needs a human approval (approval id approval-example-1, approver approver-example)";

// ---- Case 1: hold for a human -------------------------------------------------------------------------------------

test("case 1, hold-1: an unattended call with no approval is HELD (202, simulated), not refused, and the hold carries an approval id", () => {
  const r = run("hold-1-held");
  assert.equal(r.policies.length, 1);
  assert.equal(r.policies[0].cedar, HOLD_TEXT);
  assert.equal(r.policies[0].action, "mcp:InvokeUnattended");
  const [c] = r.calls;
  assert.deepEqual([c.kind, c.tool, c.action, c.http, c.verdict, c.ok], ["call", "SearchIndexTool", "mcp:InvokeUnattended", 202, "held", false]);
  assert.equal(c.reason, `HTTP 202 ${HOLD_MESSAGE} (simulated reply: the status and body of a real hold were not captured here, UNVERIFIED)`);
  assert.deepEqual(c.hops.map((h) => [h.stage, h.ok]), [["signin", true], ["cedar", null]]);
  assert.deepEqual(c.trace.response.body, { simulated: true, held: true, approval_id: "approval-example-1", approver: APPROVER, message: HOLD_MESSAGE });
});

test("case 1, hold-2: held, then a simulated approval is recorded, then the retry is allowed", () => {
  const r = run("hold-2-approve");
  assert.deepEqual(r.calls.map((c) => c.verdict), ["held", "approved", "allowed"]);
  assert.deepEqual(r.calls.map((c) => c.approvals), [0, 1, 1]);
  const [first, approval, retry] = r.calls;
  assert.equal(first.http, 202);
  assert.equal(approval.kind, "approval");
  assert.equal(approval.reason, "a human approved approval-example-1 (simulated): approval_count is now 1");
  assert.equal(approval.trace, null, "an approval is a console action, not a gateway call: no trace");
  assert.equal(retry.http, 200);
  assert.equal(retry.hops[1].reason, "Active policy cedar-hold-search did not forbid SearchIndexTool: 1 approval on record, approval_count >= 1");
  assert.equal(retry.reason, "200: SearchIndexTool served");
});

test("case 1: the hold is lifted by the approval alone: the same call, same token, approvals 0 then 1", () => {
  const token = mint();
  const policies = policiesFor([POLICY_HOLD]);
  const before = callTool({ token, tool: "SearchIndexTool", action: ACTION_UNATTENDED, approvals: 0, policies, verifyFn: pf.verify });
  const after = callTool({ token, tool: "SearchIndexTool", action: ACTION_UNATTENDED, approvals: 1, policies, verifyFn: pf.verify });
  assert.equal(before.verdict, "held");
  assert.equal(after.verdict, "allowed");
  assert.equal(callTool({ token, tool: "SearchIndexTool", action: ACTION_UNATTENDED, approvals: 2, policies, verifyFn: pf.verify }).verdict, "allowed");
});

test("case 1: approval_count must be a whole number of at least 1; anything else leaves the forbid in force", () => {
  const p = makePolicy(POLICY_HOLD);
  const ctx = { tool: "SearchIndexTool", action: ACTION_UNATTENDED, claims: {} };
  for (const approvals of [0, -1, 0.5, 1.5, NaN, Infinity, "1", true, null, [1], { n: 1 }]) {
    assert.equal(policyForbids(p, { ...ctx, approvals }), true, `approvals=${String(approvals)}`);
  }
  assert.equal(policyForbids(p, ctx), true, "no approvals given is 0");
  assert.equal(policyForbids(p, { ...ctx, approvals: 1 }), false);
  assert.equal(policyForbids(p, { ...ctx, approvals: 7 }), false);
});

test("case 1: a hold policy applies to the unattended action only; an mcp:Invoke call is not held by it", () => {
  const policies = policiesFor([POLICY_HOLD]);
  assert.equal(call(policies, { action: ACTION_INVOKE }).verdict, "allowed");
  assert.equal(call(policies, { action: ACTION_UNATTENDED }).verdict, "held");
  assert.equal(call(policies, { action: ACTION_UNATTENDED, tool: "CountTool" }).verdict, "allowed", "another tool is not named");
});

// ---- Case 2: token-scope gate -------------------------------------------------------------------------------------

test("case 2, scope-1: a token without the scope is refused with JSON-RPC -32600 (mock HTTP 400) and the reason names the scope", () => {
  const r = run("scope-1-without");
  assert.equal(r.policies[0].cedar, SCOPE_TEXT);
  assert.deepEqual(r.token.claims.scope, SCOPE_LIST);
  const [c] = r.calls;
  assert.deepEqual([c.http, c.verdict, c.action], [400, "refused", "mcp:Invoke"]);
  assert.equal(c.reason, `JSON-RPC -32600 ${REFUSAL_SCOPE}`);
  assert.deepEqual(c.trace.response.body, { jsonrpc: "2.0", id: 1, error: { code: -32600, message: REFUSAL_SCOPE } });
  assert.deepEqual(c.hops.map((h) => [h.stage, h.ok]), [["signin", true], ["cedar", false]]);
});

test("case 2, scope-2: the same policy and tool with a token that carries the scope is allowed", () => {
  const r = run("scope-2-with");
  assert.equal(r.token.claims.scope, `${SCOPE_LIST} ${SCOPE_SEARCH}`);
  const [c] = r.calls;
  assert.deepEqual([c.http, c.verdict], [200, "allowed"]);
  assert.equal(c.hops[1].reason, `Active policy cedar-scope-search did not forbid SearchIndexTool: the token's scopes include ${SCOPE_SEARCH}`);
});

test("case 2: scope membership is exact: no prefix, suffix, case-fold, look-alike or substring", () => {
  const p = makePolicy(POLICY_SCOPE);
  const ctx = { tool: "SearchIndexTool", action: ACTION_INVOKE };
  const forbids = (scope) => policyForbids(p, { ...ctx, claims: { scope } });
  assert.equal(forbids(SCOPE_SEARCH), false);
  assert.equal(forbids(`a:b ${SCOPE_SEARCH} c:d`), false);
  assert.equal(forbids([SCOPE_LIST, SCOPE_SEARCH]), false, "a list claim is set membership");
  for (const scope of ["index:search", `${SCOPE_SEARCH}-2`, `x${SCOPE_SEARCH}`, SCOPE_SEARCH.toUpperCase(), `${SCOPE_SEARCH}​`, `${SCOPE_SEARCH},${SCOPE_LIST}`, "index:search-examp1e", "", "   ", null, 5, {}, [[SCOPE_SEARCH]], [5], undefined]) {
    assert.equal(forbids(scope), true, `scope=${JSON.stringify(scope)}`);
  }
  assert.equal(policyForbids(p, { ...ctx, claims: null }), true, "no claims: fails closed");
  assert.equal(policyForbids(p, { ...ctx, claims: {} }), true);
  assert.deepEqual(claimScopes({ scope: " a  b\tc " }), ["a", "b", "c"]);
  assert.deepEqual(claimScopes({ scope: ["a", 5, "b"] }), ["a", "b"]);
  assert.deepEqual(claimScopes({ scope: 7 }), []);
  assert.deepEqual(claimScopes(null), []);
});

// ---- Case 3: agent act.sub gate -----------------------------------------------------------------------------------

test("case 3, actsub-1: no policy, both tools allowed", () => {
  const r = run("actsub-1-baseline");
  assert.equal(r.policies.length, 0);
  assert.deepEqual(r.calls.map((c) => [c.tool, c.http, c.verdict]), [["CountTool", 200, "allowed"], ["ListIndexTool", 200, "allowed"]]);
  assert.equal(r.calls[0].hops[1].reason, "no policy targets CountTool for mcp:Invoke");
});

test("case 3, actsub-2: one token, CountTool allowed (policy names its agent), ListIndexTool refused (policy names a different value)", () => {
  const r = run("actsub-2-gate");
  assert.equal(r.token.claims.act.sub, AGENT_A);
  assert.deepEqual(r.policies.map((p) => [p.id, p.tool, p.value, p.state]), [
    ["cedar-count-act-sub", "CountTool", AGENT_A, "Active"],
    ["cedar-list-act-sub", "ListIndexTool", AGENT_B, "Active"]
  ]);
  assert.equal(r.policies[1].cedar, ACTSUB_B_TEXT);
  const [count, list] = r.calls;
  assert.deepEqual([count.http, count.verdict], [200, "allowed"]);
  assert.equal(count.hops[1].reason, "Active policy cedar-count-act-sub did not forbid CountTool: the token's act.sub matched");
  assert.deepEqual([list.http, list.verdict], [400, "refused"]);
  assert.equal(list.reason, `JSON-RPC -32600 ${REFUSAL_B}`);
  assert.equal(list.trace.response.body.error.code, -32600);
  assert.equal(list.trace.response.body.error.message, REFUSAL_B);
});

test("case 3, actsub-3: Candidate policies are not enforced, so the call that names a different value is allowed (simulated, per the console documentation)", () => {
  const r = run("actsub-3-candidate");
  assert.ok(r.policies.every((p) => p.state === "Candidate"));
  assert.deepEqual(r.calls.map((c) => c.verdict), ["allowed", "allowed"]);
  assert.equal(r.calls[1].hops[1].reason, "policy cedar-list-act-sub is a Candidate: not enforced, so it cannot forbid ListIndexTool (per the console documentation, not re-run here)");
});

test("a Candidate is never enforced, whichever shape", () => {
  for (const spec of [POLICY_HOLD, POLICY_SCOPE, POLICY_A, POLICY_B]) {
    const p = makePolicy({ ...spec, state: "Candidate" });
    assert.equal(policyForbids(p, { tool: spec.tool, action: p.action, claims: {}, approvals: 0 }), false, spec.id);
    assert.equal(policyForbids({ ...p, state: "Active" }, { tool: spec.tool, action: p.action, claims: {}, approvals: 0 }), true, `${spec.id} Active does forbid`);
  }
});

test("act shapes that are not {sub: <value>} leave the act.sub rule with nothing to match, so the forbid applies", () => {
  assert.equal(claimActSub({ act: "{}" }), undefined);
  assert.equal(claimActSub({ act: { sub: "x" } }), "x");
  for (const act of [{}, { x: { sub: AGENT_A } }, null, AGENT_A, 5, [], [{ sub: AGENT_A }], Object.create({ sub: AGENT_A }), "{}"]) {
    assert.equal(claimActSub({ act }), undefined, JSON.stringify(act));
  }
  assert.equal(claimActSub(null), undefined);
  const p = makePolicy(POLICY_A);
  const ctx = { tool: "CountTool", action: ACTION_INVOKE };
  for (const act of [{}, { sub: null }, { sub: 5 }, { sub: {} }, { sub: true }, null, AGENT_A, "{}", []]) assert.equal(policyForbids(p, { ...ctx, claims: { act } }), true, JSON.stringify(act));
  assert.equal(policyForbids(p, { ...ctx, claims: { act: { sub: AGENT_A } } }), false);
  // End to end: a token whose act is the text "{}" is refused even on the tool naming its own agent.
  const token = mint({ actIsText: true });
  const r = callTool({ token, tool: "CountTool", action: ACTION_INVOKE, policies: policiesFor([POLICY_A]), verifyFn: pf.verify });
  assert.equal(r.http, 400);
  assert.equal(r.reason, "JSON-RPC -32600 action denied by policy: CountTool requires act.sub to be agent-client-example");
});

test("act.sub matching is exact: no prefix, suffix, substring, case-fold, whitespace or look-alike; a list matches only on an equal element", () => {
  const p = makePolicy(POLICY_A);
  const ctx = { tool: "CountTool", action: ACTION_INVOKE };
  const forbids = (sub) => policyForbids(p, { ...ctx, claims: { act: { sub } } });
  assert.equal(forbids(AGENT_A), false);
  assert.equal(forbids([AGENT_B, AGENT_A]), false);
  for (const sub of ["agent-client", `${AGENT_A}-2`, `x${AGENT_A}`, AGENT_A.toUpperCase(), ` ${AGENT_A}`, `${AGENT_A}\n`, "agent-cIient-example", ".*", `${AGENT_A}|${AGENT_B}`, [`${AGENT_A}x`], [[AGENT_A]], [AGENT_B]]) {
    assert.equal(forbids(sub), true, JSON.stringify(sub));
  }
});

// ---- Cross-cutting ------------------------------------------------------------------------------------------------

test("no token fails closed for every shape: 401 at sign-in, no policy evaluated, no Authorization header in the trace", () => {
  for (const action of [ACTION_INVOKE, ACTION_UNATTENDED]) {
    const policies = policiesFor([POLICY_HOLD, POLICY_SCOPE, POLICY_A]);
    const r = callTool({ token: null, tool: "SearchIndexTool", action, policies, verifyFn: pf.verify });
    assert.deepEqual([r.ok, r.http, r.verdict], [false, 401, "refused"]);
    assert.equal(r.hops.length, 1, "the cedar stage is never reached");
    assert.match(r.reason, /401 Bearer token required \(simulated wording/);
  }
  const t = run("hold-1-held");
  assert.ok(t.calls[0].trace.request.headers.authorization.startsWith("Bearer "));
});

test("the sign-in check refuses a bad signature, wrong audience, wrong issuer and an expired token before any policy", () => {
  const policies = policiesFor([POLICY_SCOPE]);
  const sign = (over) => {
    const now = Math.floor(Date.now() / 1000);
    return pf.sign({ iss: ISSUER, sub: AGENT_A, aud: DOOR_URL, scope: SCOPE_SEARCH, iat: now, exp: now + 300, ...over });
  };
  const tamper = (t) => t.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  const cases = [
    ["bad signature", tamper(sign({})), /bad signature/],
    ["wrong audience", sign({ aud: "https://elsewhere.example/mcp" }), /audience https:\/\/elsewhere\.example\/mcp does not match/],
    ["wrong issuer", sign({ iss: "https://other.example" }), /issuer https:\/\/other\.example does not match/],
    ["expired", sign({ exp: Math.floor(Date.now() / 1000) - 1 }), /token expired/],
    ["no exp", sign({ exp: undefined }), /token expired/],
    ["not a token", "garbage", /not a three-part token/]
  ];
  for (const [name, token, re] of cases) {
    const r = callTool({ token, tool: "SearchIndexTool", action: ACTION_INVOKE, policies, verifyFn: pf.verify });
    assert.equal(r.http, 401, name);
    assert.match(r.reason, re, name);
    assert.equal(r.hops.length, 1, `${name}: no policy evaluated`);
  }
  // The expiry boundary: exp equal to the current second is expired, one second later it is accepted.
  const now = () => 1_700_000_000_000;
  const at = (exp) => callTool({ token: sign({ exp }), tool: "SearchIndexTool", action: ACTION_INVOKE, policies, verifyFn: pf.verify, now });
  assert.equal(at(1_700_000_000).http, 401);
  assert.equal(at(1_700_000_001).http, 200);
});

test("a policy is plain ids only: nothing can break out of the Cedar string", () => {
  const base = { id: "p-1", shape: "scope", tool: "SearchIndexTool", value: SCOPE_SEARCH };
  assert.doesNotThrow(() => makePolicy(base));
  for (const bad of ['a"b', "a\\b", "a\nb", "a\n", "a b", "", "x".repeat(65), ".a", "-a", '") || true //', "a;b", "a{b"]) {
    for (const field of ["id", "tool", "value"]) assert.throws(() => makePolicy({ ...base, [field]: bad }), /plain ids/, `${field}=${JSON.stringify(bad)}`);
  }
  for (const field of ["id", "tool", "value"]) for (const bad of [undefined, null, 5, {}, []]) assert.throws(() => makePolicy({ ...base, [field]: bad }), /plain ids/);
  assert.throws(() => makePolicy({ ...base, shape: "permit" }), /shape must be/);
  assert.throws(() => makePolicy({ ...base, shape: "__proto__" }), /shape must be/);
  assert.throws(() => makePolicy({ ...base, shape: "toString" }), /shape must be/);
  assert.throws(() => makePolicy({ ...base, state: "Draft" }), /state must be/);
});

test("the Cedar of every shape is exactly the text on the page, with the action each shape names", () => {
  assert.equal(cedarText(makePolicy(POLICY_HOLD)), HOLD_TEXT);
  assert.equal(cedarText(makePolicy(POLICY_SCOPE)), SCOPE_TEXT);
  assert.equal(cedarText(makePolicy(POLICY_B)), ACTSUB_B_TEXT);
  assert.deepEqual([POLICY_HOLD, POLICY_SCOPE, POLICY_A].map((s) => makePolicy(s).action), ["mcp:InvokeUnattended", "mcp:Invoke", "mcp:Invoke"]);
  assert.equal(EVIDENCE.cedar.split("\n")[1], 'forbid (principal, action == Action::"mcp:Invoke", resource == Tool::"<Tool>")');
});

test("decide: no forbid is allowed, an mcp:Invoke forbid refuses, an mcp:InvokeUnattended forbid holds; no policy can grant", () => {
  const ctx = (action) => ({ tool: "SearchIndexTool", action, claims: { scope: SCOPE_LIST }, approvals: 0 });
  assert.deepEqual(decide([], ctx(ACTION_INVOKE)), { verdict: "allowed", policy: null });
  const scope = makePolicy(POLICY_SCOPE);
  const hold = makePolicy(POLICY_HOLD);
  assert.equal(decide([scope, hold], ctx(ACTION_INVOKE)).verdict, "refused");
  assert.equal(decide([scope, hold], ctx(ACTION_UNATTENDED)).verdict, "held");
  assert.equal(decide([scope, hold], { ...ctx(ACTION_INVOKE), claims: { scope: SCOPE_SEARCH } }).verdict, "allowed");
});

test("two Active policies on one tool: refused when either forbids, allowed only when both unless clauses are met", () => {
  const a = { ...POLICY_A, tool: "CountTool" };
  const b = { ...POLICY_B, tool: "CountTool" };
  const both = (agent) => callTool({ token: mint({ agent }), tool: "CountTool", action: ACTION_INVOKE, policies: policiesFor([a, b]), verifyFn: pf.verify });
  assert.equal(both(AGENT_A).http, 400);
  assert.equal(both(AGENT_B).http, 400);
  const single = callTool({ token: mint(), tool: "CountTool", action: ACTION_INVOKE, policies: policiesFor([a]), verifyFn: pf.verify });
  assert.equal(single.http, 200);
});

test("every scenario's verdicts match what its data says, every call count matches, and hold and scope cases are never marked measured", () => {
  for (const s of SCENARIOS) {
    const r = runScenario(s);
    assert.equal(r.calls.length, s.calls.length, s.id);
    assert.deepEqual(r.calls.map((c) => c.verdict), s.expect, s.id);
    // F12: every scenario RUN is a simulation. Two of them only say their outcome matches the real run (a separate flag, never the basis).
    assert.equal(s.basis, "simulated", `${s.id}: a scenario run is always simulated`);
    if (s.case !== "actsub") assert.equal(s.matchesMeasured, undefined, `${s.id}: only the act.sub case has a measured result`);
  }
  assert.deepEqual(SCENARIOS.filter((s) => s.matchesMeasured === true).map((s) => s.id), ["actsub-1-baseline", "actsub-2-gate"]);
  assert.deepEqual(CASES.map((c) => [c.id, c.basis]), [["hold", "simulated"], ["scope", "simulated"], ["actsub", "measured once"]]);
  assert.deepEqual(SCENARIOS.map((s) => s.id), ["hold-1-held", "hold-2-approve", "scope-1-without", "scope-2-with", "actsub-1-baseline", "actsub-2-gate", "actsub-3-candidate"]);
  for (const s of SCENARIOS) assert.ok(CASES.some((c) => c.id === s.case), s.id);
});

test("every call's trace passes assertTrace, is source mock with every decision 'checked', and a hold is an info decision, never a pass", () => {
  for (const s of SCENARIOS) {
    for (const c of runScenario(s).calls.filter((x) => x.kind === "call")) {
      assert.deepEqual(assertTrace(c.trace), [], `${s.id}/${c.tool}`);
      assert.equal(c.trace.source, "mock");
      assert.ok(c.trace.decisions.every((d) => d.basis === "checked"));
      const cedar = c.trace.decisions[1];
      assert.equal(cedar.label, `AI policy (Cedar), action ${c.action}`);
      assert.equal(cedar.outcome, c.verdict === "held" ? "info" : c.verdict === "refused" ? "fail" : "pass", `${s.id}/${c.tool}`);
    }
  }
});

test("a mock-issued token is returned raw in the run, labelled mock, and is the token the trace sends", () => {
  const r = run("scope-2-with");
  assert.equal(r.token.mock, true);
  assert.match(r.token.note, /mock token issued by this lab's in-process PingFederate stand-in/);
  assert.match(r.token.token, /^eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/);
  assert.equal(r.calls[0].trace.request.headers.authorization, `Bearer ${r.token.token}`);
  assert.equal(pf.verify(r.token.token).ok, true);
  assert.equal(r.token.claims.mock, true);
});

// ---- The API ------------------------------------------------------------------------------------------------------

async function withApi(fn) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  process.env.LAB_ALLOWED_HOSTS = "localhost:7820,127.0.0.1:7820";
  const srv = buildServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const j = async (path, body, method = "POST") => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(method !== "GET" ? { origin: base } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(j); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

test("catalog serves the three cases, the seven scenarios in order, the guide, the IS / IS NOT panel and the static evidence", async () => {
  await withApi(async (j) => {
    const cat = await j("/api/catalog", null, "GET");
    assert.equal(cat.status, 200);
    assert.equal(cat.body.door, "door-example");
    assert.equal(cat.body.mockNote, MOCK_NOTE);
    assert.deepEqual(cat.body.cases.map((c) => c.id), ["hold", "scope", "actsub"]);
    assert.deepEqual(cat.body.scenarios.map((s) => s.id), SCENARIOS.map((s) => s.id));
    assert.deepEqual(cat.body.scenarios.map((s) => s.callCount), SCENARIOS.map((s) => s.calls.length));
    assert.ok(cat.body.scenarios.every((s) => !("policies" in s) && !("calls" in s)), "the catalog does not ship the policy specs or call lists");
    assert.equal(cat.body.scenarios.find((s) => s.id === "actsub-3-candidate").policyState, "Candidate");
    assert.equal(cat.body.scenarios.find((s) => s.id === "hold-1-held").policyState, "Active");
    assert.deepEqual(cat.body.guide, GUIDE);
    assert.deepEqual(cat.body.isIsNot, IS_IS_NOT);
    assert.deepEqual(cat.body.evidence, EVIDENCE);
    assert.equal(cat.body.evidence.label, "Measured on a real tenant 2026-11-16");
  });
});

test("POST /api/run answers every scenario, records it, and a hostile scenario id is a 400 and never a lookup on Object.prototype", async () => {
  await withApi(async (j) => {
    for (const s of SCENARIOS) {
      const r = await j("/api/run", { scenario: s.id });
      assert.equal(r.status, 200, s.id);
      assert.equal(r.body.scenario, s.id);
      assert.deepEqual(r.body.calls.map((c) => c.verdict), s.expect);
    }
    assert.equal((await j("/api/runs", null, "GET")).body.runs.length, SCENARIOS.length);
    for (const hostile of ["__proto__", "constructor", "toString", "hold-1-held ", "HOLD-1-HELD", "../etc/passwd", "a".repeat(5000), ["hold-1-held"], { id: "hold-1-held" }, 5, null, true, "", "<script>alert(1)</script>"]) {
      const r = await j("/api/run", { scenario: hostile });
      assert.equal(r.status, 400, JSON.stringify(hostile).slice(0, 40));
      assert.equal(r.body.error, "unknown_scenario");
      assert.ok(!/<script>/.test(JSON.stringify(r.body)) || typeof r.body.message === "string");
    }
    // Extra body fields cannot smuggle a policy, a token or an approval count into a run.
    const smuggled = await j("/api/run", { scenario: "hold-1-held", approvals: 5, policies: [], token: "x", calls: [] });
    assert.equal(smuggled.body.calls[0].verdict, "held");
    assert.equal(smuggled.body.policies.length, 1);
  });
});

// ---- The guide and the IS / IS NOT panel --------------------------------------------------------------------------

test("the set-up guide has the eight console steps, in order, each statement carrying a known label", () => {
  assert.deepEqual(GUIDE.steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(GUIDE.steps.map((s) => s.title), [
    "Sign in to the Privilege console",
    "Open Access Management, then AI Policies",
    "Click New Policy",
    "Name it and set the state to Candidate",
    "Pick how to write it",
    "Fill in the template and read the Cedar it will save",
    "Click Create Policy and read Validation & Stages",
    "Enforce when you are happy, wait, then test"
  ]);
  const all = JSON.stringify(GUIDE);
  for (const needle of ["/ui/admin/ai-policys", "40 templates", "MCP, LLM, A2A and Coding agent", "Cedar this will save", "Validation & Stages", "MCP, before inspection", "about 4 minutes", "-32600", "7 seconds"]) {
    assert.ok(all.includes(needle), needle);
  }
  for (const s of GUIDE.steps) for (const n of s.notes) assert.ok(LABELS.includes(n.label), `${s.n}: ${n.label}`);
  assert.match(GUIDE.steps[3].what, /Per the console, a Candidate is stored and checked but not enforced/);
});

test("the 7 seconds is one observation, and the 4 minutes is documentation text, wherever the guide says them", () => {
  const notes = GUIDE.steps[7].notes;
  const seven = notes.find((n) => /7 seconds/.test(n.text));
  assert.equal(seven.label, "measured");
  assert.match(seven.text, /one observation, not a propagation time/);
  const four = notes.find((n) => /4 minutes/.test(n.text));
  assert.equal(four.label, "console text");
  const status = notes.find((n) => /HTTP 400/.test(n.text));
  assert.match(status.text, /not re-run here/);
  assert.match(status.text, /HTTP status of a policy refusal was not tested/);
});

test("the IS / IS NOT panel: six lines each, every line labelled, and the claims that were not measured never read as measured", () => {
  assert.equal(IS_IS_NOT.is.length, 6);
  assert.equal(IS_IS_NOT.isNot.length, 6);
  for (const item of [...IS_IS_NOT.is, ...IS_IS_NOT.isNot]) {
    assert.ok(LABELS.includes(item.label), item.text);
    assert.ok(item.text.length > 20);
  }
  const measured = [...IS_IS_NOT.is, ...IS_IS_NOT.isNot].filter((i) => i.label === "measured");
  assert.equal(measured.length, 1, "exactly one line is measured: reading act.sub");
  assert.match(measured[0].text, /act\.sub/);
  assert.match(measured[0].text, /one real agent/);
  const text = (re) => [...IS_IS_NOT.is, ...IS_IS_NOT.isNot].find((i) => re.test(i.text));
  assert.equal(text(/Narrowing only/).label, "UNVERIFIED");
  assert.equal(text(/RequiredClaims/).label, "UNVERIFIED");
  assert.equal(text(/regex engine/).label, "UNVERIFIED");
  assert.equal(text(/A grant/).label, "UNVERIFIED");
  assert.match(text(/Everything/).text, /2026-10-20 and were not re-checked/);
  for (const re of [/rule engine/, /mcp:Invoke \(refuse/, /mcp:InvokeUnattended \(hold/, /llm:Receive \(withhold/, /scopes/, /Candidate/, /Authentication/, /Instant/]) assert.ok(text(re), String(re));
});
