// Rule 2 (simulation honesty): the words the sibling lab's review refused must not come back in any text this lab ships, and every claim is
// labelled measured / console text / UNVERIFIED / simulated. Only the act.sub case has a measured result, from one real agent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, SCENARIOS, EVIDENCE } from "../server/src/scenarios.js";
import { GUIDE, IS_IS_NOT, LABELS } from "../server/src/guide.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
// Code comments are not shown to anyone; only strings and prose are checked.
const shown = (p) => (/\.jsx?$/.test(p) ? read(p).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n") : read(p));
const FILES = [
  "README.md", "CLAUDE.md", "docs/talk-track.md", "docs/shelf-entry.json", "content-pack.json", "web/src/studio-data/cedar-in-privilege-flow.json",
  "server/src/scenarios.js", "server/src/guide.js", "server/src/index.js",
  ...readdirSync(join(root, "web/src")).filter((f) => /\.jsx?$/.test(f)).map((f) => `web/src/${f}`)
];

const BANNED = [
  [/\bverified\b/i, "'verified' (a product claim with no named check); write UNVERIFIED or name the source"],
  [/\bvalidated\b|validation was measured|the controller validated/i, "'validated' (no recorded observation)"],
  [/never matches/i, "'never matches' stated as fact; write 'believed never to match (UNVERIFIED)'"],
  [/never enforced/i, "'never enforced' as fact; write it as console documentation (not re-run) or inside the console's own description"],
  [/Cedar has no regex|Can it match a pattern\? No/i, "'Cedar has no regex' (Cedar has a like operator; only the act.sub template's rule is a .contains() test)"],
  [/different agent (was refused|refused)/i, "reads as if a second agent was refused (never measured)"],
  [/exact text the template generated|The Cedar that was validated/i, "the Cedar on the page is this lab's generated shape, not a capture"],
  [/\bWhat Privilege did\b|Real mode shows the actual gateway/, "the trace panel's default wording, wrong over a mock"],
  [/Press Run\b/, "there is no Run button"],
  [/only narrows|narrows only/i, "'only narrows' stated as fact; the page labels narrowing-only UNVERIFIED (F05)"],
  [/measured the hold|hold (was|is) measured|scope (was|is) measured|measured (hold|scope)/i, "the hold and scope cases are simulated, never measured"]
];

for (const file of FILES) {
  // CLAUDE.md names the banned words in order to forbid them.
  if (file === "CLAUDE.md") continue;
  test(`${file}: none of the refused wordings`, () => {
    const text = shown(file);
    for (const [re, why] of BANNED) {
      const m = text.match(re);
      assert.equal(m, null, `${file} says ${JSON.stringify(m && m[0])}: ${why}`.slice(0, 300));
    }
  });
}

test("every mention of the 7 seconds is framed as one observation, not a propagation time", () => {
  let seen = 0;
  for (const file of FILES.filter((f) => f !== "CLAUDE.md")) {
    const text = shown(file);
    for (const m of text.matchAll(/7 seconds/g)) {
      seen += 1;
      const around = text.slice(Math.max(0, m.index - 300), m.index + 300);
      assert.match(around, /one (run|observation)/i, `${file}: "7 seconds" without 'one run' / 'one observation'`);
      // The caveat itself must follow the number closely (F02): "not a propagation time", also as "not a measured or guaranteed ...".
      assert.match(text.slice(m.index, m.index + 220), /not a (?:measured or guaranteed |measured |guaranteed )?propagation time/i, `${file}: "7 seconds" without the 'not a propagation time' caveat`);
    }
  }
  assert.ok(seen >= 6, `expected the 7 seconds in the evidence card, guide, talk track, pack and README; saw ${seen}`);
});

test("every mention of the 4 minutes is documentation text, not a measured delay", () => {
  let seen = 0;
  for (const file of FILES.filter((f) => f !== "CLAUDE.md")) {
    const text = shown(file);
    for (const m of text.matchAll(/4 minutes/g)) {
      seen += 1;
      assert.match(text.slice(Math.max(0, m.index - 250), m.index + 250), /documentation|docs|console text/i, `${file}: "4 minutes" without its source`);
    }
  }
  assert.ok(seen >= 3, String(seen));
});

test("act as text, Candidate and RequiredClaims are never stated as fact: each mention carries a hedge", () => {
  const HEDGE = /believed|UNVERIFIED|simulated|not measured|not re-run|Expected|should|console documentation|console text|per the console/i;
  for (const file of ["README.md", "docs/talk-track.md", "content-pack.json", "web/src/studio-data/cedar-in-privilege-flow.json", "server/src/guide.js", "server/src/scenarios.js"]) {
    for (const line of read(file).split("\n")) {
      if (/RequiredClaims|act (emitted )?as (the )?text|Candidate/i.test(line) && /not enforced|never to match|same job|no sub|no act\.sub|never enforced/i.test(line)) {
        assert.match(line, HEDGE, `${file}: unhedged claim: ${line.slice(0, 140)}`);
      }
    }
  }
});

// "was not measured" is a hedge and is fine; "was measured", "measured on", "measured once", "measured:" and "matches the real run" are claims.
const AFFIRMS_MEASURED = /(?<!not )\b(?:was|is|were|are) measured\b|\bmeasured (?:on|once|in)\b|\bmeasured:|matches the real run/i;

test("the hold and scope cases are simulated end to end: basis, case source and scenario text never say measured", () => {
  for (const id of ["hold", "scope"]) {
    const c = CASES.find((x) => x.id === id);
    assert.equal(c.basis, "simulated");
    assert.match(c.source, /console text/);
    assert.match(c.source, /SIMULATED/);
    assert.match(c.source, /not re-run here/);
    assert.match(c.real, /full demo app/);
    assert.match(c.real, /Not run here/);
    assert.doesNotMatch(JSON.stringify(c), AFFIRMS_MEASURED, `${id} case text`);
    for (const s of SCENARIOS.filter((x) => x.case === id)) {
      assert.equal(s.basis, "simulated", s.id);
      assert.doesNotMatch(JSON.stringify(s), AFFIRMS_MEASURED, s.id);
    }
  }
  const act = CASES.find((x) => x.id === "actsub");
  assert.match(act.source, /^measured: one real agent/);
  assert.match(act.source, /UNVERIFIED/);
});

test("the scope case admits that a PingFederate token's scope reaching the policy was not tested", () => {
  assert.match(CASES.find((c) => c.id === "scope").source, /whether its scope reaches context\.token\.scopes was not tested there \(UNVERIFIED\)/);
});

test("the hold's reply and the unattended action are labelled UNVERIFIED wherever the page describes them", () => {
  assert.match(SCENARIOS.find((s) => s.id === "hold-1-held").what, /how the real gateway tells an unattended call apart was not measured, UNVERIFIED/);
  const cedar = read("server/src/cedar.js");
  assert.match(cedar, /simulated reply: the status and body of a real hold were not captured here, UNVERIFIED/);
});

test("every statement in the guide and the IS / IS NOT panel has a label, and the measured ones are the ones with a measured source", () => {
  const items = [...GUIDE.steps.flatMap((s) => s.notes), ...IS_IS_NOT.is, ...IS_IS_NOT.isNot];
  for (const i of items) assert.ok(LABELS.includes(i.label), i.text);
  assert.deepEqual(LABELS, ["measured", "console text", "UNVERIFIED"]);
  for (const i of items.filter((x) => x.label === "measured")) assert.match(i.text, /one (real agent|run|observation)|2026-11-16/, i.text);
  for (const i of items.filter((x) => x.label === "UNVERIFIED")) assert.doesNotMatch(i.text, /\bwas measured\b(?! was not| not)/, i.text);
});

test("the evidence says only the act.sub case was measured, and lists the hold and scope cases as not measured", () => {
  assert.match(EVIDENCE.setup, /Only the act\.sub case \(case 3\) has a measured result; the hold and scope cases are simulated/);
  assert.ok(EVIDENCE.notMeasured.some((t) => /hold-for-a-human and token-scope cases of this lab: they are simulated here/.test(t)));
  assert.ok(EVIDENCE.notMeasured.some((t) => /second real agent/.test(t)));
  assert.match(EVIDENCE.wire, /HTTP status of a real policy refusal was not tested/);
});

test("the shelf entry and the pack cards do not say a different agent was refused, and say what was measured", () => {
  const card = JSON.parse(read("content-pack.json")).cards.find((c) => c.id === "try-actsub");
  assert.match(card.description, /policy naming a different value refuses the same token/);
  assert.match(card.description, /second agent was not tested/);
  const shelf = JSON.parse(read("docs/shelf-entry.json"));
  assert.match(shelf.description, /one real agent/);
});

test("the page says plainly the evaluator is not a Cedar engine and decides nothing real, in the banner, the help, the pack and the README", () => {
  for (const file of ["web/src/Banner.jsx", "web/src/helpContent.js", "README.md", "server/src/scenarios.js", "content-pack.json"]) {
    assert.match(shown(file), /not a Cedar engine/, file);
  }
  assert.match(shown("web/src/Banner.jsx"), /decides nothing real/);
  assert.match(shown("server/src/scenarios.js"), /decides nothing real/);
});

test("Real is described as not available in this lab, pointing at the sibling probe and the full demo app, in plain text", () => {
  const idx = shown("server/src/index.js");
  assert.match(idx, /Real is not available in this lab: the server never calls out/);
  assert.match(idx, /cedar-act-sub-LAB \(npm run real there\)/);
  assert.match(idx, /Privilege AI Policies and PingFederate Token Demo pages of the full demo app/);
  assert.match(shown("README.md"), /cedar-act-sub-LAB/);
  assert.match(shown("docs/talk-track.md"), /Real is not available in this lab/);
});

// F05: what the page labels UNVERIFIED (narrowing only, not a grant, not the RequiredClaims gate, not a regex engine) is never stated as
// fact in the pack, README or talk track: each mention sits next to UNVERIFIED or "believed".
test("the UNVERIFIED Is / Is not claims carry their hedge wherever the pack, README or talk track say them", () => {
  const CLAIM = /not a grant|not the RequiredClaims|not a regex engine|a grant\./gi;
  let seen = 0;
  for (const file of ["content-pack.json", "README.md", "docs/talk-track.md"]) {
    const text = read(file);
    for (const m of text.matchAll(CLAIM)) {
      seen += 1;
      // The hedge must be in the same sentence as the claim (a hedge in the next sentence does not count).
      const from = Math.max(text.lastIndexOf(". ", m.index), text.lastIndexOf("\n", m.index), 0);
      const ends = [text.indexOf(". ", m.index), text.indexOf("\n", m.index)].filter((i) => i >= 0);
      const sentence = text.slice(from, ends.length ? Math.min(...ends) : text.length);
      assert.match(sentence, /UNVERIFIED|believed/, `${file}: "${m[0]}" without UNVERIFIED / believed in its sentence`);
    }
  }
  assert.ok(seen >= 6, `expected the claims in the pack, README and talk track; saw ${seen}`);
});

// F06: the real refusal message carried the policy's reason (the tool and the required act.sub value), not a policy name or id. Nothing
// labelled measured, and no diagram text, says the message "names the policy".
test("no measured statement and no diagram text says the refusal message names the policy", () => {
  const NAMES = /nam(?:es|ed|ing) the policy/i;
  for (const i of GUIDE.steps.flatMap((s) => s.notes).filter((n) => n.label === "measured")) assert.doesNotMatch(i.text, NAMES, i.text);
  const diagram = read("web/src/studio-data/cedar-in-privilege-flow.json");
  assert.doesNotMatch(diagram, NAMES);
  assert.match(diagram, /the message carries the policy's reason/);
  assert.match(GUIDE.steps[7].notes.find((n) => /-32600/.test(n.text)).text, /message carried the policy's reason \(the tool and the required act\.sub value; one real agent, one run\)/);
});
