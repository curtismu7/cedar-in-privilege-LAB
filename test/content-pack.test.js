// The Learning Hub pack (rule 6) and the shelf entry (rule 9): shape, cross-references and the lab's own identity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const pack = json("content-pack.json");
const shelf = json("docs/shelf-entry.json");
const TAGS = ["pingone-privilege", "pingfederate", "agent-identity", "authorization-policy", "simulated"];

test("content pack: schema, ids unique, cards point at real terms and stories, http(s) sources", () => {
  assert.equal(pack.schema, "demo-content-pack/1");
  assert.match(pack.id, /^[a-z][a-z0-9-]{1,40}$/);
  assert.match(pack.version, /^\d+\.\d+\.\d+$/);
  for (const list of [pack.glossary, pack.sources, pack.cards, pack.stories]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  const terms = new Set(pack.glossary.map((t) => t.id));
  const stories = new Set(pack.stories.map((s) => s.id));
  for (const c of pack.cards) {
    assert.ok(["setup", "try-it", "concept", "reference"].includes(c.group), c.id);
    assert.match(c.action.href, /^\/(?!\/)/, c.id);
    for (const t of c.terms || []) assert.ok(terms.has(t), `${c.id}: term ${t}`);
    if (c.story) assert.ok(stories.has(c.story), `${c.id}: story ${c.story}`);
  }
  for (const s of pack.sources) assert.match(s.url, /^https?:\/\//);
  for (const s of pack.stories) assert.match(s.id, /^S\d\d$/);
});

test("content pack and shelf entry agree on the lab's identity (port 7820, provisional catalog id D135)", () => {
  assert.equal(shelf.id, "cedar-in-privilege-lab");
  assert.equal(shelf.name, "Cedar in Privilege");
  assert.equal(shelf.kind, "Demo");
  assert.ok(!("tier" in shelf), "the shelf's field is kind; tier is dropped by its registry");
  assert.equal(shelf.catalogId, "D135");
  assert.equal(pack.demo.catalog, shelf.catalogId);
  assert.equal(shelf.port, 7820);
  assert.equal(shelf.url, "http://localhost:7820");
  assert.equal(pack.demo.baseUrl, "http://127.0.0.1:7820");
  assert.equal(pack.demo.doctor, "/api/health");
  assert.equal(pack.demo.id, pack.id);
  assert.equal(pack.id, shelf.id);
  assert.deepEqual(pack.demo.tags, shelf.tags);
});

test("shelf entry: description <= 300, tags from the family list, portable composeFile, no ping product of its own", () => {
  assert.ok(shelf.description.length <= 300, String(shelf.description.length));
  for (const t of shelf.tags) assert.ok(TAGS.includes(t), t);
  assert.equal(shelf.composeFile, "docker-compose.yml");
  assert.deepEqual(shelf.pingProducts, []);
  assert.equal(shelf.contentPack, "content-pack.json");
});

test("the README says Tier: Demo, the sibling's identity is not carried over, and the sibling is named only as the pointer to the real probe", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /^Tier: Demo$/m);
  const files = ["README.md", "CLAUDE.md", "package.json", "docker-compose.yml", "Dockerfile", "content-pack.json", "docs/shelf-entry.json", "docs/talk-track.md",
    "web/src/studio-data/cedar-in-privilege-flow.json", "web/app.css", "web/index.html", "web/src/App.jsx", "web/src/FlowSim.jsx", "web/src/mode-modal/ModeModal.jsx", "web/src/Evidence.jsx", "web/src/RunResult.jsx",
    "web/src/ScenarioPicker.jsx", "web/src/Guide.jsx", "server/src/index.js", "server/src/cedar.js", "server/src/cedarTrace.js", "server/src/pf.js", "server/src/scenarios.js", "server/src/guide.js",
    "scripts/doctor.mjs", "scripts/reset.mjs", ".github/workflows/ci.yml"];
  // The sibling's own id, name, catalog id and port must not survive as this lab's identity.
  const SIBLING = /\bD134\b|\b7819\b|\b17819\b|cedar-act-sub-lab|Cedar act\.sub Lab/;
  for (const f of files) assert.ok(!SIBLING.test(readFileSync(join(root, f), "utf8")), `${f} still carries the sibling lab's identity`);
  // The sibling is named (as cedar-act-sub-LAB) only where the text points at its owner-run probe.
  for (const f of files) {
    for (const line of readFileSync(join(root, f), "utf8").split("\n")) {
      if (/cedar-act-sub-LAB/.test(line)) assert.match(line, /probe|npm run real|sibling|real result|Real is not|real counterpart|owner-run|Structure|forked/i, `${f}: ${line.slice(0, 120)}`);
    }
  }
});
