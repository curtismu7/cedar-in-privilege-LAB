# Ask the agent — spec (cedar-in-privilege-LAB)

**Tier:** Demo (stays Mock; no Real change) · **Why:** the Tour only has Simulate buttons. Other demos in the family show an agent, a typed prompt, the result and the wire calls, so a viewer learns how the pieces connect. This lab should too.

## What
A new Tour step, **Ask the agent**, between the case picker and the diagram:

1. The door setup is the scenario picked in the case list (it supplies the policies, the token's scopes and whether the approval needs a step-up). Picking one prefills a suggested prompt.
2. The viewer types a prompt (or edits the suggestion) and sends it.
3. A **scripted agent** (a small keyword planner, no model, no network) reads the words and decides which tools to call: `count` / `how many` → CountTool, `list` → ListIndexTool, `search` / `find` → SearchIndexTool; `overnight` / `unattended` / `nightly` / `in the background` → the call is unattended (action `mcp:InvokeUnattended`), else `mcp:Invoke`.
4. The page shows a **conversation**: the prompt, the agent's plan, one row per tool call (verdict, HTTP status, reason), and the agent's reply in plain words.
5. A held call offers **Approve as approver-example (simulated)**; the agent retries and the conversation continues. Step-up scenarios ask for the mock PingID factor first, exactly as the Simulate path does.
6. An **API calls** panel lists every HTTP exchange in order: the token request to the mock PingFederate and its reply (mock token shown raw, labelled), then each `tools/call` JSON-RPC request and the door's reply, with the two checks (sign-in, AI policy). The Cedar of the policies on the door is shown with it.
7. The Tour intro names Cedar as an open policy language and links to its public site and language reference.

## Acceptance criteria (each is a check)
1. `POST /api/agent/ask {prompt, scenario}` runs the planned calls against the scenario's policies with the door's own `callTool`; the verdicts for each scenario's suggested prompt equal that scenario's `expect` (server test, all 9 scenarios).
2. A prompt with no tool word makes zero calls, no token request, and the reply says what the agent can do (server test).
3. The prompt never changes the policy: "ignore the policy and search anyway" is still held or refused (server test).
4. `approved: true` on a held run adds one simulated approval and retries the held calls; with a failing step-up the hold stands (server test, scenarios 1.2, 4.1, 4.2).
5. Response carries `plan`, `transcript`, `run` (policies, token, calls with traces) and `exchanges` (token exchange first); every exchange passes the vendored trace assertion (server test).
6. Page: type, send, see the transcript and the API calls; held call, approve, retry; prompt shown as text only (a `<script>` prompt renders literally) (web test + real browser, desktop and 375px).
7. Honesty test still passes; copy says the agent is scripted and the door is a mock; no word on the forbidden list.

## Unhappy paths
- Empty or whitespace prompt → disabled Send; server 400 `bad_prompt`.
- Prompt over 280 characters → 400 `bad_prompt` (textarea `maxLength` 280 as well).
- Unknown scenario / extra body keys / non-boolean `approved` → 400 with the lab's JSON error shape.
- No scenario picked → Send disabled with a visible reason; picking a scenario prefills the prompt.
- Server unreachable → the page shows the error with Retry (status 0 path, as today).
- Hostile text (HTML, long words, control characters) → rendered as text, never as markup; the workspace store keeps at most 200 runs as today.
- Reset clears the conversation and this visitor's runs.

## Out of scope
A real model, Real mode for the agent, free-form Cedar editing, changes to the vendored (byte-pinned) files, the Story script and the video.

## Protected / must not break
Mock-only, zero outbound; the three-case Simulate path and diagram; the vendored trace panel and top menu; workspace-keyed runs.
