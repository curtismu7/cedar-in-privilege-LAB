// The scripted agent behind "Ask the agent". It is NOT a model: a small keyword planner turns the viewer's words into tool calls, so every
// run is reproducible and nothing leaves the machine. What it shows is the part that matters here: the agent's call reaches the door,
// and the door's policies (not the prompt) decide. Nothing in a prompt can change a policy, a token or a verdict.
//
// Words it reads: count / how many / total -> CountTool; list / show all -> ListIndexTool; search / find / look up -> SearchIndexTool.
// The prompt only picks tools. The ACTION of a call (attended mcp:Invoke or unattended mcp:InvokeUnattended) belongs to the door setup (the
// scenario), like its policies and its token: a policy applies to one action, and how the real gateway tells an unattended call apart was
// not measured, so a typed word never decides it.
import { ACTION_INVOKE, ACTION_UNATTENDED, AGENT_A, APPROVER, ISSUER, DOOR_URL } from "./cedar.js";
import { mockTrace } from "./gatewayTrace.js";

export const MAX_PROMPT = 280;
export const MAX_CALLS = 3;

const TOOL_WORDS = [
  ["CountTool", /\b(count|how many|total|number of)\b/i],
  ["ListIndexTool", /\b(list|show all|show me all|everything)\b/i],
  ["SearchIndexTool", /\b(search|find|look ?up|look for|query)\b/i]
];

export const CAN_DO =
  "I am a scripted agent (no model). I can count (CountTool), list (ListIndexTool) and search (SearchIndexTool) the index. " +
  "Try: \"Search the index for open cases.\"";

// A prompt is text, 1 to 280 characters after trimming. Anything else is refused before it is read.
export function checkPrompt(prompt) {
  if (typeof prompt !== "string") return { ok: false, message: "prompt must be text" };
  const text = prompt.trim();
  if (!text) return { ok: false, message: "type a prompt first" };
  if (text.length > MAX_PROMPT) return { ok: false, message: `the prompt is over ${MAX_PROMPT} characters` };
  return { ok: true, text };
}

// The tools the words name, in the order the words appear, once each, at most MAX_CALLS. `action` is the door setup's: every call carries it.
export function planPrompt(text, action = ACTION_INVOKE) {
  const found = TOOL_WORDS
    .map(([tool, re]) => ({ tool, at: text.search(re) }))
    .filter((t) => t.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_CALLS);
  return { unattended: action === ACTION_UNATTENDED, action, calls: found.map((f) => ({ tool: f.tool, action })) };
}

const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The calls of a run: the planned calls, and, once a person approved, the approval step and a retry of each call that was held.
// `heldTools` comes from a first pass without the approval (the door is deterministic, so the first pass is exact).
export function callsFor(plan, { approved, heldTools = [], stepUp = false } = {}) {
  const calls = [...plan.calls];
  if (approved && heldTools.length) {
    calls.push(stepUp ? { approve: true, stepUp: true } : { approve: true });
    for (const t of heldTools) calls.push({ tool: t, action: plan.action });
  }
  return calls;
}

// The mock PingFederate token request and reply, as one exchange for the API calls panel. The reply carries the mock token whole,
// labelled mock (rule 4). A real client authenticates with its client credentials; the mock shows no secret, so it shows none.
export function tokenExchange({ token, scope, traceparent }) {
  const claims = token.claims || {};
  return mockTrace({
    url: `${ISSUER}/as/token.oauth2`,
    authorization: null,
    requestHeaders: { authorization: null, "content-type": "application/x-www-form-urlencoded", accept: "application/json", traceparent },
    rpc: { grant_type: "client_credentials", client_id: AGENT_A, scope: scope || "", audience: DOOR_URL },
    status: 200,
    body: { access_token: token.token, token_type: "Bearer", expires_in: Math.max(0, (claims.exp || 0) - (claims.iat || 0)), scope: scope || undefined, mock: true },
    decisions: [{ id: "issue", label: "Mock token issued", outcome: "pass", evidence: "this lab's in-process PingFederate stand-in signed a fixture JWT; it signs nothing real. A real request is form-encoded and carries client authentication; the body is shown as JSON and no client secret is simulated" }],
    record: "mock-issued token"
  });
}

// The conversation, in the agent's words. Deterministic, so a test can pin it. `run` is runScenario's result for the calls above.
export function transcriptFor({ prompt, plan, run, approved }) {
  const turns = [{ role: "user", text: prompt }];
  if (plan.calls.length === 0) {
    turns.push({ role: "agent", kind: "reply", text: CAN_DO });
    return turns;
  }
  const names = plan.calls.map((c) => c.tool);
  turns.push({
    role: "agent", kind: "plan",
    text: `I will ask for a token, then call ${list(names)}${plan.unattended ? ", unattended (no person watching; this door setup runs the agent that way)" : ""} on the door.`
  });
  for (const c of run.calls) {
    if (c.kind === "approval") {
      turns.push({ role: "event", kind: "approval", ok: c.ok, text: c.reason });
      if (c.ok) turns.push({ role: "agent", kind: "plan", text: "The approval is on record. I will retry the held call." });
      continue;
    }
    turns.push({ role: "tool", kind: "call", index: c.index, tool: c.tool, action: c.action, verdict: c.verdict, http: c.http, text: c.reason });
  }
  const finals = new Map();
  for (const c of run.calls) if (c.kind !== "approval") finals.set(c.tool, c);
  const done = [...finals.values()];
  const ok = done.filter((c) => c.verdict === "allowed").map((c) => c.tool);
  const held = done.filter((c) => c.verdict === "held");
  const no = done.filter((c) => c.verdict === "refused");
  const parts = [];
  if (ok.length) parts.push(`${list(ok)} answered (mock reply).`);
  for (const c of no) parts.push(`The door refused ${c.tool}: ${c.reason.replace(/^JSON-RPC -32600 /, "")}. A refusal is final for this token and this door setup: my words do not change a policy or a token.`);
  for (const c of held) {
    parts.push(approved
      ? `${c.tool} is still on hold: the approval did not record, so the policy still applies.`
      : `${c.tool} is on hold for a human (approver ${APPROVER}). I will wait; once a person approves, I can retry.`);
  }
  if (!parts.length) parts.push("Nothing to report.");
  turns.push({ role: "agent", kind: "reply", text: parts.join(" ") });
  return turns;
}
