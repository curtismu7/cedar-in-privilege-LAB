// The tour as data: three cases (hold for a human, token-scope gate, agent act.sub gate), each a few scenarios, plus the measured evidence
// (static, never produced by a mock run). Every id here is an example id. Scenarios are stateless: each carries the policies the mock door
// holds while it runs, and the list of calls (and human approvals) it makes.
//
// basis: every scenario RUN is "simulated": this lab simulates the shape and nothing here proves the real door does the same (the label
// "console text" or "UNVERIFIED" says where the shape came from). matchesMeasured: true marks the two act.sub scenarios whose OUTCOME
// matches what a real run showed on a real tenant (2026-11-16, act.sub only); the run itself is still a simulation.
import {
  makePolicy, AGENT_A, AGENT_B, APPROVER, SCOPE_SEARCH, SCOPE_LIST, ACTION_INVOKE, ACTION_UNATTENDED
} from "./cedar.js";

export const POLICY_HOLD = { id: "cedar-hold-search", shape: "hold", tool: "SearchIndexTool", value: APPROVER };
export const POLICY_SCOPE = { id: "cedar-scope-search", shape: "scope", tool: "SearchIndexTool", value: SCOPE_SEARCH };
export const POLICY_A = { id: "cedar-count-act-sub", shape: "actsub", tool: "CountTool", value: AGENT_A };
export const POLICY_B = { id: "cedar-list-act-sub", shape: "actsub", tool: "ListIndexTool", value: AGENT_B };

export const policiesFor = (specs, state = "Active") => specs.map((s) => makePolicy({ ...s, state }));

const unattended = (tool) => ({ tool, action: ACTION_UNATTENDED });
const attended = (tool) => ({ tool, action: ACTION_INVOKE });
const APPROVE = { approve: true };
// An approval gated on the approver's own step-up (mock PingID). The UI collects the factor choice (or the push tap) before the run
// reaches the approval step; the scenario data only marks that this run's approval is step-up gated.
const APPROVE_WITH_STEPUP = { approve: true, stepUp: true };

// Per case: what the shape is, where it came from, and where its real counterpart runs. Plain text; no links.
export const CASES = [
  {
    id: "hold", n: 1, title: "Hold for a human", action: ACTION_UNATTENDED, basis: "simulated",
    summary: "A forbid on mcp:InvokeUnattended with an unless approval_count >= 1 holds the call until a person approves it. The agent retries and the call goes through.",
    source: "console text: the shape is the live HITL policy copy recorded in the full demo app's notes (read from a console on 2026-10-22, not re-run here). SIMULATED in this lab.",
    real: "Its real counterpart runs on the Privilege AI Policies page of the full demo app (a real door, real tool calls, a real approval in the Privilege console). Not run here."
  },
  {
    id: "scope", n: 2, title: "Token-scope gate", action: ACTION_INVOKE, basis: "simulated",
    summary: "A forbid unless context.token.scopes.contains(\"<scope>\") refuses a token without the scope and lets one with it through.",
    source: "console text: the shape is the live scope policy copy and the console template \"Restrict a tool to tokens carrying a scope\", recorded in the full demo app's notes (not re-run here). For a PingFederate token, whether its scope reaches context.token.scopes was not tested there (UNVERIFIED). SIMULATED in this lab.",
    real: "Its real counterpart runs on the PingFederate Token Demo page of the full demo app (a token sent with and without the scope). Not run here."
  },
  {
    id: "actsub", n: 3, title: "Agent act.sub gate", action: ACTION_INVOKE, basis: "measured once",
    summary: "The measured case. Two tools, one act.sub policy each: the tool whose policy names this agent is allowed, the tool whose policy names a different value is refused.",
    source: "measured: one real agent on a real tenant, 2026-11-16 (the Measured card below). The Cedar lines around the contains(...) test are UNVERIFIED. The extra Candidate scenario is simulated.",
    real: "Its real counterpart is the owner-run probe in cedar-act-sub-LAB (npm run real there), which reproduced the measured table. Not run here."
  },
  {
    id: "stepup", n: 4, title: "Approver PingID step-up", action: ACTION_UNATTENDED, basis: "simulated (approval leg measured separately)",
    summary: "The hold's human approval itself requires PingID: the approver must complete a step-up (mock mobile push or OTP) before the approval records and the retry goes through. A rogue agent cannot approve as the human.",
    source: "the step-up leg is measured: 2026-11-18, a real PingID mobile device enrolled per persona and a full sign-in chain run (password, push, approve, code issued). The composition with a real Privilege hold is simulated: the approval in the real HITL flow is console-side and its own sign-in policy was not tested.",
    real: "Its real counterparts: the Privilege AI Policies hold page of the full demo app (the hold), and the PingID enrolment + step-up run of 2026-11-18 (the step-up). Not composed and run here."
  }
];

export const SCENARIOS = [
  {
    id: "hold-1-held", case: "hold", n: 1, label: "Hold: no approval yet", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool")], expect: ["held"], basis: "simulated",
    title: "1.1 Hold: no approval yet",
    what: "An Active hold policy sits on SearchIndexTool. The agent runs the tool with nobody watching (action mcp:InvokeUnattended; how the real gateway tells an unattended call apart was not measured, UNVERIFIED). There is no approval on record, so the unless clause is false and the call is held for a human, with an approval id.",
    say: "A policy forbids the unattended action unless an approval is on record. No approval yet, so the call is held, not refused: it waits for a person."
  },
  {
    id: "hold-2-approve", case: "hold", n: 2, label: "Hold, approve, retry", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool"), APPROVE, unattended("SearchIndexTool")], expect: ["held", "approved", "allowed"], basis: "simulated",
    title: "1.2 Hold, approve, retry",
    what: "The same call is held. A person approves it (simulated here: the lab records one approval, with the approver id example). The agent retries, approval_count is now 1, the unless clause is true and the call goes through.",
    say: "The held call waits. A person approves it, the agent retries, and now the unless clause is satisfied, so the call is served. The approval is the only thing that changed."
  },
  {
    id: "scope-1-without", case: "scope", n: 1, label: "Token without the scope", token: "agent", scope: SCOPE_LIST, policies: [POLICY_SCOPE],
    calls: [attended("SearchIndexTool")], expect: ["refused"], basis: "simulated",
    title: "2.1 Token without the scope",
    what: `An Active scope policy sits on SearchIndexTool and wants the ${SCOPE_SEARCH} scope. The token carries only ${SCOPE_LIST}, so the unless clause is false and the call is refused with JSON-RPC -32600 (the mock answers HTTP 400).`,
    say: "The policy asks for a scope the token does not carry, so the call is refused and the reason names the scope."
  },
  {
    id: "scope-2-with", case: "scope", n: 2, label: "Token with the scope", token: "agent", scope: `${SCOPE_LIST} ${SCOPE_SEARCH}`, policies: [POLICY_SCOPE],
    calls: [attended("SearchIndexTool")], expect: ["allowed"], basis: "simulated",
    title: "2.2 Token with the scope",
    what: `The same policy and the same tool, with a token that carries ${SCOPE_SEARCH} as well. The unless clause is true, so the call is served.`,
    say: "Same policy, same tool, a token that carries the scope: the call is served."
  },
  {
    id: "actsub-1-baseline", case: "actsub", n: 1, label: "No policy: baseline", token: "agent", scope: SCOPE_LIST, policies: [],
    calls: [attended("CountTool"), attended("ListIndexTool")], expect: ["allowed", "allowed"], basis: "simulated", matchesMeasured: true,
    title: "3.1 No policy: baseline",
    what: "The door holds no AI policy. The agent's token carries act = {\"sub\": \"agent-client-example\"}. Both tools answer.",
    say: "No policy yet. The same token calls CountTool and ListIndexTool and both are allowed. That is the baseline."
  },
  {
    id: "actsub-2-gate", case: "actsub", n: 2, label: "Two policies, same token", token: "agent", scope: SCOPE_LIST, policies: [POLICY_A, POLICY_B],
    calls: [attended("CountTool"), attended("ListIndexTool")], expect: ["allowed", "refused"], basis: "simulated", matchesMeasured: true,
    title: "3.2 Two Active act.sub policies, same token",
    what: "Policy A on CountTool requires act.sub = agent-client-example (the token's own agent). Policy B on ListIndexTool requires act.sub = agent-b-example (a different agent). One token, two calls: CountTool is allowed, ListIndexTool is refused with JSON-RPC -32600.",
    say: "Same token, same door, two tools. Where the policy names this agent the call goes through; where it names a different value the call is refused and the reason names the claim."
  },
  {
    id: "actsub-3-candidate", case: "actsub", n: 3, label: "Candidate state", token: "agent", scope: SCOPE_LIST, policies: [POLICY_A, POLICY_B], policyState: "Candidate",
    calls: [attended("CountTool"), attended("ListIndexTool")], expect: ["allowed", "allowed"], basis: "simulated",
    title: "3.3 Candidate state",
    what: "Both policies exist but are Candidate. Per the Privilege console documentation (not re-run here, UNVERIFIED) a Candidate is not enforced, so the mock allows ListIndexTool even though its policy names a different value. Only Active is enforced here.",
    say: "Per the console documentation (not re-run here), a policy that is still a Candidate is not enforced. If a refusal you expected does not happen, check the state first."
  },
  {
    id: "stepup-1-approve", case: "stepup", n: 1, label: "Hold, step-up, approve, retry", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool"), APPROVE_WITH_STEPUP, unattended("SearchIndexTool")], expect: ["held", "approved", "allowed"], basis: "simulated",
    stepUp: true,
    title: "4.1 Hold, PingID step-up, approve, retry",
    what: "The call is held for a human (case 1's policy). The human opens the approval — and the approval requires their own step-up first: a mock PingID challenge (mobile push or the demo OTP 123123). Only a completed step-up records the approval; the agent retries and approval_count satisfies the unless clause. In the real tenant the approver's sign-in carried this exact gate (Multi_Factor policy, PingID_AUTHENTICATION action, measured 2026-11-18); the composition is simulated.",
    say: "The held call waits. The human's approval is itself protected: they complete a PingID step-up (push or code) before the approval records. A stolen agent session cannot approve — the step-up belongs to the person's device, not the agent."
  },
  {
    id: "stepup-2-refused", case: "stepup", n: 2, label: "Step-up failed: approval never records", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool"), APPROVE_WITH_STEPUP, unattended("SearchIndexTool")], expect: ["held", "rejected", "held"], basis: "simulated",
    stepUp: true, stepUpFails: true,
    title: "4.2 Step-up failed: the hold stands",
    what: "The same hold, but the approver's step-up does not complete (the wrong OTP, or the push is denied). The approval never records, so approval_count stays 0 and the retry is held again — the agent cannot collect an approval without the human's own step-up. The run ends with the call still held, and the approval id is single-use so nothing carries over.",
    say: "No step-up, no approval: the hold stands and the retry is held again. The gate cannot be satisfied by the agent waiting, retrying or replaying — only the person's own factor completes it."
  }
];

export const CASE_IDS = CASES.map((c) => c.id);

export const MOCK_NOTE =
  "The mock door is an in-process evaluator of three rule shapes (hold for a human, token scope, agent act.sub), each compared exactly. It is not a Cedar engine and it decides nothing real. Only the act.sub case has a result measured on a real tenant; the hold and scope cases are simulated. The approver's PingID step-up (case 4) is a mock gate on the approval step: the step-up factor itself is measured (2026-11-18 enrolment + sign-in chain), the composition with a real Privilege hold is not.";

// Static evidence for the act.sub case. It is NOT produced by a mock run and is shown apart from them, labelled with its date.
export const EVIDENCE = {
  label: "Measured on a real tenant 2026-11-16",
  setup: "A real Privilege tenant, a real PingFederate token (act as an OBJECT {\"sub\": \"<agent>\"}), two ACTIVE policies on one door. The ids on this page are examples. The same three rows were then reproduced by cedar-act-sub-LAB's own probe (npm run real in that lab) in one run per state, on the same day. Only the act.sub case (case 3) has a measured result; the hold and scope cases are simulated.",
  cedar: [
    "@reason(\"<Tool> requires act.sub to be <agent>\")",
    "forbid (principal, action == Action::\"mcp:Invoke\", resource == Tool::\"<Tool>\")",
    "when   { context.app == \"<door>\" }",
    "unless { context.token.claims has \"act.sub\"",
    "         && context.token.claims[\"act.sub\"].contains(\"<agent>\") };"
  ].join("\n"),
  cedarNote: "The AI Policy template \"Restrict a tool to tokens carrying a claim\" generates the contains(...) test inside forbid ... unless; that part was read from the tenant. The lines around it (@reason, the action and resource, the when context.app clause, the has guard) are this lab's reconstruction, UNVERIFIED against the tenant. The ids are examples.",
  rows: [
    { phase: "Baseline (no policy)", CountTool: "allowed", ListIndexTool: "allowed" },
    { phase: "Policy A on CountTool (act.sub = the token's own agent) and policy B on ListIndexTool (act.sub = a different agent), both Active", CountTool: "allowed", ListIndexTool: "refused: action denied by policy: ListIndexTool requires act.sub to be agent-b-example (JSON-RPC -32600)" },
    { phase: "Both policies deleted", CountTool: "allowed", ListIndexTool: "allowed" }
  ],
  rowsNote: "The ids in this table are examples substituted for the real ones: the real message carried a different value for the other agent.",
  timing: "In one run on 2026-11-16 the first poll, about 7 seconds after the policies were created, already showed the refusal. That is one observation, not a measured or guaranteed propagation time.",
  wire: "On the wire the refusal is a JSON-RPC error with code -32600. The mock in this lab answers HTTP 400 for it; the HTTP status of a real policy refusal was not tested.",
  notMeasured: [
    "A second real agent whose token carries a different act.sub: the one real client always had a single act.sub, so the refusal came from a policy naming a different value, not from a second agent calling.",
    "act emitted as the TEXT \"{}\": the rule is believed to need an object (UNVERIFIED).",
    "The no-token wording on the real door.",
    "A Candidate policy not being enforced: console documentation, not re-run.",
    "Whether the real door matches act.sub exactly, by substring or by set membership: only a policy naming a different value was refused, so 'agent-client' against 'agent-client-example' was never tried.",
    "The hold-for-a-human and token-scope cases of this lab: they are simulated here, and nothing on this card is about them."
  ],
  alsoTrue: [
    "UNVERIFIED, not tested here: RequiredClaims on the identity or grant is believed to do the same job earlier, at sign-in.",
    "UNVERIFIED, not tested here: the act.sub template's rule is a .contains() test on the claim, not a pattern. The mock compares exactly (an equal string or a list member).",
    "UNVERIFIED, per the Privilege console documentation and not re-run here: a Candidate policy is not enforced, only Active is."
  ],
  command: "npm run real",
  commandNote: "Real is not available in this lab: this server never calls out. The owner-run probe lives in cedar-act-sub-LAB: run npm run real there, in a terminal, with its own local .env (see that lab's .env.example). It mints a client-credentials token and calls tools/list, CountTool and ListIndexTool; it never creates or deletes policies. It was run against a real PingFederate and door on 2026-11-16 in three states (no policy, two Active policies, policies deleted) and reproduced the three rows of the table above. To see hold and scope policies on a live door, use the Privilege AI Policies and PingFederate Token Demo pages of the full demo app.",
  stepUp: {
    label: "Measured: PingID enrolment + step-up 2026-11-18",
    setup: "A real PingOne environment with the Multi_Factor sign-on policy (PINGID_AUTHENTICATION action) assigned to an application. Two persona users, each enrolled at sign-in: password accepted, then the Welcome-to-PingID screen with a QR code and a manual pairing key; both devices read back PINGID_MOBILE / ACTIVE by API (worker token, p1:read:device). The ids here are examples.",
    rows: [
      { phase: "Policy prerequisite", result: "the MFA sign-on policy existed but was assigned to NO application out of the box — until it was assigned, no app ever prompted for enrolment or step-up" },
      { phase: "Enrolment at sign-in", result: "hosted login: password, then the Welcome-to-PingID screen with a QR + a three-group pairing key; the first login doubles as the first push approval" },
      { phase: "Worker API pairing", result: "refused: WORKER applications can only be granted the openid resource, so p1:create:pairingKey is unavailable to a worker token (403)" },
      { phase: "Device state", result: "both personas: PINGID_MOBILE / ACTIVE, one device record per user, one physical phone" },
      { phase: "Step-up at sign-in", result: "password accepted, then the PingID authenticator page, then the push on the phone; approving issued the authorization code (the code appeared in the redirect URL — a test-app callback 404 after approval is harmless)" }
    ],
    rowsNote: "Every row above is from the 2026-11-18 run. The composition with Privilege's Cedar hold (case 4's scenarios) is simulated: the real HITL approval is console-side and its sign-in policy was not tested there.",
    notMeasured: [
      "Privilege's own approval step requiring a PingID step-up: the measured step-up fired at application sign-in, not inside the Privilege HITL approval flow.",
      "PingID denial, timeout and device-loss paths.",
      "Whether the approver persona in a real Privilege hold inherits the same Multi_Factor policy."
    ]
  }
};
