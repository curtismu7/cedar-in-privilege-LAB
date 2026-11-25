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

export const STEPS = [
  { key: 'opening', type: 'slide', trigger: 'load' },

  // ---- banner: what is simulated
  { key: 'banner', type: 'bubble', trigger: 'load', target: BANNER, prefer: 'below' },

  // ---- Case 1: hold for a human. A run-done step carries prompt.press: the scenario button Play for me clicks (the viewer picks the same one).
  { key: 'hold_intro', type: 'bubble', trigger: 'load', target: SCEN('hold-1-held'), prefer: 'below' },
  { key: 'hold_run_held', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('hold-1-held') } },
  { key: 'hold_run_approved', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('hold-2-approve') } },

  // ---- Case 2: token-scope gate
  { key: 'scope_intro', type: 'bubble', trigger: 'load', target: SCEN('scope-1-without'), prefer: 'below' },
  { key: 'scope_run_without', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('scope-1-without') } },
  { key: 'scope_run_with', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('scope-2-with') } },

  // ---- Case 3: agent act.sub gate (the measured case)
  { key: 'actsub_intro', type: 'bubble', trigger: 'load', target: SCEN('actsub-2-gate'), prefer: 'below' },
  { key: 'actsub_run_gate', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('actsub-2-gate') } },
  { key: 'candidate', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('actsub-3-candidate') } },
  { key: 'actsub_baseline', type: 'bubble', trigger: 'run-done', target: RESULT, prefer: 'below', prompt: { press: SCEN('actsub-1-baseline') } },

  // ---- the static cards
  { key: 'setup_guide', type: 'bubble', trigger: 'load', target: `${SETUP} h2`, prefer: 'right' },
  { key: 'is_is_not', type: 'bubble', trigger: 'load', target: `${ISISNOT} h2`, prefer: 'right' },
  { key: 'measured', type: 'bubble', trigger: 'load', target: `${EVID} h2`, prefer: 'right' },

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
