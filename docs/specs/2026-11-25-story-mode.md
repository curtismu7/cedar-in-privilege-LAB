# Story mode spec (cedar-in-privilege-LAB)

**Status:** agreed (2026-11-25) **Owner:** Curtis (decides scope)
**Process tier:** 2 (D135, a catalogued demo colleagues use — spec, tests per fix, local gate, `/code-review`, owner's go to merge).
**Contract:** `shared/story/README.md` in AI-DEMO-Standalone; how-to `shared/story/ADDING-TO-A-LAB.md`.
**Reference implementations:** `privilege-a2a-anthropic-demo-LAB` (full: engine + wiring) and `pf-privilege-obo-LAB` (lab #29: closest match — single React app, Mock-only, no video, no prompt steps). Copy from both on `main`; do not guess.

## Goal
Add a **Demo | Story** toggle to the lab page. **Demo** is the page exactly as it is now. **Story** walks the lab's own talk track as numbered pop-up bubbles and slides, live, in **Mock** (this lab has no Real mode — the banner says so, and the server never calls out), paced by the viewer (Next/Back/Exit) with an optional Play for me (speed + Pause) advancing on the shared hold formulas. No video exists yet; `captions.md` is written from the lab's `docs/talk-track.md` so a later video and Story share one wording file.

## This lab's specifics (differs from the references)
- One React app (`web/src/App.jsx`), shared TopMenu `extra` slot present (verified). Story lazy-loaded; toggle in `extra`.
- **Runs are scenario runs, not questions.** Picking a scenario button (`.scenario-btn`, no testid today — add `data-testid={scenario-${s.id}}`) auto-runs it via `FlowSim.run()` (`POST /api/run`); step-up scenarios (`stepup`) instead open the PingID panel (`stepup-panel`) and wait for `stepup-run` or `stepup-cancel`. `FlowSim` must dispatch `cip:run-start` / `cip:run-end` (`detail.ok`: false only when the request itself failed — a policy refusal is a completed run, `ok: true`) around `run()`, and cancel/reset paths must end the run too.
- **No prompt steps.** The viewer never types; the script has no `prompt` fields. Play for me clicks the scenario button (and, for the step-up scenario, the panel's run button) with `el.click()`.
- **No Real mode at all**: every step is Mock wording; no `modes` splits, no `sample_*` variants needed beyond the lab's own "simulated" honesty rules (every simulated claim says simulated; the measured card is the only measured content and is static).
- Scenarios: hold (held / approved-retry), scope (without / with), actsub (two policies), stepup (approver PingID). The talk track's walk order maps to these plus: the banner, the intro card, the setup guide, Is/Is-not, and the measured card (`#evidence`).
- No Run Observability panel exists in this lab — no observability bubble; that VIDEO.md requirement does not apply until a video exists.

## Design
- Vendor `shared/story/` byte for byte into `web/src/story/` + `server/src/story/`, pin with `story.sha256` + `scripts/story-checkPin.mjs`; never edit the copies.
- `video/captions.md` (new folder) is the one wording file; server serves it at `GET /api/story` with `sourceSha256`; a broken file is a 500 that names the wording problem, never a server path. Dockerfile copies it into the image.
- `web/src/storyScript.js`: one entry per caption key, in talk-track walk order; `STORY_ONLY`/`VIDEO_ONLY` lists for any future video split.
- `web/src/storyWiring.js` + `StoryRoot.jsx`: copied from the obo lab (same shape), changed to this lab's selectors, the `cip:` event prefix, and run hooks reading `cip:run-start`/`cip:run-end`.
- Toggle in `App.jsx`'s TopMenu `extra` slot; React error boundary keeps Demo alive if the Story chunk fails; Exit returns to Demo, remembers it, drops `?story=1`.

## Acceptance criteria (each a runnable check)
1. Story off: the served page is unchanged; `npm test` green; no story script requested.
2. Story on: opening slide shows the `## Header` (rule 29); Next/Back/Esc work; Esc leaves nothing in the DOM.
3. Parity test: every `# Step:` / `# Slide:` key has a matching script entry and the reverse.
4. Pin test: the vendored copy matches the canonical commit byte for byte (`story pin ok`).
5. Mock (the only mode): the walk runs the four cases' scenarios through `POST /api/run`, shows the simulated/simulated-measured wording honestly (no bubble claims a live run), and makes no network call beyond the lab's own.
6. Play for me reaches the same end state as Next, clicks scenario buttons with an untrusted event, stops on manual input, and at Normal speed its holds follow the shared `hold.js` formulas (hold test over every key).
7. No screenshot is committed; slides are text-only.
8. Browser check: `tools/walk.py` exit 0 at 1920x1080 and 1800x1169; `tools/play.py` exit 0; screenshots read (rule 9).
9. Esc from the step-up panel and from any open dialog must not exit Story unexpectedly (tested).
10. `npm test` green on the Air (`air-test`).

## Unhappy paths
- A scenario run that fails (network/500): the run-end fires with `ok:false`; Play stops with a message; Next still works.
- Reset mid-story: the story re-syncs via run events; the wait is told honestly.
- The step-up scenario while its panel is open: the story step targets the panel; cancel (`stepup-cancel`) ends the pending state and the story re-syncs.
- localStorage blocked: the toggle still works for the session.
- Viewer picks a scenario early (before its story step): the run events re-sync; the result already on the page is shown at once instead of re-running.
- A target that does not exist (e.g. result region before a run): the step skips quietly; a warning is only for things that should have worked.

## Out of scope
Recording a video (a later PR per VIDEO.md, needs masking + the owner's take); editing the shared TopMenu or any vendored shared file; adding a Real mode; committing screenshots; tenant or PingFederate changes.

## Protected / must not break
The mock door's run contract (`POST /api/run`, step-up gating), the scenario/stories data, the measured card's exact wording, the existing pin checks (`gateway-trace`, `standalone-ui.css`), and the existing `npm test` suite. Demo mode must look and behave byte-for-byte as before with Story off.
