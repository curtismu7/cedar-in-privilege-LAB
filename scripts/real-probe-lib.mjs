// Pure parts of the owner-run real probe: no network, no file access, no process state. Unit-tested without a network.

// The token's audience is DOOR_URL itself (as in the 2026-11-16 scratch run), so there is no separate audience value.
export const REQUIRED_ENV = ["PF_ISSUER", "PF_CLIENT_ID", "PF_CLIENT_SECRET", "PF_SCOPE", "DOOR_URL"];
// Optional: the index CountTool is asked about. The default is the one used in the 2026-11-16 scratch run.
export const DEFAULT_INDEX = "gateway-events";

// The two tool calls of the baseline probe, with the arguments the scratch run used.
export function probeCalls(index) {
  const idx = String(index ?? "").trim() || DEFAULT_INDEX;
  return [
    { name: "CountTool", arguments: { index: idx } },
    { name: "ListIndexTool", arguments: {} }
  ];
}

// HTTP Basic client authentication value (the method used in the scratch run): base64(client_id:client_secret).
export const basicAuthValue = (id, secret) => Buffer.from(`${id}:${secret}`).toString("base64");

// Values the example file ships with: a run with one of these still in place has not been configured.
const PLACEHOLDER_VALUES = new Set(["replace-me", "agent-client-example"]);
const isPlaceholderValue = (v) => PLACEHOLDER_VALUES.has(String(v).trim().toLowerCase());

// KEY=VALUE lines; `#` comments and blank lines skipped; one pair of surrounding quotes removed. No expansion.
export function parseEnv(text) {
  const env = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    let v = m[2];
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const isLoopback = (h) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
const isPlaceholderHost = (h) => /(^|\.)(example|invalid)$/i.test(h);

// -> { ok, missing: [names], problems: [text] }. A value that is still a placeholder host counts as a problem: the probe must not run
// against the example file. Problems never contain a value (the secret is never echoed).
export function validateEnv(env) {
  const missing = REQUIRED_ENV.filter((k) => !String(env?.[k] ?? "").trim());
  const problems = [];
  for (const k of ["PF_ISSUER", "DOOR_URL"]) {
    const v = String(env?.[k] ?? "").trim();
    if (!v) continue;
    let u;
    try { u = new URL(v); } catch { problems.push(`${k} is not a URL`); continue; }
    if (u.username || u.password) problems.push(`${k} must not carry credentials`);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback(u.hostname))) problems.push(`${k} must be https (http only for loopback)`);
    if (isPlaceholderHost(u.hostname)) problems.push(`${k} still has a placeholder host (.example / .invalid): edit .env`);
  }
  for (const k of ["PF_CLIENT_ID", "PF_CLIENT_SECRET"]) {
    const v = String(env?.[k] ?? "").trim();
    if (v && isPlaceholderValue(v)) problems.push(`${k} is still a placeholder from .env.example: edit .env`);
  }
  const scope = String(env?.PF_SCOPE ?? "").trim();
  if (scope && scope.split(/\s+/).some(isPlaceholderValue)) problems.push("PF_SCOPE is still a placeholder from .env.example: edit .env");
  const index = String(env?.PROBE_INDEX ?? "").trim();
  if (index && (/\s/.test(index) || index.length > 100)) problems.push("PROBE_INDEX must be one word of at most 100 characters");
  return { ok: missing.length === 0 && problems.length === 0, missing, problems };
}

// The MCP reply body is JSON, or a server-sent-event stream whose `data:` lines hold the JSON-RPC message. Of several frames the last one
// that carries a result or an error wins (notifications come first); otherwise the last parsable frame.
export function parseMcpBody(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { /* maybe an event stream */ }
  const frames = [];
  for (const block of t.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, ""));
    if (!data.length) continue;
    try { frames.push(JSON.parse(data.join("\n"))); } catch { /* not JSON */ }
  }
  const reply = frames.filter((f) => f && typeof f === "object" && ("result" in f || "error" in f));
  return reply.length ? reply[reply.length - 1] : frames.length ? frames[frames.length - 1] : null;
}

// Map one reply to a verdict. `status` is the HTTP status, `body` the parsed JSON-RPC message (or null).
//   refused-by-policy  the JSON-RPC error message contains "denied by policy" (any code, any status): an AI policy refused it (reason kept)
//   token-rejected     HTTP 401: the door did not accept the token
//   refused-at-grant   HTTP 403: refused by a policy at the grant layer (before any AI policy)
//   allowed            the door served the call; a result with isError is still "allowed" (toolError: true), the tool failed, no policy refused it
//   unreadable         anything else, including a bare JSON-RPC -32600 (Invalid Request: a protocol or session fault, not a policy decision)
export function classifyVerdict({ status, body }) {
  const err = body && typeof body === "object" ? body.error : undefined;
  const message = err && typeof err.message === "string" ? err.message : "";
  if (/denied by policy/i.test(message)) return { verdict: "refused-by-policy", reason: message };
  if (status === 401) return { verdict: "token-rejected", reason: "HTTP 401: the door did not accept the token" };
  if (status === 403) return { verdict: "refused-at-grant", reason: "HTTP 403: refused by a policy at the grant layer (before any AI policy)" };
  if (err) return { verdict: "unreadable", reason: `JSON-RPC error ${err.code ?? "?"}: ${message}`.trim() };
  if (status >= 200 && status < 300 && body && typeof body === "object" && body.result !== undefined) {
    if (body.result && body.result.isError === true) return { verdict: "allowed", reason: "tool returned an error, not a policy refusal", toolError: true };
    return { verdict: "allowed", reason: "served" };
  }
  return { verdict: "unreadable", reason: `HTTP ${status}, no JSON-RPC result` };
}

// True when a verdict means the run proved nothing about the policy (exit code 3).
export const isInconclusive = ({ verdict }) => verdict === "unreadable" || verdict === "token-rejected";

// True when EVERY call was refused with HTTP 403 at the grant layer: no AI policy was evaluated, so the run says nothing about the policy
// (exit code 3 as well). One 403 among other verdicts is a real answer for that call and does not make the run inconclusive.
export const isAllGrantRefused = (verdicts) => verdicts.length > 0 && verdicts.every(({ verdict }) => verdict === "refused-at-grant");

// The tool names in a tools/list reply, or null when it is not one.
export function toolNames(body) {
  const tools = body && body.result && body.result.tools;
  return Array.isArray(tools) ? tools.map((t) => t && t.name).filter((n) => typeof n === "string") : null;
}

// What the token's act claim looks like, never its value beyond act.sub: { actType: 'object'|'text'|'absent', actSub: string|null }.
export function describeAct(claims) {
  const act = claims && claims.act;
  if (act === undefined || act === null) return { actType: "absent", actSub: null };
  if (typeof act === "object" && !Array.isArray(act)) return { actType: "object", actSub: typeof act.sub === "string" ? act.sub : null };
  return { actType: "text", actSub: null };
}

// Anything printed passes through here: every secret value (as is, url-encoded and base64 / base64url encoded, matched case-insensitively),
// bearer/basic values, token-shaped key=value pairs and JWT-shaped strings are replaced, control and bidi characters become spaces (a door
// cannot inject lines or escape codes), and the text is capped.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function redact(text, secrets = []) {
  const forms = new Set();
  for (const s of secrets) {
    if (!s || String(s).length < 4) continue;
    const v = String(s);
    const b64 = Buffer.from(v).toString("base64");
    for (const f of [v, encodeURIComponent(v), b64, b64.replace(/=+$/, ""), Buffer.from(v).toString("base64url")]) forms.add(f);
  }
  // Longest first, so a form that contains another is replaced whole.
  const pattern = forms.size ? new RegExp([...forms].sort((a, b) => b.length - a.length).map(escapeRegex).join("|"), "gi") : null;
  const scrub = (t) => (pattern ? t.replace(pattern, "<redacted>") : t);
  let out = scrub(String(text ?? ""));
  out = scrub(out.replace(CONTROL, " "));
  out = out.replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, "$1 <redacted>");
  out = out.replace(/\b(access_token|refresh_token|id_token|client_secret|authorization)(["']?\s*[:=]\s*["']?)(?!<redacted>|Bearer|Basic)[^\s"',&;]+/gi, "$1$2<redacted>");
  out = out.replace(/eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, "<token>");
  return out.length > 240 ? `${out.slice(0, 240)}...` : out;
}

// The one line that shows the access token. This lab is for learning, so the token is shown on purpose (owner, 2026-11-16): you read it in your
// own terminal and can paste it into a decoder. Only a token-shaped value is printed (JWT or opaque base64url-ish, a bounded length), so a reply
// cannot smuggle control characters or escape codes onto the terminal. The client secret and the Basic value are never printed.
const TOKEN_SHAPE = /^[A-Za-z0-9._~+\/-]+=*$/;
export function tokenLine(token) {
  const t = String(token ?? "");
  if (t.length < 8 || t.length > 8192 || !TOKEN_SHAPE.test(t)) return null;
  return `token          REAL access token, shown on purpose (learning lab): ${t}`;
}

// The line the probe prints for one result. The reason is redacted here, so no call site can print it raw.
export function formatVerdict(label, { verdict, reason, toolError }, secrets = []) {
  let detail = "";
  if (verdict === "allowed") detail = toolError ? ` (${redact(reason, secrets)})` : "";
  else if (reason) detail = `: ${redact(reason, secrets)}`;
  return `${label.padEnd(14)} ${verdict}${detail}`;
}
