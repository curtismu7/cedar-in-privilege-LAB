// Real mode, owner-gated: the server runs the SAME read-only probe `npm run real` runs, but on the page's behalf, only when a valid local .env
// exists and only while a run is in flight. Everything here leans on scripts/real-probe-lib.mjs untouched: the same parseEnv/validateEnv gate,
// the same classifyVerdict mapping, the same redact() on every string that leaves this module.
//
// Guard contract (the whole point of this file):
//   - When no valid .env exists, NOTHING in this module is active: /api/info keeps realAvailable:false and the netguard stays fully closed.
//   - A valid .env opens exactly two origins (the PF token endpoint's origin and the door's origin) in the netguard — allowlisted, not "network on".
//   - The allowlist is recomputed only from validated .env values, never from a request. A request can trigger a run; it cannot widen the hole.
//   - Secrets never leave this module except through redact(); the client secret and the Basic value are never returned in any response.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseEnv, validateEnv, parseMcpBody, classifyVerdict, isInconclusive, isAllGrantRefused, toolNames, describeAct, redact, probeCalls, basicAuthValue } from "../../scripts/real-probe-lib.mjs";

const TIMEOUT_MS = 15000;
const MAX_BYTES = 256 * 1024;

export function realModeState(envPath) {
  if (!existsSync(envPath)) return { available: false, reason: "no .env file" };
  const check = validateEnv(parseEnv(readFileSync(envPath, "utf8")));
  if (!check.ok) {
    const why = [...check.missing.length ? [`missing: ${check.missing.join(", ")}`] : [], ...check.problems].join("; ");
    return { available: false, reason: `.env is not usable: ${why}. Edit .env (see .env.example)` };
  }
  const env = parseEnv(readFileSync(envPath, "utf8"));
  return {
    available: true,
    env,
    issuerOrigin: new URL(env.PF_ISSUER).origin,
    doorOrigin: new URL(env.DOOR_URL).origin,
  };
}

const LOOPBACK_OK = (h) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

// While a real run is in flight, allow fetch/socket/DNS to exactly the two .env origins (and to loopback, which the guard always allowed).
// Every other host keeps failing exactly as before. Returns a restore().
export function openScopedHole(netguard, state) {
  const allowed = new Set([new URL(state.env.PF_ISSUER).hostname, new URL(state.env.DOOR_URL).hostname]);
  const ok = (h) => LOOPBACK_OK(h) || allowed.has(String(h));
  return netguard.addAllowlist(ok);
}

// One real run: the probe's four POSTs, nothing else. Returns the shape the UI renders; every text passes through redact().
export async function runRealProbe(state, fetchImpl = globalThis.fetch) {
  const { env } = state;
  const secrets = [env.PF_CLIENT_SECRET, basicAuthValue(env.PF_CLIENT_ID, env.PF_CLIENT_SECRET)];
  const post = async (url, headers, body) => {
    const res = await fetchImpl(url, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const reader = res.body.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error("reply larger than the size cap"); }
      chunks.push(value);
    }
    return { status: res.status, text: Buffer.concat(chunks).toString("utf8") };
  };
  const basic = basicAuthValue(env.PF_CLIENT_ID, env.PF_CLIENT_SECRET);
  const tokenUrl = new URL("/as/token.oauth2", env.PF_ISSUER).toString();
  const r = await post(tokenUrl, { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: `Basic ${basic}` },
    new URLSearchParams({ grant_type: "client_credentials", scope: env.PF_SCOPE, audience: env.DOOR_URL }).toString());
  const tj = parseMcpBody(r.text);
  if (r.status !== 200 || !tj || typeof tj.access_token !== "string") {
    throw new Error(redact(`PingFederate did not issue a token (HTTP ${r.status}): ${(tj && (tj.error_description || tj.error)) || "no JSON reply"}`, secrets));
  }
  const token = tj.access_token;
  secrets.push(token);
  let claims = null;
  try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { /* opaque token */ }
  const act = describeAct(claims);
  let id = 0;
  const rpc = async (method, params) => {
    id += 1;
    const rr = await post(env.DOOR_URL, { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
      JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return { status: rr.status, body: parseMcpBody(rr.text) };
  };
  const calls = [];
  const list = await rpc("tools/list", {});
  const listV = classifyVerdict(list);
  calls.push({ tool: "tools/list", ...listV, tools: toolNames(list.body) });
  for (const call of probeCalls(env.PROBE_INDEX)) {
    calls.push({ tool: call.name, ...classifyVerdict(await rpc("tools/call", call)) });
  }
  return {
    at: new Date().toISOString(),
    issuerOrigin: state.issuerOrigin,
    doorOrigin: state.doorOrigin,
    act: act.actType,
    actSub: act.actSub,
    tokenShown: token.length >= 8 && token.length <= 8192 ? token : null,   // shown on purpose (learning lab), labelled REAL in the UI; secret never
    calls: calls.map((c) => ({ ...c, reason: c.reason ? redact(c.reason, secrets) : c.reason })),
    inconclusive: calls.some(isInconclusive) || isAllGrantRefused(calls),
  };
}
