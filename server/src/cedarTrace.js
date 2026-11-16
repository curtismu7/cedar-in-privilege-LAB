// "What Privilege did" for one simulated tools/call (Rule 25). This lab's door is an in-process evaluator, so the trace is always
// source 'mock' and every decision is 'checked': callTool() in cedar.js computed each one. A check never reached is 'skipped'.
// A held call is an `info` decision (it waits for a human), never a pass.
// The token is a MOCK token (HS256 fixture key, signs nothing real), so it is shown raw (rule 4); no-token calls send no Authorization header.
// Every simulated call and hop carries a W3C traceparent of one trace (rule 14).
import { mockTrace } from "./gatewayTrace.js";
import { newTrace, formatTraceparent } from "./trace.js";
import { DOOR_URL } from "./cedar.js";

// The trace of one API request: a valid incoming traceparent continues its trace, anything else starts one. `root` is the span of the
// response to that request; `child()` is a new span id for each simulated call and hop.
export function startTrace(incoming) {
  const t = newTrace(incoming);
  return { traceId: t.traceId, root: formatTraceparent(t.traceId, t.span()), child: () => formatTraceparent(t.traceId, t.span()) };
}

const NOT_REACHED = "not reached: an earlier check refused the call";

export function doorTrace({ token, tool, action = "mcp:Invoke", result, traceparent }) {
  const hop = (stage) => result.hops.find((h) => h.stage === stage);
  const decide = (stage, id, label) => {
    const h = hop(stage);
    if (!h) return { id, label, outcome: "skipped", evidence: NOT_REACHED };
    // A hold is neither a pass nor a fail: the call waits for a human (an `info` decision is never counted as passed).
    return { id, label, outcome: h.ok === null ? "info" : h.ok ? "pass" : "fail", evidence: h.reason };
  };
  const decisions = [
    decide("signin", "signin", "Workload token (sign-in)"),
    decide("cedar", "cedar", `AI policy (Cedar), action ${action}`)
  ];
  let body = null;
  if (result.ok) body = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: `${tool}: served (mock reply)` }] } };
  else if (result.http === 400) body = { jsonrpc: "2.0", id: 1, error: { code: -32600, message: result.rpcMessage } };
  // The body of a hold is this lab's own shape: what a real gateway sends for a hold was not captured here (UNVERIFIED).
  else if (result.verdict === "held") body = { simulated: true, held: true, approval_id: result.approvalId, approver: result.approver, message: result.holdMessage };
  return mockTrace({
    url: DOOR_URL,
    authorization: token ? `Bearer ${token}` : "",
    requestHeaders: token ? { traceparent } : { authorization: null, traceparent },
    rpc: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: {} } },
    status: result.http,
    body,
    decisions,
    record: result.hops.at(-1).reason
  });
}
