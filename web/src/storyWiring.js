// Story wiring: the lab's own glue between the shared Story engine (web/src/story/, vendored) and this page. It turns the script (storyScript.js) into engine
// steps and gives the engine a `host` that reads and drives the page: the scenario runs. It never edits the page's own markup; it clicks the page's own
// buttons with script-made events (isTrusted is false, so Play for me is not mistaken for the viewer's own input).
//
// The page announces runs with cip:run-start and cip:run-end ({ ok }) from FlowSim: ok is false only when the request itself failed. A run whose result is
// the policy refusal completes normally (the refusal IS the result), so it is a run that ended ok. This lab has no Real mode: mode is always 'mock'.

import { STEPS } from './storyScript.js';

/** The first sentence, never cut mid-word. */
export function firstSentence(s, limit = 150) {
  let t = String(s || '').trim().split('\n')[0] || '';
  const cut = t.indexOf('. ');
  if (cut > 0) t = t.slice(0, cut + 1);
  if (t.length <= limit) return t;
  const head = t.slice(0, limit);
  const sp = head.lastIndexOf(' ');
  return `${sp > 0 ? head.slice(0, sp) : head}...`;
}

export function createHost({ win = window, doc = document, mode = () => 'mock', settleMs = 500 } = {}) {
  const runs = { starts: 0, ends: 0, lastOk: true };
  const waiters = new Set();   // each is (ok, reason) => void
  const timers = new Set();
  const watchers = new Set();  // onRun subscribers: told when a run starts or ends, so the bar can say whose turn it is
  const onStart = () => { runs.starts += 1; watchers.forEach((f) => f()); };
  const onEnd = (e) => {
    runs.ends += 1; runs.lastOk = e.detail ? e.detail.ok !== false : true;
    for (const w of [...waiters]) w(runs.lastOk);
    watchers.forEach((f) => f());
  };
  // A Reset clears the page: a step waiting for a run is told so (and the run's own end, which follows, finds nobody waiting).
  const onReset = () => { for (const w of [...waiters]) w(false, 'The page was reset. Press Next to carry on, or Exit.'); };
  win.addEventListener('cip:run-start', onStart);
  win.addEventListener('cip:run-end', onEnd);
  win.addEventListener('cip:reset', onReset);

  const q = (sel) => doc.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (el) => { if (!el || el.disabled) throw new Error('the button is not available'); el.click(); };

  return {
    mode,
    query: q,
    mark: () => ({ starts: runs.starts, ends: runs.ends }),
    runStarted: (m) => runs.starts > m.starts,
    runInFlight: () => runs.starts > runs.ends,
    onRun: (cb) => { watchers.add(cb); return () => watchers.delete(cb); },
    waitForRun(m, timeoutMs) {
      return new Promise((resolve) => {
        const finish = (r) => { clearTimeout(t); timers.delete(t); waiters.delete(check); resolve(r); };
        const done = (ok, reason) => finish(ok ? { ok: true } : { ok: false, reason: reason || 'The run failed. Press Next to carry on, or Exit.' });
        const check = (ok, reason) => { if (reason || runs.ends > m.ends) done(ok, reason); };
        const t = setTimeout(() => finish({ ok: false, reason: 'The run did not finish in time. Press Next to carry on, or Exit.' }), timeoutMs);
        timers.add(t);
        if (runs.ends > m.ends) { done(runs.lastOk); return; }
        waiters.add(check);
      });
    },
    prefill() {},
    send(step) {
      // This lab has no typed question: a step whose prompt names a button clicks it, anything else clicks the step's target (a scenario button).
      const sel = (step.prompt && step.prompt.press) || step.target;
      click(q(sel));
    },
    assetUrl: () => null,   // no screenshot ships; a slide is text-only
    dispose() { win.removeEventListener('cip:run-start', onStart); win.removeEventListener('cip:run-end', onEnd); win.removeEventListener('cip:reset', onReset); timers.forEach(clearTimeout); timers.clear(); waiters.clear(); watchers.clear(); },
    _sleep: sleep, _settleMs: settleMs,
  };
}

// Steps left out of the walk-through. None now.
export const NOT_YET = [];

/** The script as engine steps. `captions` is /api/story. */
export function buildSteps({ captions, host, doc = document, win = window, script = STEPS, notYet = NOT_YET }) {
  return script.filter((s) => !notYet.includes(s.key)).map((s) => {
    const step = { key: s.key, type: s.type, trigger: s.trigger, modes: s.modes, sampleKey: s.sampleKey, prefer: s.prefer, place: s.place, fixedSecs: s.fixedSecs, frameTimeoutMs: s.frameTimeoutMs };
    if (s.type === 'bubble') step.target = s.target;
    return step;
  });
}
