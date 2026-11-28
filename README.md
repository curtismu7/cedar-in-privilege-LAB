# cedar-in-privilege-LAB

Tier: Demo

**Cedar in Privilege: a guided tour of how Cedar AI policies work in PingOne Privilege, with nine cases, a set-up guide and a "what Cedar is and is not" panel.**

Cedar is the policy language Privilege uses for its AI policies. This lab runs nine cases against a **mock** Privilege door, in-process, with a mock PingFederate token. Structure copied from cedar-act-sub-LAB, the lab that holds the owner-run real probe for the act.sub case; its scenario content is replaced by this lab's three cases, generalised from one rule shape to three.

## What the page walks

1. **Hold for a human.** A `forbid` on `mcp:InvokeUnattended` with an `unless approval_count >= 1` clause holds the call: it is not refused, it waits, and an approval id comes back. A simulated approval is recorded, the agent retries, and the call goes through. Source: console text (the shape of the live HITL policy copy in the full demo app's notes, read from a console on 2026-10-22, not re-run here). **Simulated** in this lab; its real counterpart is the Privilege AI Policies page of the full demo app.
2. **Token-scope gate.** A `forbid ... unless context.token.scopes.contains("<scope>")` refuses a token without the scope and allows one with it. Source: console text (the live scope policy copy and the console template, recorded in the full demo app's notes, not re-run here). Whether a PingFederate token's scope reaches the policy was not tested there (UNVERIFIED). **Simulated** here; its real counterpart is the PingFederate Token Demo page of the full demo app.
3. **Agent act.sub gate.** The measured case. Two tools, one act.sub policy each: the tool whose policy names this agent is allowed, the tool whose policy names a different value is refused (`action denied by policy: ListIndexTool requires act.sub to be agent-b-example`, JSON-RPC -32600; HTTP 400 on the mock). Measured on a real tenant on 2026-11-16 with one real agent; the **Measured** card on the page is that evidence, kept apart from the mock runs. A Candidate scenario (simulated, per the console documentation, not re-run) shows that a Candidate is not enforced.

**More Cedar cases (5 to 9).** Beyond hold, scope and act.sub: **Claims we protect** (a tool needs a claim the issuer signed into the token; a claim the agent adds to its own token breaks the signature and is refused at sign-in, and a claim it only mentions in words is not in the token), **the user behind the token** (`sub`), **a group in a list claim**, **block a tool outright** (a forbid with no condition) and **layered policies** (every forbid must be satisfied, the first unmet one names the refusal). All simulated; how a real door reads a custom claim, the user or a list claim is UNVERIFIED. Spec: `docs/specs/2026-11-28-more-cedar-cases.md`.

**Ask the agent** (step 3 of the Tour). Pick a scenario (it sets the door's policies), type a prompt and send it. A **scripted agent** (a small keyword planner: `count`, `list`, `search`; no model, no network) turns the words into `tools/call`s to the mock door. The page shows the conversation (prompt, plan, each call's verdict, the agent's reply), the Cedar of the policies on the door, and **API calls and responses**: the token request to the mock PingFederate, then each JSON-RPC request and the door's reply with its two checks. A held call offers "Approve (simulated)" (with the mock PingID factor in the step-up scenarios) and the agent retries. The prompt only chooses tools: the door setup (policies, token, attended or unattended call) comes from the scenario, so no typed word changes a policy, a token or the action a policy matches. `POST /api/agent/ask {prompt, scenario, approved?, stepUp?}`; prompt 1 to 280 characters. Cedar's own site and language reference are linked from the Tour intro.

Below the tour:

- **Set up Cedar in Privilege**: the eight console steps (sign in, Access Management then AI Policies, New Policy, name it and pick Candidate, pick a template, read the "Cedar this will save" preview, Create Policy and read Validation & Stages, Enforce, wait and test). Every line is labelled `measured`, `console text` or `UNVERIFIED`.
- **What Cedar is, and is not**: a per-call rule engine inside the gateway that can narrow, with three actions (`mcp:Invoke` refuse, `mcp:InvokeUnattended` hold for a human, `llm:Receive` withhold a reply); console text: not authentication, not instant, not everything; UNVERIFIED (believed, not tested here): not a grant, not the RequiredClaims claim gate, not a regex engine. Each line is labelled.

Every call shows **What the mock door did (simulated)** (the family's shared trace panel, relabelled for this lab through its title and basis-note props): the request, the reply, and the two checks in between (sign-in, AI policy), each marked `checked` because the lab's own mock door computed it. A hold is an `info` decision (it waits for a human), never a pass. It is not Privilege.

## Honest scope

- The mock door is an in-process **evaluator of five rule shapes** (hold, token scope, agent act.sub, a claim, a blocked tool), each compared exactly. It is **not a Cedar engine** and it **decides nothing real**.
- **Only the act.sub case has a measured result**: one real agent, two Active policies, one refusal. The hold and scope cases are simulated; nothing here is a measurement of them. The hold's reply (HTTP 202 and its body), how the real gateway tells an unattended call apart, and how a PingFederate token's scopes reach the policy are all UNVERIFIED.
- Not measured, whichever case: a second real agent with a different act.sub, act emitted as text, the no-token wording, a Candidate not being enforced (console documentation, not re-run), whether the real rule compares exactly, by substring or by set membership. RequiredClaims is believed to do the same job earlier, at sign-in (UNVERIFIED, not tested here).
- Timing: in one run on 2026-11-16 the first poll, about 7 seconds after the policies were created, already showed the refusal. That is one observation, not a measured or guaranteed propagation time. The documentation says a change can take about 4 minutes to reach the gateway.
- Example ids only (`agent-client-example`, `agent-b-example`, `approver-example`, `door-example`, example scopes, `.example` hosts). The mock token of a run is shown whole and labelled mock-issued (an HS256 fixture JWT that signs nothing real, rule 4).

## Modes (rule 19)

A Mock / Real toggle sits in the header. The lab runs in **Mock**. **Real is owner-gated**: with a valid local `.env` (same shape as cedar-act-sub-LAB's, see `.env.example` there — this lab ships the same probe library and reads the same five values) the server lets the page run the read-only probe for the act.sub case (one client-credentials token, tools/list, CountTool, ListIndexTool — never a policy change), through a netguard hole scoped to exactly the two `.env` origins and only for the run's duration, and the page renders the verdicts with a REAL label; the hold and scope cases stay simulated even in Real mode. Without a `.env` the toggle is disabled with the reason as visible text beside the toggle (linked to it with `aria-describedby`, and its tooltip), `POST /api/mode {"source":"real"}` answers 409, and the server never makes an outbound call (netguard with a self-test stays on). The one recorded real result is the Measured card (2026-11-16).

## The diagram (rule 17)

The diagram is `diagram-studio/1` data from the diagram-studio repo's own registry of app flows: `CEDAR_IN_PRIVILEGE_FLOW` (id `cedar-in-privilege-flow`, in its `core/src/apps.js`). This lab vendors that flow's export byte for byte in `web/src/studio-data/cedar-in-privilege-flow.json`, pinned by `studio-data.sha256` (re-vendor from the studio, never edit; a test fails on a changed byte, and on a local copy coming back) and looks it up **by name** (`getDiagram("cedar-in-privilege-flow")`, `web/src/diagram-data.js`): one agent, the door's sign-in, the AI policies, and the three answers (tool served, held for a human, refused). The pin currently names the flow as it stands on the studio's pull request branch; re-vendor from the studio's main once that pull request has merged. Boxes follow the cursor while dragged, Simulate keeps where you put them, **Reset** (header) and **Reset diagram** restore the positions, and the speed control is in the header.

## Workspace id (rule 13)

Each visitor's runs are kept under a **workspace id**: `default` unless the request carries an `X-Workspace-Id` header (1 to 64 characters of `A-Za-z0-9._-`; anything else is a 400 `bad_workspace` in the lab's JSON error shape). The page makes one up per browser tab, keeps it in `sessionStorage` (in memory for the page load when the browser blocks storage), sends it on every request and never shows it. It keys the recorded runs (`POST /api/run`, `GET /api/runs`) and **Reset**, so one visitor's runs and Reset never touch another's. Each run record carries its own traces, so there is no separate trace sink; the lab has no data directory and no sessions. At most 100 workspaces are held in memory (the least recently used is dropped), and a restart clears them. Callers that send no header (the doctor, `npm run reset`, the shelf's health poll) share `default`.

## customer.config (rule 12)

An optional, git-ignored `customer.config.json` beside `package.json` (copy `customer.config.example.json`) sets the organisation name used in the stories (`org`) and the default story setting (`pack`: `airline` (the default), `banking`, `healthcare` or `retail`). Anything invalid is ignored. It is read by `npm start` and `npm run dev` only: the Docker image does not contain it (`.dockerignore` excludes it, compose mounts nothing and the filesystem is read-only), so a container always starts with no organisation name and the banking setting. The **Story setting** select on the page changes the setting at any time.

## The trace panel's headings

The "What the mock door did (simulated)" panel is the family's shared trace panel, vendored byte for byte and pinned, so this lab does not edit it. Its wording is generic: some headings still read "Request sent to the gateway" and "Decisions the gateway made". Over this lab they mean the mock door; the panel's title and basis note, set through its props, say so. A mock-source label belongs upstream in the shared panel, then a re-vendor.

## Run

```bash
npm ci
npm test          # server (node --test) + web (vitest) + repo checks
npm run doctor    # spins a throwaway server on 17820 and proves the cases
npm run build     # vite build -> dist/
npm start         # http://localhost:7820
```

Docker (OrbStack only, never Docker Desktop):

```bash
docker compose up --build -d     # publishes 127.0.0.1:7820 only
```

Port 7820 and catalog id D135 are provisional placeholders (the shelf registry has the final say).

## Safety

- Loopback-only host bind (0.0.0.0 inside the container only because Docker routes via eth0; the host publish is pinned to `127.0.0.1`).
- Host allowlist (`LAB_ALLOWED_HOSTS`, including the lab-proxy names) + same-origin write guard + JSON-only writes (415).
- Zero real outbound calls from the server. No real secrets or identifiers.

## Tests

- `test/*.test.js` (node --test): every scenario's exact verdict, status and message, the five rule shapes and their edges, hostile input, the Host and Origin guards, strict `/api/mode`, the honesty hedges, vendored pins, the content pack, netguard.
- `test/*.test.jsx` and the vendored `web/src/gateway-trace/gateway-trace.test.jsx` (vitest): the page, the shared TopMenu, the disabled Real toggle and its reason, the trace panel, the diagram.
- `npm run test:repo`: forbidden-identifier scan and the vendored file pins.
