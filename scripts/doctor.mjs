#!/usr/bin/env node
// Preflight: netguard self-test, health, the mock door behaves as written, Real is refused, reset works.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// Netguard self-test: every route out is refused and recorded (rule 1).
const ng = await import(new URL("../server/src/netguard.js", import.meta.url));
const ngResult = await ng.netguardSelfTest();
ok(`netguard self-test (${ngResult.blocked}/8 routes blocked)`, ngResult.ok, ngResult.ok ? "" : ngResult.detail);

// Use a doctor-only port so the check never collides with a running lab.
const PORT = Number(process.env.DOCTOR_PORT || 17820);
const base = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ["server/src/index.js"], {
  env: { ...process.env, PORT: String(PORT), LAB_ALLOWED_HOSTS: `localhost:${PORT},127.0.0.1:${PORT}` },
  stdio: "ignore"
});

const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(body || {}) });

try {
  let healthy = false;
  for (let i = 0; i < 40 && !healthy; i++) {
    await sleep(250);
    try { healthy = (await fetch(`${base}/api/health`)).status === 200; } catch { /* not up yet */ }
  }
  ok("server healthy", healthy);

  const healthRes = await fetch(`${base}/api/health`);
  const health = await healthRes.json();
  ok("health contract demo-health/1: schema, state ready, runtime offline, no-store", health.schema === "demo-health/1" && health.state === "ready" && health.runtime === "offline" && health.demo?.id === "cedar-in-privilege-lab" && healthRes.headers.get("cache-control") === "no-store");
  ok("API answers carry a W3C traceparent", /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(healthRes.headers.get("traceparent") || ""));
  const missing = await fetch(`${base}/api/nope`);
  const missingBody = await missing.json().catch(() => null);
  ok("an unknown API route is a JSON error, not an HTML page", missing.status === 404 && missingBody?.error === "not_found" && typeof missingBody?.message === "string");

  const info = await (await fetch(`${base}/api/info`)).json();
  ok("info reports mock, Real unavailable with a reason", info.source === "mock" && info.realAvailable === false && /local \.env/.test(info.realReason) && /Docker standalone/.test(info.realReason));

  const run = async (scenario) => (await post("/api/run", { scenario })).json();
  const held = await run("hold-1-held");
  ok("case 1: an unattended call with no approval is HELD (HTTP 202, simulated), with an approval id", held.calls[0].verdict === "held" && held.calls[0].http === 202 && /approval-example-1/.test(held.calls[0].reason));
  const retried = await run("hold-2-approve");
  ok("case 1: held, approved, retried: held then approved then allowed", retried.calls.map((c) => c.verdict).join() === "held,approved,allowed");

  const without = await run("scope-1-without");
  ok("case 2: a token without the scope is refused with the policy reason", without.calls[0].http === 400 && /action denied by policy: SearchIndexTool requires the index:search-example scope/.test(without.calls[0].reason));
  const withScope = await run("scope-2-with");
  ok("case 2: a token with the scope is allowed", withScope.calls[0].verdict === "allowed" && withScope.calls[0].http === 200);

  const base1 = await run("actsub-1-baseline");
  ok("case 3 baseline: both tools allowed", base1.calls.length === 2 && base1.calls.every((c) => c.http === 200));
  const same = await run("actsub-2-gate");
  ok("the run shows the raw mock token, labelled mock", same.token?.mock === true && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(same.token.token));
  const [count, list] = same.calls;
  ok("case 3: CountTool allowed", count.tool === "CountTool" && count.http === 200);
  ok("case 3: ListIndexTool refused with the policy reason", list.tool === "ListIndexTool" && list.http === 400 && /action denied by policy: ListIndexTool requires act\.sub to be agent-b-example/.test(list.reason));

  const ask = await (await post("/api/agent/ask", { prompt: "Count the entries, then list the index.", scenario: "actsub-2-gate" })).json();
  ok("ask the agent: the scripted agent's calls reach the door (CountTool allowed, ListIndexTool refused), with the token request first", ask.run?.calls?.map((c) => c.verdict).join() === "allowed,refused" && ask.exchanges?.length === 3 && /token/i.test(ask.exchanges[0].title));
  const idle = await (await post("/api/agent/ask", { prompt: "make me a sandwich", scenario: "actsub-2-gate" })).json();
  ok("ask the agent: a prompt with no tool word makes no call", idle.run?.calls?.length === 0 && idle.exchanges?.length === 0);

  const real = await post("/api/mode", { source: "real" });
  ok("real mode refused 409", real.status === 409);

  await post("/api/reset", {});
  const runs = await (await fetch(`${base}/api/runs`)).json();
  ok("reset clears runs", runs.runs.length === 0);
} finally {
  server.kill();
}

console.log(failures ? `doctor: ${failures} FAIL` : "doctor: all checks PASS");
process.exit(failures ? 1 : 0);
