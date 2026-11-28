// The Story script: one entry per caption key, in the order the lab's talk track walks the page (docs/talk-track.md). Pure data, no DOM: the page wiring turns
// each entry into an engine step (a selector, a live line). The wording is in video/captions.md; test/story.test.js checks the two agree.
//
//   target   a CSS selector
//   lines    the name of a live value the page reads for the bubble's fact lines (the page wiring)
//   trigger  'load' | 'run-done' (this lab's runs are scenario runs)
//   fixedSecs only where a later video's take.py passes secs=; Play for me holds every other bubble for its wording (shared hold.js).
//
// This lab has no Real mode: every step is Mock wording, every run simulated. The measured card is static content, not a run.

const INTRO = '[data-testid=intro]';
const BANNER = '[data-testid=sim-banner]';
const SCEN = (id) => `[data-testid=scenario-${id}]`;
const RESULT = '[data-testid=flow-sim]';
const SETUP = '[data-testid=setup-guide]';
const ISISNOT = '[data-testid=is-is-not]';
const EVID = '[data-testid=evidence]';
const ASK_PROMPT = '[data-testid=ask-prompt]';
const ASK_SEND = '[data-testid=ask-send]';
const ASK_APPROVE = '[data-testid=ask-approve-btn]';
const ASK_CALLS = '[data-testid=ask-calls]';

export const STEPS = [
  { key: 'opening', type: 'slide', trigger: 'load' },

  // ---- banner: what is simulated
  { key: 'banner', type: 'bubble', trigger: 'load', target: BANNER, prefer: 'below' },

  // ---- The press prompt belongs to the step BEFORE the run it starts (the pattern of the A2A lab). A step with prompt.press shows its bubble, says "press the
  // highlighted button" to a viewer, and when Play for me's hold ends the engine presses that button; the NEXT step is run-done, so the engine waits for
  // that run to finish and only then shows the bubble that describes its result. A viewer who presses the button themselves gets the same. A run-done
  // step whose target is already on the page and has nothing running is shown at once (a viewer who skipped the press just sees the page as it is).
  // Case 1: hold for a human.
  { key: 'hold_intro', type: 'bubble', trigger: 'load', target: SCEN('hold-1-held'), prefer: 'below', prompt: { press: SCEN('hold-1-held') } },
  { key: 'hold_run_held', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('hold-2-approve') } },
  { key: 'hold_run_approved', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },

  // ---- Case 2: token-scope gate
  { key: 'scope_intro', type: 'bubble', trigger: 'load', target: SCEN('scope-1-without'), prefer: 'below', prompt: { press: SCEN('scope-1-without') } },
  { key: 'scope_run_without', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('scope-2-with') } },
  { key: 'scope_run_with', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },

  // ---- Case 3: agent act.sub gate (the measured case)
  { key: 'actsub_intro', type: 'bubble', trigger: 'load', target: SCEN('actsub-2-gate'), prefer: 'below', prompt: { press: SCEN('actsub-2-gate') } },
  { key: 'actsub_run_gate', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('actsub-3-candidate') } },
  { key: 'candidate', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('actsub-1-baseline') } },
  // actsub_baseline presses the hold case again for the next part: ask_intro's run is that press.
  { key: 'actsub_baseline', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('hold-2-approve') } },

  // ---- Ask the agent (Tour step 3): the same hold case, now typed to a scripted agent. The press chain is: the case button (it sets the door's policies and
  // the suggested prompt), then the page's own Send, then Approve. The bubbles about the prompt box and its answer all point at the prompt box, which never
  // moves, so a bubble stays put while the answer grows below it (and a run-done step whose target is always there is shown at once when a viewer skipped the press, never left
  // waiting for a run that cannot happen); ask_calls points at the API calls panel.
  { key: 'ask_intro', type: 'bubble', trigger: 'run-done', target: ASK_PROMPT, prefer: 'right', prompt: { press: ASK_SEND } },
  { key: 'ask_run_held', type: 'bubble', trigger: 'run-done', target: ASK_PROMPT, prefer: 'right', prompt: { press: ASK_APPROVE } },
  { key: 'ask_run_approved', type: 'bubble', trigger: 'run-done', target: ASK_PROMPT, prefer: 'right' },
  { key: 'ask_calls', type: 'bubble', trigger: 'load', target: ASK_CALLS, prefer: 'right' },

  // ---- Cases 5 to 9 (more Cedar cases): the same press chain. Each case's intro points at, and presses, its first scenario's button; each run bubble presses the
  // next scenario (the last bubble of a case presses nothing). The claims case comes first: it is the one that shows what we protect.
  { key: 'claims_intro', type: 'bubble', trigger: 'load', target: SCEN('claims-1-without'), prefer: 'below', prompt: { press: SCEN('claims-1-without') } },
  { key: 'claims_run_without', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('claims-2-with') } },
  { key: 'claims_run_with', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('claims-3-forged') } },
  { key: 'claims_run_forged', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },
  { key: 'user_intro', type: 'bubble', trigger: 'load', target: SCEN('user-1-other'), prefer: 'below', prompt: { press: SCEN('user-1-other') } },
  { key: 'user_run_other', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('user-2-right') } },
  { key: 'user_run_right', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },
  { key: 'group_intro', type: 'bubble', trigger: 'load', target: SCEN('group-1-wrong'), prefer: 'below', prompt: { press: SCEN('group-1-wrong') } },
  { key: 'group_run_wrong', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('group-3-lookalike') } },
  { key: 'group_run_lookalike', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },
  { key: 'block_intro', type: 'bubble', trigger: 'load', target: SCEN('block-1-blocked'), prefer: 'below', prompt: { press: SCEN('block-1-blocked') } },
  { key: 'block_run_blocked', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('block-2-other') } },
  { key: 'block_run_other', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },
  { key: 'layered_intro', type: 'bubble', trigger: 'load', target: SCEN('layered-1-scope'), prefer: 'below', prompt: { press: SCEN('layered-1-scope') } },
  { key: 'layered_run_scope', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('layered-4-all') } },
  { key: 'layered_run_all', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below' },

  // ---- the static cards
  { key: 'setup_guide', type: 'bubble', trigger: 'load', tab: 'setup', target: `${SETUP} h2`, prefer: 'right' },
  { key: 'is_is_not', type: 'bubble', trigger: 'load', tab: 'is', target: `${ISISNOT} h2`, prefer: 'right' },
  { key: 'measured', type: 'bubble', trigger: 'load', tab: 'evidence', target: `${EVID} h2`, prefer: 'right' },

  { key: 'closing', type: 'slide', trigger: 'load' },
];

// Bubbles only Story has (no video exists yet): none. Wording only a video would use: none.
export const STORY_ONLY = [];
export const VIDEO_ONLY = [];
export const EXTRA_SAMPLE_KEYS = [];

// What the parity test hands to captions.js parity(): the caption keys this script needs.
export function scriptKeys() {
  return {
    steps: STEPS.filter((s) => s.type === 'bubble').map((s) => s.key),
    slides: STEPS.filter((s) => s.type === 'slide').map((s) => s.key),
    sampleKeys: [...STEPS.map((s) => s.sampleKey).filter(Boolean), ...EXTRA_SAMPLE_KEYS],
  };
}
