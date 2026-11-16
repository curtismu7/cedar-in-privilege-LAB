import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { buildServer, readState, runScenario } from "../server/src/index.js";
import { installNetguard } from "../server/src/netguard.js";
import { createHealth } from "../server/src/health.js";
import express from "express";
import * as pf from "../server/src/pf.js";
import { SCENARIOS } from "../server/src/scenarios.js";

const HOST = "localhost:7820";
const TRACEPARENT = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;
const JWT = /^eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/;

async function withServer(fn) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  process.env.LAB_ALLOWED_HOSTS = "localhost:7820,127.0.0.1:7820";
  const srv = buildServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const j = async (p, b, method = "POST") => {
    const res = await fetch(base + p, {
      method,
      headers: { "content-type": "application/json", ...(method !== "GET" ? { origin: base } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(b || {})
    });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(j, base); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

// A server built with the given LAB_ALLOWED_HOSTS value (undefined = the server's own default list), and a raw HTTP helper
// that can set Host (fetch cannot be trusted to).
async function withRaw(env, fn, opts = {}) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  if (env === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = env;
  const srv = buildServer(opts).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  const raw = (method, path, headers = {}, body) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
  try { await fn(raw, port); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

const run = async (j, scenario) => (await j("/api/run", { scenario })).body;
const call = (r, tool) => r.calls.find((c) => c.tool === tool);

// What the shelf reads (demo-shelf-LAB server/src/poller.js parseHealth and docs/health-contract.md), restated here so the test is portable.
const HEALTH_STATES = new Set(["ready", "needs-setup", "broken", "unknown"]);
function parseHealth(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  if (j.schema === undefined) return null;
  if (j.schema !== "demo-health/1") return { state: "unknown", reason: "unknown-schema" };
  if (!HEALTH_STATES.has(j.state)) return { state: "unknown", reason: "bad-state" };
  return { state: j.state, runtime: ["offline", "live"].includes(j.runtime) ? j.runtime : null, demo: j.demo };
}

test("R15 health: GET /api/health is a demo-health/1 document the shelf's own parser reads as ready", async () => {
  await withServer(async (j, base) => {
    const res = await fetch(base + "/api/health");
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.ok(text.length < 4096, "the contract caps the reply at 4 KB");
    const body = JSON.parse(text);
    assert.equal(body.schema, "demo-health/1");
    assert.equal(body.state, "ready");
    assert.equal(body.runtime, "offline");
    assert.ok(!Number.isNaN(Date.parse(body.at)) && body.at.length <= 40);
    const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
    assert.deepEqual(body.demo, { id: "cedar-in-privilege-lab", name: "Cedar in Privilege", version });
    assert.ok(body.demo.id.length <= 64 && body.demo.name.length <= 80 && body.demo.version.length <= 32);
    assert.deepEqual(parseHealth(text), { state: "ready", runtime: "offline", demo: body.demo });
    // The contract is public, GET only, no counts, no per-check detail: nothing else is in the document.
    assert.deepEqual(Object.keys(body).sort(), ["at", "demo", "runtime", "schema", "state"]);
    const post = await j("/api/health", {});
    assert.equal(post.status, 405);
    assert.equal(post.body.error, "method_not_allowed");
  });
});

test("a scenario run makes zero outbound attempts", () => {
  const g = installNetguard();
  const before = g.attempts.length;
  for (const s of SCENARIOS) runScenario(s);
  assert.equal(g.attempts.length, before);
});

test("mode: Real is refused 409 with the reason, bogus 400, mock accepted", async () => {
  await withServer(async (j) => {
    const real = await j("/api/mode", { source: "real" });
    assert.equal(real.status, 409);
    assert.equal(real.body.error, "real_unavailable");
    assert.match(real.body.message, /not available in this lab/);
    assert.match(real.body.message, /cedar-act-sub-LAB/);
    assert.match(real.body.message, /npm run real/);
    const bogus = await j("/api/mode", { source: "bogus" });
    assert.equal(bogus.status, 400);
    assert.equal(typeof bogus.body.error, "string");
    assert.equal(typeof bogus.body.message, "string");
    const mock = await j("/api/mode", { source: "mock" });
    assert.equal(mock.status, 200);
    assert.equal(mock.body.source, "mock");
  });
});

test("the page's /api/shelf call is answered with { shelfUrl } and never 404s", async () => {
  const saved = process.env.SHELF_URL;
  try {
    await withServer(async (j, base) => {
      delete process.env.SHELF_URL;
      let res = await fetch(base + "/api/shelf");
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { shelfUrl: null });
      process.env.SHELF_URL = "https://shelf.example/";
      res = await fetch(base + "/api/shelf");
      assert.deepEqual(await res.json(), { shelfUrl: "https://shelf.example" });
    });
  } finally { if (saved === undefined) delete process.env.SHELF_URL; else process.env.SHELF_URL = saved; }
});

test("info reports Real unavailable with a visible reason", async () => {
  await withServer(async (j, base) => {
    const body = await (await fetch(base + "/api/info", { headers: { host: HOST } })).json();
    assert.equal(body.realAvailable, false);
    assert.equal(body.source, "mock");
    assert.match(body.realReason, /npm run real/);
    assert.match(body.realReason, /cedar-act-sub-LAB/);
    assert.match(body.realReason, /never calls out/);
  });
});

test("R14 every simulated call and hop carries a well-formed traceparent of one trace, and the run record carries its own", async () => {
  await withServer(async (j) => {
    for (const s of SCENARIOS) {
      const r = await run(j, s.id);
      assert.match(r.traceparent, TRACEPARENT, s.id);
      const traceId = r.traceparent.split("-")[1];
      const spans = new Set([r.traceparent.split("-")[2]]);
      const made = r.calls.filter((c) => c.kind === "call");
      assert.equal(made.length, s.calls.filter((x) => !x.approve).length, `${s.id}: a human approval is not a gateway call and carries no trace`);
      for (const c of made) {
        const tp = c.trace.request.headers.traceparent;
        assert.match(tp, TRACEPARENT, `${s.id}/${c.tool} request`);
        assert.equal(tp.split("-")[1], traceId, "one trace per run");
        spans.add(tp.split("-")[2]);
        assert.ok(c.hops.length >= 1);
        for (const h of c.hops) {
          assert.match(h.traceparent, TRACEPARENT, `${s.id}/${c.tool}/${h.stage}`);
          assert.equal(h.traceparent.split("-")[1], traceId);
          spans.add(h.traceparent.split("-")[2]);
        }
      }
      const expected = 1 + made.reduce((n, c) => n + 1 + c.hops.length, 0);
      assert.equal(spans.size, expected, "a new span id per hop and per call");
    }
  });
});

test("R14 API responses carry traceparent: a valid incoming one continues its trace, an invalid one starts a new trace", async () => {
  await withRaw(undefined, async (raw, port) => {
    const incoming = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const cont = await raw("GET", "/api/health", { traceparent: incoming });
    assert.match(cont.headers.traceparent, TRACEPARENT);
    assert.equal(cont.headers.traceparent.split("-")[1], "0af7651916cd43dd8448eb211c80319c");
    assert.notEqual(cont.headers.traceparent.split("-")[2], "b7ad6b7169203331", "a new span for this hop");
    for (const bad of ["garbage", "00-" + "0".repeat(32) + "-b7ad6b7169203331-01", "00-0af7651916cd43dd8448eb211c80319c-" + "0".repeat(16) + "-01", incoming.toUpperCase(), incoming + "-x"]) {
      const r = await raw("GET", "/api/health", { traceparent: bad });
      assert.match(r.headers.traceparent, TRACEPARENT, bad);
      assert.notEqual(r.headers.traceparent.split("-")[1], bad.split("-")[1]);
    }
    // POST /api/run: the header on the response is the run's own traceparent, and it continues the incoming trace.
    const body = JSON.stringify({ scenario: "actsub-2-gate" });
    const post = await raw("POST", "/api/run", { traceparent: incoming, "content-type": "application/json", origin: `http://127.0.0.1:${port}`, "content-length": Buffer.byteLength(body) }, body);
    assert.equal(post.status, 200);
    assert.equal(post.headers.traceparent, post.json.traceparent);
    assert.equal(post.json.traceparent.split("-")[1], "0af7651916cd43dd8448eb211c80319c");
    for (const c of post.json.calls) assert.equal(c.trace.request.headers.traceparent.split("-")[1], "0af7651916cd43dd8448eb211c80319c");
    // Errors carry it too.
    assert.match((await raw("GET", "/api/nope")).headers.traceparent, TRACEPARENT);
    assert.match((await raw("GET", "/api/health", { host: "evil.example" })).headers.traceparent, TRACEPARENT);
  });
});

// R23: every API error is structured JSON { error, message }, never an HTML page, a stack trace or a blank body.
test("R23 a malformed, oversized or non-object body is a JSON error, not an HTML page, and leaks no stack or path", async () => {
  await withRaw(undefined, async (raw, port) => {
    const h = (body) => ({ "content-type": "application/json", origin: `http://127.0.0.1:${port}`, "content-length": Buffer.byteLength(body) });
    const cases = [
      ["malformed", '{"scenario":', 400, "bad_json"],
      ["garbage", "not json at all", 400, "bad_json"],
      ["bare string", '"x"', 400, "bad_json"],
      ["null", "null", 400, "bad_json"],
      ["too large", JSON.stringify({ scenario: "x".repeat(70 * 1024) }), 413, "payload_too_large"]
    ];
    for (const [name, body, status, code] of cases) {
      const r = await raw("POST", "/api/run", h(body), body);
      assert.equal(r.status, status, name);
      assert.match(r.headers["content-type"], /application\/json/, name);
      assert.equal(r.json.error, code, name);
      assert.equal(typeof r.json.message, "string", name);
      assert.ok(!/<html|<pre|SyntaxError|node_modules|\/Users\/|\/private\/|at parse|stack/i.test(r.text), `${name}: ${r.text.slice(0, 200)}`);
    }
    // Host and origin are checked BEFORE the body is parsed.
    const body = '{"scenario":';
    const evil = await raw("POST", "/api/run", { ...h(body), host: "evil.example" }, body);
    assert.equal(evil.status, 403);
    assert.equal(evil.json.error, "host_not_allowed");
    const cross = await raw("POST", "/api/run", { ...h(body), origin: "https://evil.example" }, body);
    assert.equal(cross.status, 403);
    assert.equal(cross.json.error, "cross_origin");
  });
});

test("R23 an unknown API route, a wrong method and an unhandled error are JSON too", async () => {
  const boom = (app) => { app.get("/api/boom", () => { throw new Error("secret stack detail /Users/someone/x.js"); }); };
  await withRaw(undefined, async (raw, port) => {
    for (const [method, path] of [["GET", "/api/nope"], ["POST", "/api/nope"], ["GET", "/api/run"], ["DELETE", "/api/reset"], ["GET", "/api"], ["GET", "/api/"], ["PUT", "/nope"]]) {
      const headers = method === "GET" ? {} : { "content-type": "application/json", origin: `http://127.0.0.1:${port}`, "content-length": 2 };
      const r = await raw(method, path, headers, method === "GET" ? undefined : "{}");
      assert.equal(r.status, 404, `${method} ${path}`);
      assert.match(r.headers["content-type"], /application\/json/, `${method} ${path}`);
      assert.equal(r.json.error, "not_found");
      assert.equal(typeof r.json.message, "string");
    }
    const r = await raw("GET", "/api/boom");
    assert.equal(r.status, 500);
    assert.match(r.headers["content-type"], /application\/json/);
    assert.deepEqual(Object.keys(r.json).sort(), ["error", "message"]);
    assert.equal(r.json.error, "internal_error");
    assert.ok(!/secret|Users|stack/.test(r.text), "an internal error never leaks its message or stack");
    // 415 and the mode/scenario errors are { error, message } as well.
    const text = await raw("POST", "/api/run", { "content-type": "text/plain", origin: `http://127.0.0.1:${port}`, "content-length": 1 }, "x");
    assert.equal(text.status, 415);
    assert.equal(text.json.error, "unsupported_media_type");
    assert.equal(typeof text.json.message, "string");
  }, { netguard: boom });
});

test("an unknown scenario is a 400 with the list of ids", async () => {
  await withServer(async (j) => {
    const bad = await j("/api/run", { scenario: "nope" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "unknown_scenario");
    assert.match(bad.body.message, /actsub-1-baseline/);
    assert.equal((await j("/api/run", {})).status, 400);
  });
});

// SWAP / HI-3 / HI-6: the Host check is strict, and the lab-proxy names are on the default list.
test("SWAP the lab-proxy host names are accepted by default (so a proxied request is not a 403) and nothing else is", async () => {
  await withRaw(undefined, async (raw, port) => {
    const ok = [
      "cedar-in-privilege-lab.local.ping-devops.com:7820", "cedar-in-privilege-lab:7820", "cedar-in-privilege-lab.local.ping-devops.com:8443", "local.ping-devops.com:8443",
      "localhost:7820", "127.0.0.1:7820", `127.0.0.1:${port}`, `localhost:${port}`
    ];
    for (const host of ok) assert.equal((await raw("GET", "/api/health", { host })).status, 200, host);
    const refused = [
      "evil.example", "evil.example:7820", "localhost:9999", "127.0.0.1:9999", "localhost.evil.example", `localhost.evil.example:${port}`, "other.local.ping-devops.com:8443",
      "cedar-in-privilege-lab.local.ping-devops.com:9999", "cedar-in-privilege-lab", `[::1]:9999`, "0.0.0.0:7820", `127.0.0.1.evil.example:${port}`, "local.ping-devops.com:7820"
    ];
    for (const host of refused) {
      const r = await raw("GET", "/api/health", { host });
      assert.equal(r.status, 403, host);
      assert.equal(r.json.error, "host_not_allowed", host);
    }
  });
});

test("SWAP a write behind the lab-proxy: the proxy's own origin is accepted only with a proxy Host and a matching X-Forwarded-Host", async () => {
  await withRaw(undefined, async (raw, port) => {
    const body = JSON.stringify({ scenario: "actsub-1-baseline" });
    const send = (headers) => raw("POST", "/api/run", { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers }, body);
    const proxyHost = "cedar-in-privilege-lab.local.ping-devops.com:7820";
    const viaProxy = { host: proxyHost, origin: "https://local.ping-devops.com:8443", "x-forwarded-host": "local.ping-devops.com:8443", "x-forwarded-proto": "https" };
    assert.equal((await send(viaProxy)).status, 200);
    assert.equal((await send({ ...viaProxy, "sec-fetch-site": "same-origin" })).status, 200);
    // The same headers from a loopback Host (not the proxy): the forwarded host is not believed.
    assert.equal((await send({ ...viaProxy, host: `127.0.0.1:${port}` })).status, 403);
    // A forwarded host that is not on the list, matching a hostile origin.
    assert.equal((await send({ ...viaProxy, origin: "https://evil.example", "x-forwarded-host": "evil.example" })).status, 403);
    // Origin and forwarded host disagree, or the scheme is wrong.
    assert.equal((await send({ ...viaProxy, origin: "https://other.local.ping-devops.com:8443" })).status, 403);
    assert.equal((await send({ ...viaProxy, "x-forwarded-proto": "http" })).status, 403);
  });
});

test("HI-3 the write guard: same origin only, cross-site fetch metadata refused, no any-port loopback allowance", async () => {
  await withRaw(undefined, async (raw, port) => {
    const body = "{}";
    const send = (headers) => raw("POST", "/api/reset", { "content-type": "application/json", "content-length": 2, ...headers }, body);
    assert.equal((await send({ origin: `http://127.0.0.1:${port}` })).status, 200);
    assert.equal((await send({ origin: `http://127.0.0.1:${port}`, "sec-fetch-site": "same-origin" })).status, 200);
    assert.equal((await send({})).status, 200, "a write with no Origin (a non-browser client) is accepted");
    for (const origin of ["http://127.0.0.1:9", "http://127.0.0.1:9999", "http://localhost:9999", "https://evil.example", "null", "not a url", `http://127.0.0.1:${port}.evil.example`]) {
      const r = await send({ origin });
      assert.equal(r.status, 403, origin);
      assert.equal(r.json.error, "cross_origin", origin);
    }
    for (const site of ["cross-site", "same-site"]) assert.equal((await send({ "sec-fetch-site": site })).status, 403, site);
    assert.equal((await send({ "sec-fetch-site": "none" })).status, 200);
    // X-Forwarded-Host from a loopback Host never vouches for a foreign Origin.
    assert.equal((await send({ origin: "https://evil.example", "x-forwarded-host": "evil.example" })).status, 403);
  });
});

test("host check refuses unknown non-loopback hosts", async () => {
  const srv = buildServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  // node:http directly: fetch forbids setting the Host header.
  const status = await new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/health", headers: { host: "evil.example.com" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(status, 403);
  srv.close();
});

test("cross-origin write refused, and a non-JSON write is a 415", async () => {
  const srv = buildServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  const cross = await fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    headers: { "content-type": "application/json", host: HOST, origin: "http://evil.example.com" },
    body: JSON.stringify({ scenario: "actsub-1-baseline" })
  });
  assert.equal(cross.status, 403);
  const text = await fetch(`http://127.0.0.1:${port}/api/run`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
  assert.equal(text.status, 415);
  srv.close();
});

test("reset clears runs", async () => {
  await withServer(async (j) => {
    await j("/api/run", { scenario: "actsub-1-baseline" });
    assert.ok(readState().runs.length > 0);
    await j("/api/reset");
    assert.equal(readState().runs.length, 0);
  });
});

test("pf verify: signature check and decode", () => {
  const t = pf.mintAgentToken({ agent: "a", clientId: "c", audience: "x", issuer: "i" });
  assert.equal(pf.verify(t).ok, true);
  assert.equal(pf.decodePayload(t).act.sub, "a");
  assert.equal(pf.verify("garbage.token.value").reason, "bad signature");
  assert.equal(pf.verify(t.replace(/.$/, (c) => (c === "A" ? "B" : "A"))).reason, "bad signature");
});

// Residual re-check G6b: a Host that is a loopback name on the allowed list (so the host guard lets it in) must never claim the lab-proxy
// origin through a forged X-Forwarded-Host. Only a non-loopback proxy Host may.
test("G6b a loopback Host on the allowed list plus a forged X-Forwarded-Host and the proxy's Origin is refused 403 cross_origin", async () => {
  await withRaw(undefined, async (raw) => {
    const body = JSON.stringify({ scenario: "actsub-1-baseline" });
    const send = (headers) => raw("POST", "/api/run", { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers }, body);
    const forged = { origin: "https://local.ping-devops.com:8443", "x-forwarded-host": "local.ping-devops.com:8443", "x-forwarded-proto": "https" };
    for (const host of ["localhost:7820", "127.0.0.1:7820"]) {
      const r = await send({ host, ...forged });
      assert.equal(r.status, 403, host);
      assert.equal(r.json.error, "cross_origin", host);
    }
    // the same headers behind the real proxy Host are still believed
    assert.equal((await send({ host: "cedar-in-privilege-lab.local.ping-devops.com:7820", ...forged })).status, 200);
  });
});

// Residual re-check H3: a failing door check must show as `broken`, in a document that still has the demo-health/1 shape.
test("H3 health: a failing door check reports state broken (demo-health/1 shape kept); a throwing check is unknown", async () => {
  const get = async (check) => {
    const health = createHealth({ check });
    const app = express();
    app.use("/api/health", health.router);
    const srv = app.listen(0, "127.0.0.1");
    await new Promise((r) => srv.on("listening", r));
    try {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/health`);
      return { status: res.status, body: await res.json() };
    } finally { health.stop(); srv.close(); }
  };
  const broken = await get(() => false);
  assert.equal(broken.status, 200);
  assert.equal(broken.body.state, "broken");
  assert.equal(broken.body.schema, "demo-health/1");
  assert.equal(broken.body.runtime, "offline");
  assert.deepEqual(Object.keys(broken.body).sort(), ["at", "demo", "runtime", "schema", "state"]);
  assert.equal((await get(() => true)).body.state, "ready");
  assert.equal((await get(() => { throw new Error("boom"); })).body.state, "unknown");
});

// Residual re-check item 5 (rule 19: the body is exactly {source}).
test("mode: any key besides source is a 400 with the structured {error, message} shape; a valid body still works", async () => {
  await withServer(async (j) => {
    for (const body of [{ source: "mock", x: 1 }, { source: "real", x: 1 }, { x: 1 }, { source: "mock", source2: "mock" }, []]) {
      const r = await j("/api/mode", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error, "bad_request");
      assert.match(r.body.message, /exactly/);
    }
    assert.equal((await j("/api/mode", { source: "mock" })).status, 200);
    assert.equal((await j("/api/mode", { source: "real" })).status, 409);
  });
});
