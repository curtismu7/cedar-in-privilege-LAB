// Express server: run the mock door, serve the story and the static evidence, mode and health APIs.
import express from "express";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as pf from "./pf.js";
import { callTool, cedarText, ISSUER, DOOR_URL, AGENT_A, DOOR, APPROVER, approvalIdFor, verifyStepUp, STEP_UP_FACTORS, DEMO_OTP } from "./cedar.js";
import { doorTrace, startTrace } from "./cedarTrace.js";
import { storyResponse } from "./storyRoute.js";
import { installNetguard } from "./netguard.js";
import { hostGuard, writeGuard, parseAllowedHosts } from "./guards.js";
import { realModeState, runRealProbe } from "./realMode.js";
import { createHealth } from "./health.js";
import { SCENARIOS, CASES, EVIDENCE, MOCK_NOTE, policiesFor } from "./scenarios.js";
import { GUIDE, IS_IS_NOT } from "./guide.js";
import { PACKS, storiesFor, packList } from "./stories.js";
import { loadCustomerConfig } from "./customer.js";
import { checkPrompt, planPrompt, callsFor, tokenExchange, transcriptFor } from "./agent.js";

const APP_ID = "cedar-in-privilege-lab";
const PORT_DEFAULT = 7820; // provisional: the next free port when this lab was built; the shelf registry has the final say
const REAL_REASON =
  "Real is owner-gated: with a valid local .env the page runs the read-only probe for the act.sub case (the server never calls out without it; " +
  "a run is the four read-only POSTs npm run real makes). The hold and scope cases stay simulated: to see hold and scope policies on a live door " +
  "use the Privilege AI Policies and PingFederate Token Demo pages of the full demo app.";

// Rule 13: the workspace id. The recorded runs (each carries its own traces) are kept per workspace, so one visitor's runs and Reset never
// touch another's. It comes from the X-Workspace-Id request header; without one it is "default". Short and [A-Za-z0-9._-] only, else a 400.
const DEFAULT_WORKSPACE = "default";
const WORKSPACE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_WORKSPACES = 100; // memory bound: past this the least recently used workspace is dropped
const state = { source: "mock", workspaces: new Map() };

const runsOf = (workspace) => state.workspaces.get(workspace) || [];
function recordRun(workspace, run) {
  const runs = runsOf(workspace);
  state.workspaces.delete(workspace); // re-insert so the Map's first key is always the least recently used
  state.workspaces.set(workspace, runs);
  runs.push(run);
  if (runs.length > 200) runs.shift();
  if (state.workspaces.size > MAX_WORKSPACES) state.workspaces.delete(state.workspaces.keys().next().value);
}
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "..", "dist");

const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);

let runCounter = 0;
function nextRunId() {
  runCounter += 1;
  return `run-${Date.now()}-${runCounter}`;
}

// Rule 4: a mock-issued token is shown raw and labelled mock. It is an HS256 fixture JWT that signs nothing real (pf.js), never a credential.
function tokenSummary(token, { edited = false } = {}) {
  if (!token) return null;
  return {
    mock: true,
    token,
    hash: sha8(token),
    claims: pf.decodePayload(token),
    ...(edited ? { edited: true } : {}),
    note: edited
      ? "mock token that the agent EDITED after this lab's in-process PingFederate stand-in signed it: its signature no longer matches (HS256 fixture key, signs nothing real)"
      : "mock token issued by this lab's in-process PingFederate stand-in (HS256 fixture key, signs nothing real)"
  };
}

// `claims` are what the ISSUER put in the token (see pf.mintAgentToken); with kind "forged" the same claims are added to the payload AFTER signing
// instead (an agent editing its own token), so the signature no longer matches. `actAgent` is the agent the token's act names (default the token's own).
function mintFor(kind, scope, claims, actAgent) {
  if (kind === "none") return { token: null };
  const base = { agent: actAgent || AGENT_A, clientId: AGENT_A, audience: DOOR_URL, issuer: ISSUER, actIsText: kind === "act-text", scope };
  if (kind === "forged") {
    const issued = pf.mintAgentToken(base);   // what the issuer really signed: no extra claim
    return { token: pf.tamper(issued, claims || {}), issued };
  }
  return { token: pf.mintAgentToken({ ...base, claims }) };
}

// Run one scenario against the mock door. Stateless: the scenario carries the policies the door holds while it runs. A call that is held
// leaves an approval id; an { approve: true } step records one human approval (simulated), and later calls carry approval_count 1.
// A step-up-gated approval ({ approve: true, stepUp: true }) asks the client for the factor and answer; the request body carries it
// (stepUp: { factor, otp } — push needs no otp). The step-up is single-use per run: one failure and the approval never records.
export function runScenario(scenario, trace = startTrace(), stepUp = null) {
  const policies = policiesFor(scenario.policies, scenario.policyState);
  const { token, issued } = mintFor(scenario.token, scenario.scope, scenario.claims, scenario.actAgent);
  let approvals = 0;
  const calls = scenario.calls.map((step, index) => {
    if (step.approve) {
      if (step.stepUp) {
        // A stepUpFails scenario IS the failure demo: whatever the client sends, the mock models a factor that does not complete
        // (a push denied on the phone, or a wrong code). The scenario owns the outcome; the client's input is not honoured.
        const forced = scenario.stepUpFails === true
          ? { ok: false, reason: scenario.stepUpFailsReason || "the push was denied on the device (simulated)" }
          : verifyStepUp(stepUp || {});
        const attempt = forced;
        if (!attempt.ok) {
          return {
            index, kind: "approval", tool: null, ok: false, verdict: "rejected", http: 401,
            reason: `the approver's step-up failed: ${attempt.reason || "the factor was not completed"}. The approval never records; the hold stands.`,
            approvalId: approvalIdFor(1), approver: APPROVER, approvals, hops: [], trace: null, stepUpFailed: true
          };
        }
      }
      approvals += 1;
      return {
        index, kind: "approval", tool: null, ok: true, verdict: "approved", http: null,
        reason: `a human approved ${approvalIdFor(1)}${step.stepUp ? " after completing the PingID step-up" : ""} (simulated): approval_count is now ${approvals}`,
        approvalId: approvalIdFor(1), approver: APPROVER, approvals, hops: [], trace: null
      };
    }
    const result = callTool({ token, tool: step.tool, action: step.action, approvals, policies, verifyFn: pf.verify });
    return {
      index,
      kind: "call",
      tool: step.tool,
      action: step.action,
      http: result.http,
      ok: result.ok,
      verdict: result.verdict,
      reason: result.reason,
      approvals,
      hops: result.hops.map(({ payload, ...h }) => ({ ...h, traceparent: trace.child() })),
      trace: doorTrace({ token, tool: step.tool, action: step.action, result, traceparent: trace.child() })
    };
  });
  return {
    id: nextRunId(),
    at: new Date().toISOString(),
    scenario: scenario.id,
    case: scenario.case,
    label: scenario.label,
    door: DOOR,
    traceparent: trace.root,
    policies: policies.map((p) => ({ ...p, cedar: cedarText(p) })),
    token: tokenSummary(token, { edited: Boolean(issued) }),
    ...(issued ? { issued: tokenSummary(issued) } : {}),
    calls
  };
}

// "Ask the agent": the scripted agent turns the viewer's prompt into tool calls (agent.js), and the scenario supplies the door setup (its
// policies, token scope, Active or Candidate, and whether an approval needs the approver's step-up). A first pass finds the calls the door
// holds; with `approved` the run adds one simulated approval and retries them. The prompt can only choose tools: the action of the calls
// (attended or unattended) comes from the scenario's own calls, so no typed word reaches a policy, a token or the action a policy matches.
export function askAgent({ prompt, scenario, approved = false, stepUp = null }, trace = startTrace()) {
  const plan = planPrompt(prompt, (scenario.calls.find((c) => c.tool) || {}).action);
  let run = runScenario({ ...scenario, calls: plan.calls }, trace, stepUp);
  let retried = false;
  const held = run.calls.filter((c) => c.verdict === "held").map((c) => c.tool);
  if (approved && held.length) {
    // The door is deterministic, so the pass above found exactly the held calls; this pass is the one that is shown.
    run = runScenario({ ...scenario, calls: callsFor(plan, { approved, heldTools: held, stepUp: scenario.stepUp === true }) }, trace, stepUp);
    retried = true;
  }
  const exchanges = [];
  if (plan.calls.length && run.token) {
    exchanges.push({ step: 1, title: "Agent asks the mock PingFederate for a token", status: 200, trace: tokenExchange({ token: run.issued || run.token, scope: scenario.scope, traceparent: trace.child() }) });
  }
  for (const c of run.calls) {
    if (c.trace) exchanges.push({ step: exchanges.length + 1, title: `Agent calls the door: tools/call ${c.tool} (${c.action})`, status: c.trace.response ? c.trace.response.status : null, trace: c.trace });
  }
  // Waiting for a person: held and not yet approved, or an approval that did not record (a wrong code) so the person may try again.
  // The scenario that IS the failed-step-up demo never offers a second try: its hold stands.
  const approvalFailed = retried && run.calls.some((c) => c.kind === "approval" && !c.ok);
  const awaitingApproval = held.length > 0 && (!retried || (approvalFailed && scenario.stepUpFails !== true));
  return {
    run: { ...run, prompt },
    plan: { tools: plan.calls.map((c) => c.tool), action: plan.action, unattended: plan.unattended },
    transcript: transcriptFor({ prompt, plan, run, approved: retried }),
    exchanges,
    awaitingApproval,
    stepUp: scenario.stepUp === true
  };
}

export function buildServer({ netguard, customer = loadCustomerConfig(), realEnvPath: realEnvPathOpt } = {}) {
  // Rule 1: zero real outbound by default. The mock issuer/gateway/backend are
  // in-process, so nothing here has a reason to leave the machine.
  installNetguard();
  const app = express();
  app.disable("x-powered-by");
  // Rule 14: every API response carries a traceparent; a valid incoming one continues its trace.
  app.use("/api", (req, res, next) => {
    req.trace = startTrace(req.headers.traceparent);
    res.set("traceparent", req.trace.root);
    next();
  });
  // Host and write-origin are checked BEFORE the body is read or parsed (HI-3, HI-4).
  const allowedHosts = parseAllowedHosts(process.env.LAB_ALLOWED_HOSTS, PORT_DEFAULT);
  app.use(hostGuard(allowedHosts));
  app.use(writeGuard(allowedHosts));
  app.use("/api", (req, res, next) => {
    const asked = req.headers["x-workspace-id"];
    if (asked !== undefined && !WORKSPACE_ID.test(asked)) {
      return res.status(400).json({ error: "bad_workspace", message: "X-Workspace-Id must be 1 to 64 characters of A-Z a-z 0-9 . _ -" });
    }
    req.workspace = asked === undefined ? DEFAULT_WORKSPACE : asked;
    next();
  });
  // Writes must be JSON: express.json skips other types, so refuse them explicitly.
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const ct = String(req.headers["content-type"] || "");
    if (!ct.includes("application/json")) return res.status(415).json({ error: "unsupported_media_type", message: "content-type must be application/json" });
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  // The mock door still behaves as written: every scenario's verdicts match what it says. Refreshed in the background.
  const health = createHealth({
    check: () => SCENARIOS.every((sc) => runScenario(sc, undefined, sc.stepUp && !sc.stepUpFails ? { factor: "push" } : undefined).calls.every((c, i) => c.verdict === sc.expect[i]))
  });
  app.use("/api/health", health.router);

  // Story mode wording (shared pattern: shared/story/README.md in AI-DEMO-Standalone). The page's live Story (and any later video) reads this one copy of captions.md.
  app.get("/api/story", (req, res) => {
    const { status, body } = storyResponse();
    res.status(status).json(body);
  });

  // Test-suite port verification (active only when the test helper sets WI_VERIFY_PORT):
  // the verifier round-trips a unique marker through the app itself, proving the connection
  // reached THIS server and not a foreign listener the OS shared the ephemeral port with.
  app.get("/api/__port-verify", (req, res) => {
    if (!process.env.WI_VERIFY_PORT) return res.status(404).json({ error: "not_found" });
    res.setHeader("x-wi-port-verify", String(req.headers["x-wi-port-verify"] || ""));
    res.json({ ok: true });
  });

  // Real mode, owner-gated: available only when a valid local .env exists (never in the Docker standalone, which mounts none). The .env is
  // re-read per request, so an edit takes effect without a restart. The reason never contains a value from the file. Only the act.sub case
  // of this lab has a real counterpart the probe can exercise; hold and scope stay simulated even in Real mode (the panel says so).
  const realEnvPath = realEnvPathOpt || process.env.REAL_PROBE_ENV || join(__dirname, "..", "..", ".env");
  let realResult = null; // the last real run, in memory only; never written to disk, replaced on each run
  const realState = () => realModeState(realEnvPath);
  const REAL_OFF_REASON = (rs) => rs.available
    ? REAL_REASON
    : `Real needs a local .env this server can use (${rs.reason}). The Docker standalone has none and stays Mock.`;

  app.get("/api/info", (req, res) => {
    const rs = realState();
    res.json({ source: state.source, realAvailable: rs.available, realReason: REAL_OFF_REASON(rs) });
  });

  app.post("/api/mode", (req, res) => {
    // Rule 19: the body is exactly {source}; an unknown key, an array or a missing body is a 400.
    const body = req.body;
    const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
    if (keys.length !== 1 || keys[0] !== "source") return res.status(400).json({ error: "bad_request", message: "body must be exactly {source:\"mock\"|\"real\"}" });
    const { source } = body;
    if (source === "real") {
      const rs = realState();
      if (!rs.available) return res.status(409).json({ error: "real_unavailable", message: REAL_OFF_REASON(rs) });
      state.source = "real";
      return res.json({ source: state.source });
    }
    if (source !== "mock") return res.status(400).json({ error: "bad_request", message: "body must be exactly {source:\"mock\"|\"real\"}" });
    state.source = "mock";
    res.json({ source: state.source });
  });

  // The real run: same four read-only POSTs as `npm run real`, executed on the page's behalf. The netguard hole is scoped to the two .env
  // origins and exists only for the duration of this run; without a valid .env this answers 409 and nothing leaves the machine.
  app.post("/api/real/run", (req, res) => {
    const rs = realState();
    if (!rs.available) return res.status(409).json({ error: "real_unavailable", message: REAL_OFF_REASON(rs) });
    if (state.source !== "real") return res.status(409).json({ error: "not_real_mode", message: "switch Mode to Real first" });
    const restoreHole = installNetguard().addAllowlist((h) => h === new URL(rs.env.PF_ISSUER).hostname || h === new URL(rs.env.DOOR_URL).hostname);
    runRealProbe(rs)
      .then((result) => { realResult = result; res.json(result); })
      .catch((e) => res.status(502).json({ error: "real_run_failed", message: String(e.message || e) }))
      .finally(restoreHole);
  });

  app.get("/api/real/last", (req, res) => {
    res.json({ result: realResult });
  });

  // The header's Shelf button and the verification mark ask this lab for the shelf's address. Opened on its own port the lab answers with
  // only { shelfUrl } (from SHELF_URL, null when unset), so the page makes no failing call; behind the lab-proxy the shelf answers it.
  app.get("/api/shelf", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ shelfUrl: String(process.env.SHELF_URL || "").trim().replace(/\/+$/, "") || null });
  });

  // ?pack=<id> picks the vertical pack the stories are told in (rule 10); without it the customer.config default is used (rule 12).
  app.get("/api/catalog", (req, res) => {
    const asked = req.query.pack;
    const pack = asked === undefined ? customer.pack : asked;
    if (typeof pack !== "string" || !Object.hasOwn(PACKS, pack)) {
      return res.status(400).json({ error: "unknown_pack", message: `unknown pack; one of ${Object.keys(PACKS).join(", ")}` });
    }
    res.json({
      pack,
      packs: packList(),
      org: customer.org,
      stories: storiesFor(pack, customer.org),
      door: DOOR,
      mockNote: MOCK_NOTE,
      cases: CASES,
      scenarios: SCENARIOS.map(({ policies, policyState, calls, ...s }) => ({ ...s, policyState: policyState || "Active", policyCount: policies.length, callCount: calls.length })),
      guide: GUIDE,
      isIsNot: IS_IS_NOT,
      evidence: EVIDENCE
    });
  });

  // Run a scenario by id against the mock door.
  app.post("/api/run", (req, res) => {
    const { scenario, stepUp } = req.body || {};
    const found = SCENARIOS.find((s) => s.id === scenario);
    if (!found) return res.status(400).json({ error: "unknown_scenario", message: `unknown scenario; one of ${SCENARIOS.map((s) => s.id).join(", ")}` });
    const run = runScenario(found, req.trace, stepUp);
    recordRun(req.workspace, run);
    res.json(run);
  });

  // Ask the agent: { prompt, scenario } and optionally { approved: true, stepUp } to approve the held call and let the agent retry.
  app.post("/api/agent/ask", (req, res) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    const extra = body ? Object.keys(body).filter((k) => !["prompt", "scenario", "approved", "stepUp"].includes(k)) : [];
    if (!body || extra.length) return res.status(400).json({ error: "bad_request", message: "body must be {prompt, scenario} with optional approved and stepUp" });
    const checked = checkPrompt(body.prompt);
    if (!checked.ok) return res.status(400).json({ error: "bad_prompt", message: checked.message });
    const found = SCENARIOS.find((s) => s.id === body.scenario);
    if (!found) return res.status(400).json({ error: "unknown_scenario", message: `unknown scenario; one of ${SCENARIOS.map((s) => s.id).join(", ")}` });
    if (body.approved !== undefined && typeof body.approved !== "boolean") return res.status(400).json({ error: "bad_request", message: "approved must be true or false" });
    const answer = askAgent({ prompt: checked.text, scenario: found, approved: body.approved === true, stepUp: body.stepUp || null }, req.trace);
    recordRun(req.workspace, answer.run);
    res.json(answer);
  });

  // The step-up factors the mock PingID gate offers, and the demo OTP (a labelled demo bypass, never a real credential).
  app.get("/api/stepup", (req, res) => {
    res.json({ factors: STEP_UP_FACTORS, demoOtp: DEMO_OTP });
  });

  app.get("/api/runs", (req, res) => res.json({ runs: runsOf(req.workspace) }));

  app.post("/api/reset", (req, res) => {
    state.workspaces.delete(req.workspace);
    res.json({ ok: true });
  });

  if (netguard) netguard(app);

  // Serve the built UI when present (Docker/dev build).
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api(\/|$)).*/, (req, res) => res.sendFile(join(distDir, "index.html")));
  }

  // Rule 23: whatever is left is a structured JSON answer, never Express's HTML page, and an error never leaks its message or stack.
  app.use((req, res) => res.status(404).json({ error: "not_found", message: "no such route" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number(err && (err.status || err.statusCode));
    if (err && err.type === "entity.too.large") return res.status(413).json({ error: "payload_too_large", message: "the request body is over 64 KB" });
    if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) return res.status(400).json({ error: "bad_json", message: "the request body is not valid JSON" });
    if (status >= 400 && status < 500) return res.status(status).json({ error: "bad_request", message: "the request could not be read" });
    return res.status(500).json({ error: "internal_error", message: "the lab server hit an unexpected error" });
  });

  return app;
}

// The server's state, with the runs of one workspace ("default" unless asked).
export function readState(workspace = DEFAULT_WORKSPACE) {
  return { source: state.source, runs: runsOf(workspace) };
}

// Entry point when run directly (`node server/src/index.js`).
const invoked = process.argv[1] && new URL("file://" + process.argv[1]).pathname;
if (invoked && invoked === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT || PORT_DEFAULT);
  // Host binding: 0.0.0.0 when explicitly asked (Docker routes to the container
  // via its eth0 address); the Docker publish pins 127.0.0.1 on the HOST, which
  // is the loopback-only guarantee. Bare host runs default to loopback.
  const bind = process.env.BIND_ALL === "1" ? "0.0.0.0" : "127.0.0.1";
  buildServer().listen(port, bind, () => {
    console.log(`${APP_ID} listening on http://${bind}:${port}`);
  });
}
