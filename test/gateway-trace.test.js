// "What Privilege did" (Rule 25): the vendored files are pinned by sha256. Every trace this lab builds is tested in server.test.js (assertTrace).
// Re-vendor (cp, never edit), then re-pin: cd web/src/gateway-trace && shasum -a 256 GatewayTrace.jsx gateway-trace.css gateway-trace.test.jsx
// (gatewayTrace.js in server/src is pinned by the same file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTrace } from "../server/src/gatewayTrace.js";
import { doorTrace } from "../server/src/cedarTrace.js";
import { callTool, DOOR_URL, ISSUER, AGENT_A } from "../server/src/cedar.js";
import { policiesFor, POLICY_A, POLICY_B } from "../server/src/scenarios.js";
import * as pf from "../server/src/pf.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = "web/src/gateway-trace";
const WHERE = { "GatewayTrace.jsx": WEB, "gateway-trace.css": WEB, "gateway-trace.test.jsx": WEB, "gatewayTrace.js": "server/src" };
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
const pins = readFileSync(join(root, WEB, "gateway-trace.sha256"), "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => l.split(/\s+/));

test("every vendored gateway-trace file matches its pinned sha256, and all four are pinned", () => {
  assert.deepEqual(pins.map(([, f]) => f).sort(), Object.keys(WHERE).sort());
  for (const [hash, file] of pins) assert.equal(sha(`${WHERE[file]}/${file}`), hash, `${file} differs from gateway-trace.sha256 (hand-edited, or re-vendored without re-pinning)`);
});

// Rule 4 (owner): a mock-issued token is shown raw and labelled mock. The trace is source "mock"; the token it carries is the lab's own
// HS256 fixture JWT (signs nothing real). A real trace would never hold a full bearer (assertTrace), and this lab builds none.
test("a mock trace carries the raw mock token as the bearer, and it is a token the mock issuer signed", () => {
  const token = pf.mintAgentToken({ agent: AGENT_A, clientId: AGENT_A, audience: DOOR_URL, issuer: ISSUER });
  const policies = policiesFor([POLICY_A, POLICY_B]);
  const result = callTool({ token, tool: "CountTool", policies, verifyFn: pf.verify });
  const t = doorTrace({ token, tool: "CountTool", result, traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01` });
  assert.deepEqual(assertTrace(t), []);
  assert.equal(t.source, "mock");
  assert.equal(t.request.headers.authorization, `Bearer ${token}`);
  assert.equal(pf.verify(t.request.headers.authorization.slice("Bearer ".length)).ok, true, "it verifies under the mock fixture key");
  assert.equal(t.request.headers.traceparent, `00-${"a".repeat(32)}-${"b".repeat(16)}-01`);
  const none = doorTrace({ token: null, tool: "CountTool", result: callTool({ token: null, tool: "CountTool", policies, verifyFn: pf.verify }), traceparent: `00-${"a".repeat(32)}-${"c".repeat(16)}-01` });
  assert.equal(none.request.headers.authorization, undefined, "no token, no Authorization header");
  assert.equal(none.request.headers.traceparent, `00-${"a".repeat(32)}-${"c".repeat(16)}-01`);
});

test("this lab is mock only, so no real trace exists: a real trace is not built anywhere in the server", () => {
  const index = readFileSync(join(root, "server/src/index.js"), "utf8");
  assert.ok(!/realTrace|failureTrace|traceFromDoor/.test(index));
});
