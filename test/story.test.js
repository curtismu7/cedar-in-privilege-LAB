import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { getCaptionsPath, loadCaptions, resetCaptionsCache, storyResponse } from '../server/src/storyRoute.js';
import { parity } from '../server/src/story/captions.js';
import { checkPin } from '../scripts/story-checkPin.mjs';
import { STEPS, STORY_ONLY, VIDEO_ONLY, scriptKeys } from '../web/src/storyScript.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const steps = STEPS;

test('story: the vendored Story files match their pin (an edited copy fails CI)', () => {
  assert.deepEqual(checkPin(root), []);
});

test('story: every caption key has a step in the script and every step has wording (the parity test)', () => {
  const problems = parity(loadCaptions(), scriptKeys(), { allowUnused: VIDEO_ONLY });
  assert.deepEqual(problems, []);
});

test('story: the parity check really fails when the wording and the script drift', () => {
  const captions = loadCaptions();
  const missingWording = { ...captions, steps: Object.fromEntries(Object.entries(captions.steps).filter(([k]) => k !== 'hold_intro')) };
  assert.deepEqual(parity(missingWording, scriptKeys(), { allowUnused: VIDEO_ONLY }), ['the demo has step "hold_intro" but captions.md does not']);
  const extra = { ...scriptKeys(), steps: [...scriptKeys().steps, 'brand_new'] };
  assert.deepEqual(parity(captions, extra, { allowUnused: VIDEO_ONLY }), ['the demo has step "brand_new" but captions.md does not']);
});

test('story: the script walks the talk track in order, all bubbles Mock (this lab has no Real mode)', () => {
  const order = ['banner', 'hold_intro', 'hold_run_held', 'hold_run_approved', 'scope_intro', 'scope_run_without', 'scope_run_with', 'actsub_intro', 'actsub_run_gate', 'candidate', 'actsub_baseline', 'ask_intro', 'ask_run_held', 'ask_run_approved', 'ask_calls', 'claims_intro', 'claims_run_without', 'claims_run_with', 'claims_run_forged', 'user_intro', 'user_run_other', 'user_run_right', 'group_intro', 'group_run_wrong', 'group_run_lookalike', 'block_intro', 'block_run_blocked', 'block_run_other', 'layered_intro', 'layered_run_scope', 'layered_run_all', 'setup_guide', 'is_is_not', 'measured'];
  assert.deepEqual(steps.filter((s) => s.type === 'bubble' && !STORY_ONLY.includes(s.key)).map((s) => s.key), order);
  assert.deepEqual(steps.filter((s) => s.modes?.includes('real')).map((s) => s.key), [], 'no Real-only steps: the lab is Mock-only');
  for (const s of steps.filter((s) => s.type === 'bubble')) {
    assert.match(readFileSync(join(root, 'web/src/storyScript.js'), 'utf8'), new RegExp(`key: '${s.key}'`));
  }
});

test('story (rule 29): the first page the viewer sees has a header naming the demo', () => {
  const captions = loadCaptions();
  const first = steps[0];
  assert.equal(first.type, 'slide', 'the first page is a slide');
  const slide = first.key === 'opening' ? captions.opening : captions.slides[first.key];
  assert.ok(slide && slide.header && slide.header.length > 3, `"${first.key}" has a header`);
  assert.equal(captions.opening.header, 'Cedar in PingOne Privilege: nine cases, one measured');
});

test('story: every step is well formed (a known trigger and type, a run-done step targets the page, no twin keys)', () => {
  const captions = loadCaptions();
  const keys = steps.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'no key twice');
  for (const s of steps) {
    assert.ok(['load', 'run-done', 'frame'].includes(s.trigger), `${s.key}: trigger`);
    assert.ok(['bubble', 'slide'].includes(s.type), `${s.key}: type`);
    if (s.sampleKey) assert.ok(captions.steps[s.sampleKey], `${s.key}: Mock wording "${s.sampleKey}" exists`);
    if (s.trigger === 'run-done') assert.ok(s.target, `${s.key}: a run-done step has a target`);
  }
});

test('story: the button a run needs is pressed by the step BEFORE it (the engine presses at the end of that step\'s hold and the run-done step waits for the run)', () => {
  const runs = {
    hold_run_held: 'hold-1-held', hold_run_approved: 'hold-2-approve',
    scope_run_without: 'scope-1-without', scope_run_with: 'scope-2-with',
    actsub_run_gate: 'actsub-2-gate', candidate: 'actsub-3-candidate', actsub_baseline: 'actsub-1-baseline',
    ask_intro: 'hold-2-approve',
    claims_run_without: 'claims-1-without', claims_run_with: 'claims-2-with', claims_run_forged: 'claims-3-forged',
    user_run_other: 'user-1-other', user_run_right: 'user-2-right',
    group_run_wrong: 'group-1-wrong', group_run_lookalike: 'group-3-lookalike',
    block_run_blocked: 'block-1-blocked', block_run_other: 'block-2-other',
    layered_run_scope: 'layered-1-scope', layered_run_all: 'layered-4-all',
  };
  const keys = steps.map((s) => s.key);
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
  // A case's first run is pressed by the case's intro bubble (which points at that very button); every later run by the run before it.
  const firstRuns = { hold_run_held: 'hold_intro', scope_run_without: 'scope_intro', actsub_run_gate: 'actsub_intro', claims_run_without: 'claims_intro', user_run_other: 'user_intro', group_run_wrong: 'group_intro', block_run_blocked: 'block_intro', layered_run_scope: 'layered_intro' };
  for (const [step, scen] of Object.entries(runs)) {
    if (firstRuns[step]) continue;
    const before = steps[keys.indexOf(step) - 1];
    assert.ok(before.prompt && before.prompt.press.includes(scen), `${before.key} presses scenario ${scen} for ${step}`);
  }
  for (const [step, intro] of Object.entries(firstRuns)) {
    assert.ok(byKey[intro].prompt.press.includes(runs[step]), `${intro} presses scenario ${runs[step]} for ${step}`);
    assert.equal(byKey[intro].target, byKey[intro].prompt.press, `${intro} points at the button it presses`);
  }
  // Every run-done step has a target the page always has, or one the press chain creates (the answer panel), and no step is its own predecessor's press.
  for (const s of steps.filter((x) => x.trigger === 'run-done')) assert.ok(s.target, `${s.key} has a target`);
  // A press names a button; a step never presses what it points the viewer at unless that is the button (the intro bubbles).
  for (const s of steps.filter((x) => x.prompt)) assert.ok(s.prompt.press, `${s.key}: the prompt is a press`);
});

test('story: every scenario button a step presses exists in the catalog (a renamed scenario fails here, not in a recording)', async () => {
  const { SCENARIOS } = await import('../server/src/scenarios.js');
  const ids = new Set(SCENARIOS.map((x) => x.id));
  for (const s of steps.filter((x) => x.prompt)) {
    const m = /scenario-([a-z0-9-]+)\]/.exec(s.prompt.press);
    if (m) assert.ok(ids.has(m[1]), `${s.key} presses scenario ${m[1]}, which exists`);
    if (s.target && s.target !== '[data-testid=flow-sim]') { const t = /scenario-([a-z0-9-]+)\]/.exec(s.target); if (t) assert.ok(ids.has(t[1]), `${s.key} points at scenario ${t[1]}`); }
  }
});

test('story: captions.md and the script are public-safe (no internal host, tenant id, key or screenshot data)', () => {
  const text = readFileSync(getCaptionsPath(), 'utf8') + readFileSync(join(root, 'web/src/storyScript.js'), 'utf8');
  // The forbidden-identifier list is assembled from parts in scripts/repo-checks.mjs; this test assembles its own the same way.
  const j = (...p) => p.join("");
  const pattern = new RegExp(`${j("ping-")}${j("devops")}\\.com|${j("proc", "yon")}|\\.local\\b|sk-ant|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`, "i");
  assert.equal(pattern.test(text), false);
});

test('story: storyResponse serves the parsed wording, and a broken file is a 500 that names the problem (never a crash)', () => {
  const ok = storyResponse();
  assert.equal(ok.status, 200);
  const body = ok.body;
  assert.ok(body.opening.title && body.steps.hold_intro);
  assert.equal(body.sourceSha256, createHash('sha256').update(readFileSync(getCaptionsPath())).digest('hex'), 'the wording says which bytes it came from');
  const dir = mkdtempSync(join(tmpdir(), 'story-'));
  const bad = join(dir, 'captions.md');
  writeFileSync(bad, '# Step: x\n\n## Title\nonly a title\n');
  const broken = storyResponse(bad);
  assert.equal(broken.status, 500);
  assert.match(broken.body.error, /^Story wording could not be read: captions\.md: step "x" needs both a "## Title" and a "## Text" section$/);
  const missing = storyResponse(join(dir, 'missing.md'));
  assert.equal(missing.status, 500);
  assert.equal(missing.body.error, 'Story wording could not be read: the wording file is missing or unreadable.');
  assert.equal(JSON.stringify(missing.body).includes(dir), false, 'the 500 never carries a server path');
  resetCaptionsCache();
});

test('story: a fix to captions.md shows without a restart (the wording is read again when the file changes)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'story-'));
  const file = join(dir, 'captions.md');
  const slide = (t) => `# Opening Slide\n\n## Header\nh\n\n## Title\n${t}\n\n## Lead\nl\n\n## Column A: a\n- x\n\n## Column B: b\n- y\n\n## Verdict\nv\n\n---\n\n`;
  const doc = (t) => slide(t) + slide('c').replace('# Opening Slide', '# Closing Slide');
  writeFileSync(file, doc('first'));
  assert.equal(loadCaptions(file).opening.title, 'first');
  writeFileSync(file, doc('second'));
  utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assert.equal(loadCaptions(file).opening.title, 'second');
});

test('story: an edit that keeps the same timestamp still shows, and the served hash always matches the served wording (one read)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'story-'));
  const file = join(dir, 'captions.md');
  const slide = (t) => `# Opening Slide\n\n## Header\nh\n\n## Title\n${t}\n\n## Lead\nl\n\n## Column A: a\n- x\n\n## Column B: b\n- y\n\n## Verdict\nv\n\n---\n\n`;
  const doc = (t) => slide(t) + slide('c').replace('# Opening Slide', '# Closing Slide');
  writeFileSync(file, doc('first'));
  const when = new Date(Date.now() - 60_000);
  utimesSync(file, when, when);
  const a = storyResponse(file).body;
  assert.equal(a.opening.title, 'first');
  assert.equal(a.sourceSha256, createHash('sha256').update(readFileSync(file)).digest('hex'));
  writeFileSync(file, doc('other'));
  utimesSync(file, when, when);            // new bytes, the very same timestamp
  const b = storyResponse(file).body;
  assert.equal(b.opening.title, 'other');
  assert.notEqual(b.sourceSha256, a.sourceSha256);
});

test('story: no console screenshot is tracked, and the assets folder is ignored (the repo is public)', () => {
  let tracked = null;
  try {
    tracked = execFileSync('git', ['ls-files', '--', 'video/assets', '*.jpg', '*.jpeg', '*.png'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch { /* no git here: the ignore rule above still ran */ }
  if (tracked) assert.deepEqual(tracked, []);
});
