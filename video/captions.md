<!--
  All the WORDING for cedar-in-privilege-LAB's live Story (and any later video). Written from the lab's docs/talk-track.md:
  a sentence with no source there (measured / console text / UNVERIFIED / simulated) does not belong here.

  Rules for editing safely:
  - The first page has a "## Header" naming what the demo shows (rule 29): keep it on the Opening Slide.
  - Don't rename a "# Opening Slide" / "# Closing Slide" / "# Slide: <key>" / "# Step: <key>" heading, and don't rename
    a "## Header" / "## Title" / "## Text" / "## Lead" / "## Verdict" / "## Column A: ..." / "## Column B: ..." heading.
    Those names are how the Story (and a later video) find the right piece of text. Editing the WORDS after them is always safe.
  - A "## Column A: <label>" or "## Column B: <label>" label IS shown on the slide as that column's heading.
  - Keep each bullet under a column on its own line starting with "- ".
  - "---" on its own line separates one section from the next.
  - No slide is held longer than 10 seconds (owner, 2026-11-22): keep each slide to about 40 words.
  - This repo is public: no host names, tenant ids, client ids or user names here.
  - This lab has no Real mode: every run is simulated. Each bubble says so; the measured card is the only measured content.
  - Live values go in {braces}, filled from the page by the Story wiring (storyWiring.js).
-->

# Opening Slide

## Header
Cedar in PingOne Privilege: three cases, one measured

## Title
Cedar in PingOne Privilege: three cases, one measured

## Lead
Cedar is the rule engine inside the Privilege gateway: it can refuse a call, hold it for a human, or let it through.

## Column A: This walk
- Three cases, simulated
- One measured on a real tenant
- Every claim labelled

## Column B: What to watch
- What the policy names
- What the token carries
- Allow, refuse or hold

## Verdict
Every run on this page is simulated; the mock door evaluates three rule shapes and decides nothing real.

---

# Step: banner

## Title
What is simulated here

## Text
The runs use a mock token and a mock door. The door evaluates three rule shapes; it is not a Cedar engine and it decides nothing real. Only the act.sub case has a result measured on a real tenant.

---

# Step: hold_intro

## Title
Case 1: hold a call for a human

## Text
A forbid on mcp:InvokeUnattended with an unless approval_count >= 1 does not refuse the call: it waits, and the door hands back an approval id. The shape is console text from the full demo app's notes, not re-run here; the hold itself is simulated.

---

# Step: hold_run_held

## Title
Run: Hold — no approval yet

## Text
The call is held, not refused: the walk shows the door return an approval id while the policy waits for a person. Simulated; its real counterpart is the Privilege AI Policies page of the full demo app.

---

# Step: hold_run_approved

## Title
Run: Hold — approve, retry

## Text
A person approves, the retry goes through. The approval was the only change: same token, same policy, same tool. Simulated.

---

# Step: scope_intro

## Title
Case 2: token-scope gate

## Text
The policy wants a scope the token must carry. Whether a PingFederate token's scope reaches the policy was not tested (UNVERIFIED). Simulated; the shape is console text.

---

# Step: scope_run_without

## Title
Run: Token without the scope

## Text
The call is refused with JSON-RPC -32600 and the reason names the missing scope. Same policy, same tool, wrong token. Simulated.

---

# Step: scope_run_with

## Title
Run: Token with the scope

## Text
Same policy, same tool, token now carries the scope: served. The scope was the only change. Simulated.

---

# Step: actsub_intro

## Title
Case 3: agent act.sub gate

## Text
Two Active policies, one token: each policy names an agent in act.sub. This is the case with a measured counterpart on a real tenant (2026-11-16).

---

# Step: actsub_run_gate

## Title
Run: Two policies, same token

## Text
CountTool is allowed — its policy names this agent. ListIndexTool is refused: "action denied by policy: ListIndexTool requires act.sub to be agent-b-example". Open "What the mock door did" to see the two checks the mock computed. The refusal text is the measured shape.

---

# Step: candidate

## Title
Candidate vs Active

## Text
Per the console documentation (not re-run here, UNVERIFIED), a Candidate policy is stored and checked but not enforced. Always start there, then move to Active when you are happy.

---

# Step: actsub_baseline

## Title
Run: No policy — baseline

## Text
Without the policies both tools are served: sign-in is the only gate. This is the same token as the refusal run; the policy was the difference.

---

# Step: ask_intro

## Title
Now say it in words

## Text
Case 1 again, this time with an agent. Picking a case sets the door's policies and fills in a prompt. The agent is scripted, not a model: it reads count, list or search, and the policies decide, not your words. Simulated.

---

# Step: ask_run_held

## Title
Run: the agent's call is held

## Text
The agent asks the mock PingFederate for a token, then calls SearchIndexTool. The door holds the call for a person and the agent says it will wait. The prompt chose the tool; the policy made the call wait. Simulated.

---

# Step: ask_run_approved

## Title
Run: approve, the agent retries

## Text
You play the approver (simulated). The approval is recorded, the agent retries the held call and the door serves it. Same token, same policy: the approval was the only change.

---

# Step: ask_calls

## Title
The API calls and responses

## Text
Every exchange in order: the token request to the mock PingFederate, then each tools/call to the door with its reply and the two checks, sign-in and AI policy. The token is mock-issued and shown whole. Nothing here leaves this machine.

---

# Step: claims_intro

## Title
Case 5: the claims we protect

## Text
A policy on ListIndexTool wants a clearance claim in the token. The claim has to come from the issuer, not from the agent or its words. Simulated; how a real door reads a custom claim from a PingFederate token was not tested (UNVERIFIED).

---

# Step: claims_run_without

## Title
Run: token without the claim

## Text
The token has no clearance claim, so the call is refused and the reason names the claim. The prompt said the agent was cleared, but words are not claims. Simulated.

---

# Step: claims_run_with

## Title
Run: token with the claim

## Text
The issuer signed clearance into the token, so the same call is served. Same policy, same tool: the claim was the only change. Simulated.

---

# Step: claims_run_forged

## Title
Run: a claim the agent adds itself

## Text
The agent edits its own token to add the claim. The signature no longer matches, so the door refuses at sign-in, before any policy is read. A claim only counts when the issuer signed it. Simulated.

---

# Step: user_intro

## Title
Case 6: the user behind the token

## Text
The same claim shape on sub, the person the token acts for: the policy names one user. Simulated; how a real door reads the user from a token was not tested (UNVERIFIED).

---

# Step: user_run_other

## Title
Run: another user's token

## Text
The token is for a different user, so the call is refused and the reason names the claim and the value. Simulated.

---

# Step: user_run_right

## Title
Run: the right user

## Text
The token is for the named user, so the call is served. Same policy, same tool. Simulated.

---

# Step: group_intro

## Title
Case 7: a group in a list claim

## Text
A list claim, groups, must contain the required group. A list that holds it is served, one that does not is refused. Simulated; whether a real door compares a list element exactly was not measured (UNVERIFIED).

---

# Step: group_run_wrong

## Title
Run: wrong group

## Text
The groups list holds only another group, so the call is refused. Simulated.

---

# Step: group_run_lookalike

## Title
Run: look-alike group

## Text
The list holds a group whose name only starts like the required one. The mock compares exactly, so the call is refused. Whether a real door does was not measured (UNVERIFIED).

---

# Step: block_intro

## Title
Case 8: block a tool outright

## Text
A forbid with no unless clause refuses the tool for every token: the switch that turns one tool off. Simulated; a policy with no condition was not run on a real door (UNVERIFIED).

---

# Step: block_run_blocked

## Title
Run: a blocked tool

## Text
The token carries every scope and claim, and the call is still refused: nothing a token carries satisfies a forbid with no condition. Simulated.

---

# Step: block_run_other

## Title
Run: another tool, same door

## Text
The block names ListIndexTool only. CountTool on the same door is served. Simulated.

---

# Step: layered_intro

## Title
Case 9: layered policies

## Text
Three policies on one tool: a scope, a claim and a named agent. Every forbid must be satisfied, nothing grants, and the first one not satisfied names the refusal. Simulated; the real engine's order of refusals was not tested (UNVERIFIED).

---

# Step: layered_run_scope

## Title
Run: scope missing

## Text
The token lacks the scope, so the scope policy is the first one not satisfied and its reason is the refusal. Simulated.

---

# Step: layered_run_all

## Title
Run: every policy met

## Text
The token carries the scope and the claim and names the right agent, so no forbid applies and the call is served. Nothing grants access: an unrefused call is simply allowed. Simulated.

---

# Step: setup_guide

## Title
Set up Cedar in Privilege

## Text
Eight console steps: sign in, Access Management, AI Policies, New Policy (name it, pick Candidate), pick a template, read the Cedar preview, Create Policy and read Validation & Stages, then Enforce, wait and test. Every line is labelled console text, measured or UNVERIFIED.

---

# Step: is_is_not

## Title
Cedar is, and is not

## Text
Cedar is a per-call rule engine that can narrow, with three actions. Console text says it is not authentication, not instant and not everything.

---

# Step: measured

## Title
The measured card

## Text
This part is not a mock run: it is what happened on a real tenant on 2026-11-16, for the act.sub case only. In one run the first poll, about 7 seconds after the policies were created, already showed the refusal. One observation, not a measured propagation time. Read the "Not measured" list below it.

---

# Closing Slide

## Title
Where to go next

## Lead
Three cases walked, one measured. The measured run's own lab is cedar-act-sub-LAB.

## Column A: Try next
- Run the step-up case
- Type your own prompt to the agent
- Read the UNVERIFIED list

## Column B: Remember
- Only Active is enforced
- Every run here is simulated
- The measured card is static

## Verdict
Say which lines are UNVERIFIED when you present this; the page labels them for you.

---
