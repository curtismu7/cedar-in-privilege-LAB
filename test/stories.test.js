// Rules 10 and 12: stories are data with {{cast}} tokens and three vertical packs, and a token with no value fails a test; customer.config
// sets the organisation and the default pack, and anything invalid in it is ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../server/src/index.js";
import { STORIES, PACKS, CAST_KEYS, DEFAULT_PACK, tokensOf, renderStory, storiesFor, packList } from "../server/src/stories.js";
import { parseCustomerConfig, loadCustomerConfig } from "../server/src/customer.js";
import { CASES } from "../server/src/scenarios.js";

test("there is one story per case and three vertical packs", () => {
  assert.deepEqual(Object.keys(STORIES), CASES.map((c) => c.id));
  assert.deepEqual(Object.keys(PACKS), ["banking", "healthcare", "retail"]);
  assert.deepEqual(packList().map((p) => p.id), ["banking", "healthcare", "retail"]);
  assert.equal(DEFAULT_PACK, "banking");
});

test("every {{cast}} token in every story has a value in every pack, and every pack defines exactly the cast keys", () => {
  const used = new Set(Object.values(STORIES).flatMap(tokensOf));
  assert.ok(used.size >= 4, "the stories really use tokens");
  for (const [id, pack] of Object.entries(PACKS)) {
    assert.deepEqual(Object.keys(pack.cast).sort(), [...CAST_KEYS].sort(), id);
    for (const t of used) assert.ok(CAST_KEYS.includes(t) && pack.cast[t], `pack ${id}: token ${t} has no value`);
    for (const [k, v] of Object.entries(pack.cast)) assert.match(v, /^[A-Za-z][A-Za-z -]{2,60}$/, `${id}.${k}`);
    const out = storiesFor(id, null);
    for (const text of Object.values(out)) assert.doesNotMatch(text, /\{\{|\}\}|undefined|\[object/, id);
  }
});

test("a token with no value fails: renderStory throws instead of printing a blank or 'undefined'", () => {
  assert.throws(() => renderStory("hello {{cast.nobody}}", PACKS.banking.cast), /\{\{cast\.nobody\}\} has no value/);
  assert.throws(() => renderStory("hello {{cast.org}}", { org: "" }), /no value/);
  assert.throws(() => renderStory("hello {{cast.org}}", { org: 5 }), /no value/);
  assert.throws(() => renderStory("{{cast.__proto__}}", {}), /no value/);
  assert.throws(() => renderStory("{{cast.toString}}", {}), /no value/);
  assert.equal(renderStory("a {{cast.org}} b {{cast.org}}", { org: "X" }), "a X b X");
  assert.deepEqual(tokensOf("{{cast.a}} {{ cast.b }} {{cast.c}}"), ["a", "c"]);
  assert.throws(() => storiesFor("nope"), /unknown pack/);
  assert.throws(() => storiesFor("__proto__"), /unknown pack/);
});

test("the stories frame the cases and never claim a measurement for the simulated ones", () => {
  for (const id of ["hold", "scope"]) {
    assert.match(STORIES[id], /simulated/, id);
    assert.doesNotMatch(STORIES[id], /measured/i, id);
  }
  assert.match(STORIES.actsub, /one measured run on a real tenant/);
  for (const text of Object.values(STORIES)) assert.match(text, /In this lab/);
});

test("customer.config: a valid org and pack are used, anything else is ignored", () => {
  assert.deepEqual(parseCustomerConfig('{"org":"Acme Example, Inc.","pack":"retail"}'), { org: "Acme Example, Inc.", pack: "retail" });
  const dflt = { org: null, pack: "banking" };
  for (const bad of ["", "not json", "null", "[]", "5", '"x"', "{}", '{"org":5,"pack":5}', '{"pack":"__proto__"}', '{"pack":"nope"}', '{"org":"<script>alert(1)</script>"}',
    `{"org":"${"x".repeat(61)}"}`, '{"org":"a\\nb"}', '{"org":"{{cast.org}}"}', '{"org":"  lead"}']) {
    assert.deepEqual(parseCustomerConfig(bad), dflt, bad);
  }
  assert.deepEqual(loadCustomerConfig("/nonexistent/customer.config.json"), dflt, "no file: the defaults");
  assert.deepEqual(parseCustomerConfig('{"org":"Acme","pack":"nope"}'), { org: "Acme", pack: "banking" }, "each field is judged alone");
  assert.equal(storiesFor("retail", "Acme Example").hold.startsWith("Acme Example runs a stock assistant."), true);
});

async function withApp(opts, fn) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  process.env.LAB_ALLOWED_HOSTS = "localhost:7820,127.0.0.1:7820";
  const srv = buildServer(opts).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(async (q) => { const r = await fetch(`${base}/api/catalog${q}`); return { status: r.status, body: await r.json() }; }); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

test("GET /api/catalog tells the stories in the customer's default pack, or in ?pack=, and refuses an unknown or hostile pack with a JSON 400", async () => {
  await withApp({ customer: { org: "Acme Example", pack: "healthcare" } }, async (get) => {
    const dflt = await get("");
    assert.equal(dflt.status, 200);
    assert.equal(dflt.body.pack, "healthcare");
    assert.equal(dflt.body.org, "Acme Example");
    assert.deepEqual(dflt.body.packs.map((p) => p.id), ["banking", "healthcare", "retail"]);
    assert.match(dflt.body.stories.hold, /^Acme Example runs a scheduling assistant\./);
    const retail = await get("?pack=retail");
    assert.equal(retail.body.pack, "retail");
    assert.match(retail.body.stories.scope, /^At Acme Example the stock assistant/);
    // "pack[]" is a different key to the simple query parser, so it is not the pack parameter: the default pack answers.
    assert.equal((await get("?pack[]=retail")).body.pack, "healthcare");
    for (const q of ["?pack=nope", "?pack=__proto__", "?pack=constructor", "?pack=", "?pack=banking&pack=retail", "?pack=%00", `?pack=${"a".repeat(3000)}`, "?pack=<script>"]) {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.body.error, "unknown_pack", q);
      assert.match(r.body.message, /one of banking, healthcare, retail/);
    }
  });
  await withApp({}, async (get) => {
    const r = await get("");
    assert.equal(r.status, 200);
    assert.ok(["banking", "healthcare", "retail"].includes(r.body.pack));
  });
});
