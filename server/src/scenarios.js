// The tour as data: nine cases (hold for a human, token-scope gate, agent act.sub gate, step-up, claims we protect, user, group, block, layered), each a few scenarios, plus the measured evidence
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

// Cases 5 to 9 (the claim shapes, a block, layered policies). Example ids only.
const SCOPE_ADMIN = "index:admin-example";
const CLEARANCE = "restricted-example";
const USER_A = "user-a-example";
const USER_B = "user-b-example";
const GROUP_ANALYSTS = "analysts-example";
export const POLICY_CLEARANCE = { id: "cedar-list-clearance", shape: "claim", tool: "ListIndexTool", claim: "clearance", value: CLEARANCE };
export const POLICY_USER = { id: "cedar-list-user", shape: "claim", tool: "ListIndexTool", claim: "sub", value: USER_A };
export const POLICY_GROUP = { id: "cedar-list-group", shape: "claim", tool: "ListIndexTool", claim: "groups", value: GROUP_ANALYSTS };
export const POLICY_BLOCK = { id: "cedar-list-block", shape: "block", tool: "ListIndexTool" };
export const POLICY_L_SCOPE = { id: "cedar-list-scope", shape: "scope", tool: "ListIndexTool", value: SCOPE_ADMIN };
export const POLICY_L_ACT = { id: "cedar-list-actsub-a", shape: "actsub", tool: "ListIndexTool", value: AGENT_A };

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
    real: "Its real counterpart is the read-only probe this lab can now run from the page in owner-gated Real mode (one token, tools/list, CountTool, ListIndexTool), which reproduced the measured table on 2026-11-16. Not run in Mock."
  },
  {
    id: "stepup", n: 4, title: "Approver PingID step-up", action: ACTION_UNATTENDED, basis: "simulated (approval leg measured separately)",
    summary: "The hold's human approval itself requires PingID: the approver must complete a step-up (mock mobile push or OTP) before the approval records and the retry goes through. A rogue agent cannot approve as the human.",
    source: "the step-up leg is measured: 2026-11-18, a real PingID mobile device enrolled per persona and a full sign-in chain run (password, push, approve, code issued). The composition with a real Privilege hold is simulated: the approval in the real HITL flow is console-side and its own sign-in policy was not tested.",
    real: "Its real counterparts: the Privilege AI Policies hold page of the full demo app (the hold), and the PingID enrolment + step-up run of 2026-11-18 (the step-up). Not composed and run here."
  },
  {
    id: "claims", n: 5, title: "Claims we protect", action: ACTION_INVOKE, basis: "simulated",
    summary: "A tool can require a claim the issuer put in the token (here clearance). A token without it is refused. A claim the agent adds to its own token breaks the signature and is refused at sign-in, before any policy; a claim it asks for in words changes nothing.",
    source: "console text: the claim template (\"Restrict a tool to tokens carrying a claim\") is the one the measured act.sub policy came from; this lab uses it with a custom claim name. SIMULATED. How the real door reads a custom claim from a PingFederate token, and the lines around the contains(...) test, were not tested (UNVERIFIED).",
    real: "Not run for real here. The measured act.sub case (case 3) is the claim template with one claim; its real counterpart is the owner-run probe in cedar-act-sub-LAB."
  },
  {
    id: "user", n: 6, title: "The user behind the token", action: ACTION_INVOKE, basis: "simulated",
    summary: "The same claim shape on the person the token acts for (sub): the policy names one user, so a token for another user is refused and the right user is served.",
    source: "console text: the claim template with sub as the claim. SIMULATED. Which token claim a real door treats as the user, and how it reaches the policy, was not tested (UNVERIFIED).",
    real: "Not run for real here."
  },
  {
    id: "group", n: 7, title: "A group in a list claim", action: ACTION_INVOKE, basis: "simulated",
    summary: "A list claim (groups) must contain the value: a token whose list has it is served, one without it is refused, and a look-alike element does not count (the mock compares exactly).",
    source: "console text: the claim template with a list claim. SIMULATED. Whether the real door compares a list element exactly, by substring or as a set was not measured (UNVERIFIED).",
    real: "Not run for real here."
  },
  {
    id: "block", n: 8, title: "Block a tool outright", action: ACTION_INVOKE, basis: "simulated",
    summary: "A forbid with no unless clause: the tool is refused for every token, whatever it carries, while other tools on the same door are served. The kill switch for one tool.",
    source: "UNVERIFIED: the forbid line is the same as the other shapes; a policy with no unless clause was not run here or on a real door.",
    real: "Not run for real here."
  },
  {
    id: "layered", n: 9, title: "Layered policies", action: ACTION_INVOKE, basis: "simulated",
    summary: "Three policies on one tool (a scope, a claim and an agent): every forbid must be satisfied, nothing grants, and the first one not satisfied names the refusal.",
    source: "console text for each shape; the ORDER the real engine reports a refusal when several forbids apply was not tested (UNVERIFIED). The mock reports the first in the order the policies are listed.",
    real: "Not run for real here."
  }
];

export const SCENARIOS = [
  {
    id: "hold-1-held", case: "hold", n: 1, label: "Hold: no approval yet", prompt: "Overnight, search the index for open cases and summarise them.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool")], expect: ["held"], basis: "simulated",
    title: "1.1 Hold: no approval yet",
    what: "An Active hold policy sits on SearchIndexTool. The agent runs the tool with nobody watching (action mcp:InvokeUnattended; how the real gateway tells an unattended call apart was not measured, UNVERIFIED). There is no approval on record, so the unless clause is false and the call is held for a human, with an approval id.",
    say: "A policy forbids the unattended action unless an approval is on record. No approval yet, so the call is held, not refused: it waits for a person."
  },
  {
    id: "hold-2-approve", case: "hold", n: 2, label: "Hold, approve, retry", prompt: "Overnight, search the index for open cases and summarise them.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool"), APPROVE, unattended("SearchIndexTool")], expect: ["held", "approved", "allowed"], basis: "simulated",
    title: "1.2 Hold, approve, retry",
    what: "The same call is held. A person approves it (simulated here: the lab records one approval, with the approver id example). The agent retries, approval_count is now 1, the unless clause is true and the call goes through.",
    say: "The held call waits. A person approves it, the agent retries, and now the unless clause is satisfied, so the call is served. The approval is the only thing that changed."
  },
  {
    id: "scope-1-without", case: "scope", n: 1, label: "Token without the scope", prompt: "Search the index for open cases.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_SCOPE],
    calls: [attended("SearchIndexTool")], expect: ["refused"], basis: "simulated",
    title: "2.1 Token without the scope",
    what: `An Active scope policy sits on SearchIndexTool and wants the ${SCOPE_SEARCH} scope. The token carries only ${SCOPE_LIST}, so the unless clause is false and the call is refused with JSON-RPC -32600 (the mock answers HTTP 400).`,
    say: "The policy asks for a scope the token does not carry, so the call is refused and the reason names the scope."
  },
  {
    id: "scope-2-with", case: "scope", n: 2, label: "Token with the scope", prompt: "Search the index for open cases.", token: "agent", scope: `${SCOPE_LIST} ${SCOPE_SEARCH}`, policies: [POLICY_SCOPE],
    calls: [attended("SearchIndexTool")], expect: ["allowed"], basis: "simulated",
    title: "2.2 Token with the scope",
    what: `The same policy and the same tool, with a token that carries ${SCOPE_SEARCH} as well. The unless clause is true, so the call is served.`,
    say: "Same policy, same tool, a token that carries the scope: the call is served."
  },
  {
    id: "actsub-1-baseline", case: "actsub", n: 1, label: "No policy: baseline", prompt: "Count the entries, then list the index.", token: "agent", scope: SCOPE_LIST, policies: [],
    calls: [attended("CountTool"), attended("ListIndexTool")], expect: ["allowed", "allowed"], basis: "simulated", matchesMeasured: true,
    title: "3.1 No policy: baseline",
    what: "The door holds no AI policy. The agent's token carries act = {\"sub\": \"agent-client-example\"}. Both tools answer.",
    say: "No policy yet. The same token calls CountTool and ListIndexTool and both are allowed. That is the baseline."
  },
  {
    id: "actsub-2-gate", case: "actsub", n: 2, label: "Two policies, same token", prompt: "Count the entries, then list the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_A, POLICY_B],
    calls: [attended("CountTool"), attended("ListIndexTool")], expect: ["allowed", "refused"], basis: "simulated", matchesMeasured: true,
    title: "3.2 Two Active act.sub policies, same token",
    what: "Policy A on CountTool requires act.sub = agent-client-example (the token's own agent). Policy B on ListIndexTool requires act.sub = agent-b-example (a different agent). One token, two calls: CountTool is allowed, ListIndexTool is refused with JSON-RPC -32600.",
    say: "Same token, same door, two tools. Where the policy names this agent the call goes through; where it names a different value the call is refused and the reason names the claim."
  },
  {
    id: "actsub-3-candidate", case: "actsub", n: 3, label: "Candidate state", prompt: "Count the entries, then list the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_A, POLICY_B], policyState: "Candidate",
    calls: [attended("CountTool"), attended("ListIndexTool")], expect: ["allowed", "allowed"], basis: "simulated",
    title: "3.3 Candidate state",
    what: "Both policies exist but are Candidate. Per the Privilege console documentation (not re-run here, UNVERIFIED) a Candidate is not enforced, so the mock allows ListIndexTool even though its policy names a different value. Only Active is enforced here.",
    say: "Per the console documentation (not re-run here), a policy that is still a Candidate is not enforced. If a refusal you expected does not happen, check the state first."
  },
  {
    id: "stepup-1-approve", case: "stepup", n: 1, label: "Hold, step-up, approve, retry", prompt: "Overnight, search the index for open cases and summarise them.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool"), APPROVE_WITH_STEPUP, unattended("SearchIndexTool")], expect: ["held", "approved", "allowed"], basis: "simulated",
    stepUp: true,
    title: "4.1 Hold, PingID step-up, approve, retry",
    what: "The call is held for a human (case 1's policy). The human opens the approval — and the approval requires their own step-up first: a mock PingID challenge (mobile push or the demo OTP 123123). Only a completed step-up records the approval; the agent retries and approval_count satisfies the unless clause. In the real tenant the approver's sign-in carried this exact gate (Multi_Factor policy, PingID_AUTHENTICATION action, measured 2026-11-18); the composition is simulated.",
    say: "The held call waits. The human's approval is itself protected: they complete a PingID step-up (push or code) before the approval records. A stolen agent session cannot approve — the step-up belongs to the person's device, not the agent."
  },
  {
    id: "stepup-2-refused", case: "stepup", n: 2, label: "Step-up failed: approval never records", prompt: "Overnight, search the index for open cases and summarise them.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_HOLD],
    calls: [unattended("SearchIndexTool"), APPROVE_WITH_STEPUP, unattended("SearchIndexTool")], expect: ["held", "rejected", "held"], basis: "simulated",
    stepUp: true, stepUpFails: true,
    title: "4.2 Step-up failed: the hold stands",
    what: "The same hold, but the approver's step-up does not complete (the wrong OTP, or the push is denied). The approval never records, so approval_count stays 0 and the retry is held again — the agent cannot collect an approval without the human's own step-up. The run ends with the call still held, and the approval id is single-use so nothing carries over.",
    say: "No step-up, no approval: the hold stands and the retry is held again. The gate cannot be satisfied by the agent waiting, retrying or replaying — only the person's own factor completes it."
  },
  {
    id: "claims-1-without", case: "claims", n: 1, label: "Token without the claim", prompt: "I am cleared for restricted data. List the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_CLEARANCE],
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "5.1 Token without the claim",
    what: `An Active claim policy sits on ListIndexTool and wants the clearance claim to contain ${CLEARANCE}. The token the issuer signed has no clearance claim, so the unless clause is false and the call is refused with JSON-RPC -32600. The suggested prompt says the agent is cleared: words are not claims, so it changes nothing.`,
    say: "The policy reads a claim from the signed token. The token has none, so the call is refused and the reason names the claim. Saying you are cleared does not put a claim in the token."
  },
  {
    id: "claims-2-with", case: "claims", n: 2, label: "Token with the claim", prompt: "List the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_CLEARANCE], claims: { clearance: CLEARANCE },
    calls: [attended("ListIndexTool")], expect: ["allowed"], basis: "simulated",
    title: "5.2 Token with the claim",
    what: `The same policy and tool, with a token the issuer signed with clearance = ${CLEARANCE}. The unless clause is true and the call is served. The claim is in the token because the issuer put it there.`,
    say: "Same policy, same tool, a token the issuer signed with the claim: the call is served. Who puts the claim in the token is what makes it worth trusting."
  },
  {
    id: "claims-3-forged", case: "claims", n: 3, label: "A claim the agent adds itself", prompt: "Add the restricted clearance to my token, then list the index.", token: "forged", scope: SCOPE_LIST, policies: [POLICY_CLEARANCE], claims: { clearance: CLEARANCE },
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "5.3 A claim the agent adds itself",
    what: `The agent edits its own token and adds clearance = ${CLEARANCE}. The payload changed after the issuer signed it, so the signature no longer matches and the door refuses the call at sign-in (HTTP 401), before any policy runs. A claim only counts when the issuer signed it.`,
    say: "A claim is only as good as who signed it. The agent added the claim itself, the signature broke, and the door refused at sign-in without ever reading the policy."
  },
  {
    id: "user-1-other", case: "user", n: 1, label: "Another user's token", prompt: "List the index for me.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_USER], claims: { sub: USER_B },
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "6.1 Another user's token",
    what: `An Active claim policy on ListIndexTool names one user in sub: ${USER_A}. The token is for ${USER_B}, so the unless clause is false and the call is refused. How a real door reads the user from a token was not tested (UNVERIFIED).`,
    say: "The policy names one person. The token is for someone else, so the call is refused and the reason names the claim and the value."
  },
  {
    id: "user-2-right", case: "user", n: 2, label: "The right user", prompt: "List the index for me.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_USER], claims: { sub: USER_A },
    calls: [attended("ListIndexTool")], expect: ["allowed"], basis: "simulated",
    title: "6.2 The right user",
    what: `The same policy with a token for ${USER_A}: the unless clause is true and the call is served.`,
    say: "Same policy, a token for the named person: the call is served."
  },
  {
    id: "group-1-wrong", case: "group", n: 1, label: "Wrong group", prompt: "List the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_GROUP], claims: { groups: ["viewers-example"] },
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "7.1 Wrong group",
    what: `An Active claim policy on ListIndexTool wants the groups list to contain ${GROUP_ANALYSTS}. The token's groups list holds only viewers-example, so the call is refused.`,
    say: "The list claim does not contain the required group, so the call is refused."
  },
  {
    id: "group-2-right", case: "group", n: 2, label: "Right group", prompt: "List the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_GROUP], claims: { groups: ["viewers-example", GROUP_ANALYSTS] },
    calls: [attended("ListIndexTool")], expect: ["allowed"], basis: "simulated",
    title: "7.2 Right group",
    what: `The same policy with a groups list that holds ${GROUP_ANALYSTS} next to another group: the unless clause is true and the call is served.`,
    say: "The list holds the required group among others, so the call is served."
  },
  {
    id: "group-3-lookalike", case: "group", n: 3, label: "Look-alike group", prompt: "List the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_GROUP], claims: { groups: [`${GROUP_ANALYSTS}-team`] },
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "7.3 Look-alike group",
    what: `The groups list holds ${GROUP_ANALYSTS}-team, which only starts like the required value. The mock compares list elements exactly, so the call is refused. Whether the real door compares exactly was not measured (UNVERIFIED).`,
    say: "A group that only looks like the required one does not count: the mock compares exactly. Whether the real door does was not measured."
  },
  {
    id: "block-1-blocked", case: "block", n: 1, label: "A blocked tool", prompt: "List the index.", token: "agent", scope: `${SCOPE_LIST} ${SCOPE_ADMIN}`, policies: [POLICY_BLOCK], claims: { clearance: CLEARANCE, groups: [GROUP_ANALYSTS] },
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "8.1 A blocked tool",
    what: "An Active block policy on ListIndexTool has no unless clause. The token carries every scope and claim the other cases asked for, and the call is still refused: nothing a token carries satisfies a forbid with no condition.",
    say: "A forbid with no condition refuses every token, even one that carries everything. It is the switch that turns one tool off."
  },
  {
    id: "block-2-other", case: "block", n: 2, label: "Another tool, same door", prompt: "Count the entries.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_BLOCK],
    calls: [attended("CountTool")], expect: ["allowed"], basis: "simulated",
    title: "8.2 Another tool, same door",
    what: "The block policy names ListIndexTool only. CountTool on the same door has no policy against it, so it is served.",
    say: "The block names one tool. The other tools on the door are not affected."
  },
  {
    id: "layered-1-scope", case: "layered", n: 1, label: "Scope missing", prompt: "List the index.", token: "agent", scope: SCOPE_LIST, policies: [POLICY_L_SCOPE, POLICY_CLEARANCE, POLICY_L_ACT],
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "9.1 Scope missing",
    what: `Three Active policies sit on ListIndexTool: a scope (${SCOPE_ADMIN}), a claim (clearance) and an agent (act.sub = ${AGENT_A}). The token carries only ${SCOPE_LIST}, so the scope policy is the first one not satisfied and its reason is the refusal.`,
    say: "Every forbid has to be satisfied. The first one that is not names the refusal: here, the scope."
  },
  {
    id: "layered-2-claim", case: "layered", n: 2, label: "Scope met, claim missing", prompt: "List the index.", token: "agent", scope: `${SCOPE_LIST} ${SCOPE_ADMIN}`, policies: [POLICY_L_SCOPE, POLICY_CLEARANCE, POLICY_L_ACT],
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "9.2 Scope met, claim missing",
    what: "The token now carries the scope, so the scope policy is satisfied. It still has no clearance claim, so the claim policy refuses. Meeting one policy does not excuse the next.",
    say: "The scope is there, the claim is not: refused, naming the claim."
  },
  {
    id: "layered-3-agent", case: "layered", n: 3, label: "Scope and claim met, wrong agent", prompt: "List the index.", token: "agent", scope: `${SCOPE_LIST} ${SCOPE_ADMIN}`, policies: [POLICY_L_SCOPE, POLICY_CLEARANCE, POLICY_L_ACT], claims: { clearance: CLEARANCE }, actAgent: AGENT_B,
    calls: [attended("ListIndexTool")], expect: ["refused"], basis: "simulated",
    title: "9.3 Scope and claim met, wrong agent",
    what: `The scope and the claim are satisfied, but the token's act.sub names ${AGENT_B} and the third policy wants ${AGENT_A}, so it refuses.`,
    say: "Two policies satisfied, the third not: refused, naming the agent."
  },
  {
    id: "layered-4-all", case: "layered", n: 4, label: "Every policy met", prompt: "List the index.", token: "agent", scope: `${SCOPE_LIST} ${SCOPE_ADMIN}`, policies: [POLICY_L_SCOPE, POLICY_CLEARANCE, POLICY_L_ACT], claims: { clearance: CLEARANCE },
    calls: [attended("ListIndexTool")], expect: ["allowed"], basis: "simulated",
    title: "9.4 Every policy met",
    what: "The token carries the scope and the claim and names the right agent: no forbid applies, so the call is served. Nothing grants access; the call goes through because nothing forbids it.",
    say: "All three forbids are satisfied, so the call is served. Nothing here grants anything: an unrefused call is simply allowed."
  }
];

export const CASE_IDS = CASES.map((c) => c.id);

export const MOCK_NOTE =
  "The mock door is an in-process evaluator of five rule shapes (hold for a human, token scope, agent act.sub, a claim in the token, a blocked tool), each compared exactly. It is not a Cedar engine and it decides nothing real. Only the act.sub case has a result measured on a real tenant; every other case is simulated. The approver's PingID step-up (case 4) is a mock gate on the approval step: the step-up factor itself is measured (2026-11-18 enrolment + sign-in chain), the composition with a real Privilege hold is not.";

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
    "UNVERIFIED, not tested here: the act.sub template's rule is a .contains() test on the claim, not a pattern. The mock compares exactly (an equal string or a list member).",
    "UNVERIFIED, per the Privilege console documentation and not re-run here: a Candidate policy is not enforced, only Active is."
  ],
  command: "npm run real",
  commandNote: "Real is owner-gated in this lab: with a valid local .env (the same five values cedar-act-sub-LAB's probe reads) the page runs the same read-only probe — it mints a client-credentials token and calls tools/list, CountTool and ListIndexTool; it never creates or deletes policies. Without a .env this server never calls out. The probe shape was run against a real PingFederate and door on 2026-11-16 in three states (no policy, two Active policies, policies deleted) and reproduced the three rows of the table above. To see hold and scope policies on a live door, use the Privilege AI Policies and PingFederate Token Demo pages of the full demo app.",
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
