// The mock Privilege door. It evaluates THREE rule shapes, each a `forbid ... unless` (or `when`) policy as the Privilege AI Policy editor
// writes them. It is NOT a Cedar engine and it decides nothing real: any other policy text is out of scope here.
//
// The shapes, and where each one comes from (labels used on the page):
//   hold    action mcp:InvokeUnattended, unless context.approval_count >= 1.   Shape copied from the HITL policy copy in the full demo app's
//           notes (console text, read from a console on 2026-10-22); not re-run here. Simulated.
//   scope   action mcp:Invoke, unless context has token && context.token.scopes.contains("<scope>"). The live scope policy copy and the console
//           template "Restrict a tool to tokens carrying a scope", as recorded in the full demo app's notes (console text); not re-run here.
//           Simulated.
//   actsub  action mcp:Invoke, unless the token's claims have act.sub and it contains("<agent>"). The only shape with a MEASURED real result
//           (2026-11-16, one real agent, see EVIDENCE in scenarios.js); the lines around the contains(...) test are UNVERIFIED.
// Door scoping (`context.app == "<door>"`) is only shown in the text: the mock has no door argument and does not evaluate it.

export const DOOR = "door-example";
export const DOOR_URL = "https://door.example/mcp";
export const ISSUER = "https://pf.example";
export const AGENT_A = "agent-client-example";
export const AGENT_B = "agent-b-example";
export const APPROVER = "approver-example";
export const SCOPE_SEARCH = "index:search-example";
export const SCOPE_LIST = "index:list-example";

export const ACTION_INVOKE = "mcp:Invoke";
export const ACTION_UNATTENDED = "mcp:InvokeUnattended";

// A tool, agent, scope or approver id goes into Cedar text, so it must be plain: no quotes, no newlines, nothing that ends the string early.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export const SHAPES = {
  hold: { action: ACTION_UNATTENDED, valueName: "approver" },
  scope: { action: ACTION_INVOKE, valueName: "scope" },
  actsub: { action: ACTION_INVOKE, valueName: "agent" }
};

// One policy. `value` is the approver id (hold), the scope (scope) or the agent id (actsub).
export function makePolicy({ id, shape, tool, value, state = "Active" }) {
  if (!Object.hasOwn(SHAPES, shape)) throw new Error("shape must be hold, scope or actsub");
  if (![id, tool, value].every((v) => typeof v === "string" && SAFE_ID.test(v))) throw new Error("id, tool and value must be plain ids");
  if (state !== "Active" && state !== "Candidate") throw new Error("state must be Active or Candidate");
  const reason = shape === "hold" ? `${tool} needs a human approval`
    : shape === "scope" ? `${tool} requires the ${value} scope`
      : `${tool} requires act.sub to be ${value}`;
  return { id, shape, tool, state, action: SHAPES[shape].action, value, reason };
}

// The exact Cedar text of one policy, as this lab generates it from its shape.
export function cedarText(p) {
  const head = `forbid (principal, action == Action::"${p.action}", resource == Tool::"${p.tool}")`;
  const when = `when   { context.app == "${DOOR}" }`;
  if (p.shape === "hold") {
    return [`@approvers("${p.value}")`, `@reason("${p.reason}")`, head, when, "unless { context has approval_count && context.approval_count >= 1 };"].join("\n");
  }
  if (p.shape === "scope") {
    return [`@reason("${p.reason}")`, head, when, `unless { context has token && context.token.scopes.contains("${p.value}") };`].join("\n");
  }
  return [
    `@reason("${p.reason}")`,
    head,
    when,
    `unless { context.token.claims has "act.sub"`,
    `         && context.token.claims["act.sub"].contains("${p.value}") };`
  ].join("\n");
}

// The act.sub the policy reads. In the measured token act was an object {"sub": "<agent>"}; the mock reads the nested value act -> sub.
// act that is not an object with its OWN `sub` (the TEXT "{}", an empty object, a list, null, an inherited sub) gives no act.sub here,
// so `has` is false and the forbid applies. That is this mock's rule; whether the real door agrees for act as text was not measured.
export function claimActSub(claims) {
  const act = claims && claims.act;
  if (act && typeof act === "object" && !Array.isArray(act) && Object.prototype.hasOwnProperty.call(act, "sub")) return act.sub;
  return undefined;
}

// The scopes the policy reads. The mock takes the token's OAuth `scope` claim (a space-separated string, or a list) as the scope set.
// How the real gateway fills context.token.scopes from a token is UNVERIFIED here, and for a PingFederate token the full demo app's notes
// say it was not tested.
export function claimScopes(claims) {
  const s = claims && claims.scope;
  if (typeof s === "string") return s.split(/\s+/).filter(Boolean);
  if (Array.isArray(s)) return s.filter((x) => typeof x === "string");
  return [];
}

// MATCHING SEMANTICS of `<claim>.contains("<value>")` in this mock: EXACT, case-sensitive equality of the whole claim value with the
// policy's value (a string claim), or exact element equality (a list claim, i.e. set membership). No substring, prefix, suffix, case
// folding, trimming, Unicode normalisation or pattern matching; a non-string value, a nested list or null never matches.
// Whether the real door compares exactly, by substring or by set membership was NOT measured (UNVERIFIED): the measured run only saw a
// policy naming the token's own agent let the call through and a policy naming a different value refuse it.
function contains(value, wanted) {
  if (typeof value === "string") return value === wanted;
  if (Array.isArray(value)) return value.includes(wanted);
  return false;
}

// Does the forbid of this policy apply to this call (the `unless` clause is false)? Only Active policies are enforced; a Candidate is not
// (per the Privilege console documentation; not re-run here, UNVERIFIED). A policy applies only to the action it names.
// Fails closed: no claims at all means the `unless` is false and the forbid applies.
export function policyForbids(p, { tool, action, claims, approvals = 0 }) {
  if (p.state !== "Active" || p.tool !== tool || p.action !== action) return false;
  if (p.shape === "hold") return !(Number.isInteger(approvals) && approvals >= 1);
  if (p.shape === "scope") return !claimScopes(claims).includes(p.value);
  const actSub = claimActSub(claims);
  return !(actSub !== undefined && contains(actSub, p.value));
}

// What the policies decide for one call. A call carries ONE action, so only the policies naming that action can apply: an mcp:Invoke
// forbid refuses, an mcp:InvokeUnattended forbid holds, and with no forbid the call is allowed. The mock has no permit rule, so nothing
// here can grant access. (How the real engine orders a refusal and a hold on one call was not tested here, UNVERIFIED.)
export function decide(policies, call) {
  const hit = policies.find((p) => policyForbids(p, call));
  if (!hit) return { verdict: "allowed", policy: null };
  return { verdict: hit.action === ACTION_INVOKE ? "refused" : "held", policy: hit };
}

export const approvalIdFor = (n) => `approval-example-${n}`;

// One tools/call through the mock door. Returns the HTTP status, the verdict, the JSON-RPC refusal or the hold, and the hops (for the trace).
// `action` is the Cedar action the call carries; how the real gateway tells an unattended call from an attended one was not measured
// (UNVERIFIED), the mock simply takes it from the scenario. `approvals` is the human approvals on record for the call.
// `now` (ms) is a parameter so the expiry boundary can be tested deterministically.
export function callTool({ token, tool, action = ACTION_INVOKE, approvals = 0, policies, verifyFn, now = () => Date.now() }) {
  const hops = [];
  if (!token) {
    hops.push({ stage: "signin", ok: false, reason: "gateway refused the call at sign-in: 401 Bearer token required (simulated wording, mirrored from the sibling lab, not measured)" });
    return { ok: false, verdict: "refused", http: 401, hops, reason: hops[0].reason };
  }
  const v = verifyFn(token);
  const p = v.ok ? v.payload : null;
  let problem = null;
  if (!v.ok) problem = v.reason;
  else if (p.iss !== ISSUER) problem = `issuer ${p.iss || "(none)"} does not match ${ISSUER}`;
  else if (p.aud !== DOOR_URL) problem = `audience ${p.aud || "(none)"} does not match ${DOOR_URL}`;
  else if (typeof p.exp !== "number" || p.exp <= Math.floor(now() / 1000)) problem = "token expired";
  if (problem) {
    hops.push({ stage: "signin", ok: false, reason: `workload token rejected: ${problem}` });
    return { ok: false, verdict: "refused", http: 401, hops, reason: hops[0].reason };
  }
  hops.push({ stage: "signin", ok: true, reason: "simulated sign-in: issuer, signature, audience and lifetime matched (the real door's checks were not measured)", payload: p });

  const onTool = policies.filter((x) => x.tool === tool);
  const { verdict, policy } = decide(policies, { tool, action, claims: p, approvals });
  if (verdict === "refused") {
    const reason = `action denied by policy: ${policy.reason}`;
    hops.push({ stage: "cedar", ok: false, reason, policy: policy.id });
    return { ok: false, verdict, http: 400, hops, reason: `JSON-RPC -32600 ${reason}`, rpcMessage: reason, policy: policy.id };
  }
  if (verdict === "held") {
    const approvalId = approvalIdFor(1);
    const reason = `held for a human: ${policy.reason} (approval id ${approvalId}, approver ${policy.value})`;
    hops.push({ stage: "cedar", ok: null, reason, policy: policy.id });
    return { ok: false, verdict, http: 202, hops, reason: `HTTP 202 ${reason} (simulated reply: the status and body of a real hold were not captured here, UNVERIFIED)`, holdMessage: reason, approvalId, approver: policy.value, policy: policy.id };
  }
  const named = onTool.filter((x) => x.action === action);
  const active = named.filter((x) => x.state === "Active");
  const candidates = named.filter((x) => x.state === "Candidate");
  let why;
  if (active.length) why = `Active policy ${active.map((x) => x.id).join(", ")} did not forbid ${tool}: ${active.map((x) => satisfied(x, p, approvals)).join("; ")}`;
  else if (candidates.length) why = `policy ${candidates.map((x) => x.id).join(", ")} is a Candidate: not enforced, so it cannot forbid ${tool} (per the console documentation, not re-run here)`;
  else why = `no policy targets ${tool} for ${action}`;
  hops.push({ stage: "cedar", ok: true, reason: why });
  hops.push({ stage: "done", ok: true, reason: `200: ${tool} served` });
  return { ok: true, verdict, http: 200, hops, reason: `200: ${tool} served` };
}

// Why an Active policy did not forbid: the `unless` clause was met.
function satisfied(p, claims, approvals) {
  if (p.shape === "hold") return `${approvals} approval${approvals === 1 ? "" : "s"} on record, approval_count >= 1`;
  if (p.shape === "scope") return `the token's scopes include ${p.value}`;
  return "the token's act.sub matched";
}
