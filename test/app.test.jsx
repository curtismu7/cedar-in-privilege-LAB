import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import React from "react";
import App from "../web/src/App.jsx";
import ScenarioPicker from "../web/src/ScenarioPicker.jsx";
import Evidence from "../web/src/Evidence.jsx";
import { SetupGuide, IsIsNot } from "../web/src/Guide.jsx";
import { setJsonView } from "../web/src/components/JsonPane.jsx";
import { SCENARIOS, CASES, EVIDENCE, MOCK_NOTE } from "../server/src/scenarios.js";
import { GUIDE, IS_IS_NOT } from "../server/src/guide.js";
import { packList, storiesFor } from "../server/src/stories.js";
import { runScenario } from "../server/src/index.js";

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMMatrixReadOnly = class { constructor() {} };
  if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
  if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {};
});
beforeEach(() => { setJsonView("raw"); try { history.replaceState(null, "", location.pathname + location.search); } catch { /* no history in some hosts */ } });
afterEach(() => cleanup());

// The catalog and the runs come from the real server modules, so the page is tested against what the server really answers.
const catalog = (pack = "airlines") => ({
  pack,
  packs: packList(),
  org: null,
  stories: storiesFor(pack, null),
  door: "door-example",
  mockNote: MOCK_NOTE,
  cases: CASES,
  scenarios: SCENARIOS.map(({ policies, policyState, calls, ...s }) => ({ ...s, policyState: policyState || "Active", policyCount: policies.length, callCount: calls.length })),
  guide: GUIDE,
  isIsNot: IS_IS_NOT,
  evidence: EVIDENCE
});
const REAL_REASON = "Real is owner-gated: with a valid local .env the page runs the read-only probe for the act.sub case (the server never calls out without it; a run is the four read-only POSTs npm run real makes). The hold and scope cases stay simulated: to see hold and scope policies on a live door use the Privilege AI Policies and PingFederate Token Demo pages of the full demo app.";
const j = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// `fail`: (path) => undefined | "reject" | { status, html: true }
function mockFetch({ fail = () => undefined } = {}) {
  const calls = [];
  global.fetch = (path, opts) => {
    const method = (opts && opts.method) || "GET";
    calls.push({ path, method, body: opts && opts.body, headers: (opts && opts.headers) || {} });
    const f = fail(path, calls.filter((c) => c.path === path).length);
    if (f === "reject") return Promise.reject(new TypeError("Failed to fetch"));
    if (f && f.html) return Promise.resolve({ ok: false, status: f.status, json: () => Promise.reject(new SyntaxError("<html")) });
    if (path.startsWith("/api/catalog")) return j(catalog(new URL(path, "http://x").searchParams.get("pack") || "airlines"));
    if (path === "/api/info") return j({ source: "mock", realAvailable: false, realReason: REAL_REASON });
    if (path === "/api/run") return j(runScenario(SCENARIOS.find((s) => s.id === JSON.parse(opts.body).scenario)));
    if (path === "/api/reset") return j({ ok: true });
    if (path === "/api/mode") {
      const want = JSON.parse(opts.body).source;
      return want === "real" ? j({ error: "real_unavailable", message: REAL_REASON }, 409) : j({ source: "mock" });
    }
    return j({}, 404);
  };
  return calls;
}
const pick = async (name) => fireEvent.click(await screen.findByRole("button", { name }));
const ran = () => waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy(), { timeout: 8000 });

describe("the page", () => {
  it("renders the simulation banner first, saying what is simulated, that the door is not a Cedar engine and that only act.sub was measured", async () => {
    mockFetch();
    render(<App />);
    const banner = await screen.findByTestId("sim-banner");
    expect(banner.textContent).toMatch(/simulated/i);
    expect(banner.textContent).toMatch(/not a Cedar engine/);
    expect(banner.textContent).toMatch(/THREE Cedar rule shapes/);
    expect(banner.textContent).toMatch(/Only the act\.sub case has a result measured on a real tenant/);
    expect(banner.textContent).toMatch(/hold and scope cases are simulated/);
    expect(banner.compareDocumentPosition(screen.getByTestId("intro")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the shared TopMenu in the header, with mode, theme, presenter and Reset", async () => {
    mockFetch();
    render(<App />);
    const menu = await screen.findByTestId("top-menu");
    expect(menu.closest("header.shell-bar")).not.toBeNull();
    for (const id of ["mode-select", "theme-select", "presenter", "reset"]) expect(within(menu).getByTestId(id)).toBeTruthy();
  });

  it("the Real option is disabled with a visible reason that names the .env gate and the simulated hold/scope cases; Mock is the pressed value", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("mode-real").disabled).toBe(true));
    expect(screen.getByTestId("mode-real").title).toBe(REAL_REASON);
    expect(screen.getByTestId("mode-select").value).toBe("mock");
    const reason = screen.getByTestId("real-reason");
    expect(reason.textContent).toMatch(/Real needs the owner's local \.env/);
    expect(reason.textContent).toMatch(/read-only probe/);
    // The link to the reason is set in an effect after the render that disables the button, so wait for it rather than read it at once.
    await waitFor(() => expect(screen.getByTestId("mode-select").getAttribute("aria-describedby")).toBe("real-reason"));
  });

  it("the toggle posts the mode: Real answers 409 and nothing changes, Mock answers 200 and reloads the data", async () => {
    const calls = mockFetch();
    render(<App />);
    const select = await screen.findByTestId("mode-select");
    await waitFor(() => expect(screen.getByTestId("tour-cases")).toBeTruthy());
    const catalogLoads = () => calls.filter((c) => c.path === "/api/catalog").length;
    const before = catalogLoads();
    fireEvent.change(select, { target: { value: "real" } });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/mode" && JSON.parse(c.body).source === "real")).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(catalogLoads()).toBe(before);
    expect(screen.getByTestId("mode-select").value).toBe("mock");
    fireEvent.change(select, { target: { value: "mock" } });
    await waitFor(() => expect(catalogLoads()).toBe(before + 1));
    expect(calls.some((c) => c.path === "/api/mode" && JSON.parse(c.body).source === "mock")).toBe(true);
  });

  it("theme select sets and clears data-theme", async () => {
    mockFetch();
    render(<App />);
    const select = await screen.findByTestId("theme-select");
    fireEvent.change(select, { target: { value: "dark" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.change(select, { target: { value: "auto" } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("lists the three cases in order, each with its scenarios, its source label and where its real counterpart runs", async () => {
    mockFetch();
    render(<App />);
    await screen.findByRole("button", { name: "Hold: no approval yet" });
    const names = (id) => within(screen.getByTestId(`scenarios-${id}`)).getAllByRole("button").map((b) => b.textContent);
    expect(names("hold")).toEqual(["Hold: no approval yet", "Hold, approve, retry"]);
    expect(names("scope")).toEqual(["Token without the scope", "Token with the scope"]);
    expect(names("actsub")).toEqual(["No policy: baseline", "Two policies, same token", "Candidate state"]);
    expect(screen.getByTestId("case-basis-hold").textContent).toBe("simulated here");
    expect(screen.getByTestId("case-basis-scope").textContent).toBe("simulated here");
    expect(screen.getByTestId("case-basis-actsub").textContent).toBe("measured once, 2026-11-16");
    expect(screen.getByTestId("case-source-hold").textContent).toMatch(/console text/);
    expect(screen.getByTestId("case-source-hold").textContent).toMatch(/SIMULATED/);
    expect(screen.getByTestId("case-source-scope").textContent).toMatch(/UNVERIFIED/);
    expect(screen.getByTestId("case-source-actsub").textContent).toMatch(/measured: one real agent/);
    expect(screen.getByTestId("case-real-hold").textContent).toMatch(/Privilege AI Policies page of the full demo app/);
    expect(screen.getByTestId("case-real-scope").textContent).toMatch(/PingFederate Token Demo page of the full demo app/);
    expect(screen.getByTestId("case-real-actsub").textContent).toMatch(/owner-gated Real mode/);
  });

  it("each case tells its story in the picked vertical pack; changing the pack reloads the catalog with it and leaves the results alone", async () => {
    const calls = mockFetch();
    render(<App />);
    await screen.findByRole("button", { name: "Hold: no approval yet" });
    expect(screen.getByTestId("story-hold").textContent).toMatch(/^AirGuard Airlines runs a rebooking assistant\./);
    expect(screen.getByTestId("pack-select").value).toBe("airlines");
    expect(within(screen.getByTestId("pack-select")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Airline", "Banking", "Healthcare", "Retail"]);
    fireEvent.change(screen.getByTestId("pack-select"), { target: { value: "healthcare" } });
    await waitFor(() => expect(screen.getByTestId("story-hold").textContent).toMatch(/^Example Health runs a scheduling assistant\./));
    expect(calls.some((c) => c.path === "/api/catalog?pack=healthcare")).toBe(true);
    expect(screen.getByTestId("pack-select").value).toBe("healthcare");
    expect(screen.getByTestId("story-actsub").textContent).toMatch(/one measured run on a real tenant/);
    expect(screen.queryByText(/\{\{cast/)).toBeNull();
  });

  it("case 1: a held call shows HELD with the approval id and the exact hold text, then the approval and the allowed retry", async () => {
    mockFetch();
    render(<App />);
    await pick("Hold: no approval yet");
    await ran();
    expect(screen.getByTestId("verdict-0").textContent).toBe("HELD");
    expect(screen.getByTestId("reason-0").textContent).toMatch(/^HTTP 202 held for a human: SearchIndexTool needs a human approval \(approval id approval-example-1, approver approver-example\) \(simulated reply/);
    expect(screen.getByTestId("cedar-cedar-hold-search").textContent).toContain('action == Action::"mcp:InvokeUnattended"');
    expect(screen.getByTestId("cedar-cedar-hold-search").textContent).toContain("unless { context has approval_count && context.approval_count >= 1 };");
    const panel = screen.getByTestId("gateway-trace");
    expect(panel).toHaveTextContent(/AI policy \(Cedar\), action mcp:InvokeUnattended/);
    expect(panel).not.toHaveTextContent(/all 2 decisions passed/);
    await pick("Hold, approve, retry");
    await waitFor(() => expect(screen.getByTestId("verdict-2").textContent).toBe("ALLOWED"), { timeout: 8000 });
    expect(screen.getByTestId("verdict-0").textContent).toBe("HELD");
    expect(screen.getByTestId("verdict-approval-1").textContent).toBe("APPROVED");
    expect(screen.getByTestId("reason-approval-1").textContent).toBe("a human approved approval-example-1 (simulated): approval_count is now 1");
  });

  it("case 2: the token without the scope is refused with the exact reason, the token with it is allowed, and the token's scopes are shown", async () => {
    mockFetch();
    render(<App />);
    await pick("Token without the scope");
    await ran();
    expect(screen.getByTestId("verdict-0").textContent).toBe("REFUSED");
    expect(screen.getByTestId("reason-0").textContent).toBe("JSON-RPC -32600 action denied by policy: SearchIndexTool requires the index:search-example scope");
    expect(screen.getByTestId("cedar-cedar-scope-search").textContent).toContain('unless { context has token && context.token.scopes.contains("index:search-example") };');
    expect(screen.getByTestId("token-claims")).toBeTruthy();
    // F09 (rule 4): a mock-issued token is labelled with a chip, not only by the sentence beside it.
    const label = screen.getByTestId("mock-token-label");
    expect(label.querySelector(".chip").textContent).toBe("mock-issued");
    expect(label.textContent).toMatch(/signs nothing real/);
    await pick("Token with the scope");
    await waitFor(() => expect(screen.getByTestId("verdict-0").textContent).toBe("ALLOWED"), { timeout: 8000 });
  });

  it("case 3: same token, CountTool allowed and ListIndexTool refused with the exact reason, and the trace panel is the mock's", async () => {
    mockFetch();
    render(<App />);
    await pick("Two policies, same token");
    await ran();
    expect(screen.getByTestId("verdict-0").textContent).toBe("ALLOWED");
    expect(screen.getByTestId("verdict-1").textContent).toBe("REFUSED");
    expect(screen.getByTestId("reason-1").textContent).toBe("JSON-RPC -32600 action denied by policy: ListIndexTool requires act.sub to be agent-b-example");
    expect(screen.getByTestId("cedar-cedar-list-act-sub").textContent).toBe(
      '@reason("ListIndexTool requires act.sub to be agent-b-example")\n' +
      'forbid (principal, action == Action::"mcp:Invoke", resource == Tool::"ListIndexTool")\n' +
      'when   { context.app == "door-example" }\n' +
      'unless { context.token.claims has "act.sub"\n' +
      '         && context.token.claims["act.sub"].contains("agent-b-example") };'
    );
    expect(within(screen.getByTestId("policy-list")).getAllByRole("button", { name: "Copy" })).toHaveLength(2);
    const panel = screen.getByTestId("gateway-trace");
    expect(panel).toHaveTextContent(/Agent calls the door: tools\/call CountTool \(mcp:Invoke\)/);
    expect(screen.getByTestId("gateway-trace-basis")).toHaveTextContent(/Simulated/);
    expect(screen.getByTestId("gateway-trace-basis")).toHaveTextContent(/covers the act\.sub case only/);
    expect(screen.getByTestId("policy-provenance").textContent).toMatch(/Hold: the shape of the live HITL policy copy/);
    expect(screen.getByTestId("policy-provenance").textContent).toMatch(/UNVERIFIED against the tenant/);
    await pick("Candidate state");
    await waitFor(() => expect(screen.getByTestId("verdict-1").textContent).toBe("ALLOWED"), { timeout: 8000 });
    expect(screen.getByTestId("scenario-about").textContent).toMatch(/simulated, not measured/);
  });

  it("the set-up guide shows the eight steps with labelled notes, and the IS / IS NOT panel shows both lists", async () => {
    mockFetch();
    render(<App />);
    fireEvent.click(within(await screen.findByRole("navigation", { name: "Sections" })).getByText("Set up"));
    const guide = await screen.findByTestId("setup-guide");
    expect(guide.id).toBe("setup");
    expect(within(guide).getAllByRole("listitem").filter((li) => li.dataset.testid?.startsWith("guide-step-"))).toHaveLength(8);
    expect(within(screen.getByTestId("guide-step-4")).getAllByTestId("label").map((n) => n.textContent)).toEqual(["console text", "UNVERIFIED"]);
    expect(within(screen.getByTestId("guide-step-8")).getAllByTestId("label").map((n) => n.textContent)).toEqual(["console text", "measured", "measured", "console text"]);
    expect(screen.getByTestId("guide-step-8").textContent).toMatch(/one observation, not a propagation time/);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByText("Is / Is not"));
    const panel = await screen.findByTestId("is-is-not");
    expect(panel.id).toBe("is");
    expect(within(screen.getByTestId("is-list")).getAllByRole("listitem", { hidden: true })).toHaveLength(5);
    expect(within(screen.getByTestId("is-not-list")).getAllByRole("listitem", { hidden: true })).toHaveLength(3);
    const labels = within(panel).getAllByTestId("label").map((n) => n.textContent);
    expect(new Set(labels)).toEqual(new Set(["console text", "measured"]));
    expect(labels.filter((l) => l === "measured")).toHaveLength(1);
  });

  it("the nav marks the section the viewer picked, and only the picked section is on the page (tabs, not a scroll-down)", async () => {
    mockFetch();
    render(<App />);
    const nav = within(await screen.findByRole("navigation", { name: "Sections" }));
    expect(nav.getByText("Tour").getAttribute("aria-current")).toBe("page");
    // The Tour pane is shown; the others are hidden.
    expect(screen.getByTestId("pane-flow").hidden).toBe(false);
    expect(screen.getByTestId("pane-setup").hidden).toBe(true);
    expect(screen.getByTestId("pane-evidence").hidden).toBe(true);
    fireEvent.click(nav.getByText("Set up"));
    expect(nav.getByText("Set up").getAttribute("aria-current")).toBe("page");
    expect(nav.getByText("Tour").getAttribute("aria-current")).toBeNull();
    expect(screen.getByTestId("pane-setup").hidden).toBe(false);
    expect(screen.getByTestId("pane-flow").hidden).toBe(true);
    fireEvent.click(nav.getByText("Measured"));
    expect(nav.getByText("Measured").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("pane-evidence").hidden).toBe(false);
    expect(screen.getByTestId("pane-setup").hidden).toBe(true);
  });

  it("Reset (the TopMenu button) clears the result and tells the server", async () => {
    const calls = mockFetch();
    render(<App />);
    await pick("No policy: baseline");
    await ran();
    fireEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("run-result")).toBeNull());
    expect(calls.some((c) => c.path === "/api/reset" && c.method === "POST")).toBe(true);
  });

  it("presenter mode shows the talk-track line and keeps the simulation banner", async () => {
    mockFetch();
    render(<App />);
    fireEvent.click(await screen.findByTestId("presenter"));
    expect(screen.getByTestId("presenter-say").textContent).toMatch(/Start with case 1/);
    fireEvent.click(await screen.findByRole("button", { name: "Two policies, same token" }));
    expect(screen.getByTestId("presenter-say").textContent).toMatch(/names a different value the call is refused/);
    expect(screen.getByTestId("sim-banner")).toBeTruthy();
  });

  it("the measured card is separate from the runs, labelled with its date, and says it covers act.sub only", async () => {
    mockFetch();
    render(<App />);
    await pick("Two policies, same token");
    await ran();
    const evidence = screen.getByTestId("evidence");
    expect(evidence.contains(screen.getByTestId("run-result"))).toBe(false);
    expect(screen.getByTestId("flow-sim").contains(evidence)).toBe(false);
    expect(within(evidence).getByTestId("evidence-label").textContent).toBe("Measured on a real tenant 2026-11-16");
    expect(evidence.querySelector("h2").textContent).toMatch(/act\.sub case only/);
    expect(within(evidence).getByTestId("real-command").textContent).toBe("npm run real");
    expect(evidence.textContent).toMatch(/Real is owner-gated in this lab/);
    // F10: the sentence that separates measured from simulated.
    expect(within(evidence).getByText("This card is static text, not a run of the mock above.")).toBeTruthy();
  });

  it("an unreachable server is a named error with Retry, never a blank page or a throw", async () => {
    mockFetch({ fail: (path, n) => (path === "/api/catalog" && n === 1 ? "reject" : undefined) });
    render(<App />);
    const err = await screen.findByTestId("load-error");
    expect(err.textContent).toMatch(/the lab server is not reachable/);
    fireEvent.click(within(err).getByRole("button", { name: "Retry" }));
    await screen.findByRole("button", { name: "Hold: no approval yet" });
    expect(screen.queryByTestId("load-error")).toBeNull();
  });

  it("a run that fails is shown with the server's message (an HTML error page is not parsed) and Retry works", async () => {
    mockFetch({ fail: (path, n) => (path === "/api/run" && n === 1 ? { status: 502, html: true } : undefined) });
    render(<App />);
    await pick("No policy: baseline");
    const err = await screen.findByTestId("run-error", {}, { timeout: 8000 });
    expect(err.textContent).toMatch(/The run failed: the request failed \(HTTP 502\)/);
    fireEvent.click(within(err).getByRole("button", { name: "Retry" }));
    await ran();
    expect(screen.queryByTestId("run-error")).toBeNull();
  });
});

describe("the workspace id (rule 13)", () => {
  const KEY = "cedar-in-privilege-workspace";
  const WS = /^w-[0-9a-f]{16}$/;
  const wsHeader = (c) => c.headers["X-Workspace-Id"];
  afterEach(() => { try { sessionStorage.clear(); } catch { /* none */ } });

  it("every request the page makes carries the per-browser id from sessionStorage, and the id is shown nowhere", async () => {
    sessionStorage.setItem(KEY, "w-seeded.id_1");
    const calls = mockFetch();
    render(<App />);
    await pick("No policy: baseline");
    await ran();
    fireEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/reset")).toBe(true));
    const paths = new Set(calls.map((c) => c.path.split("?")[0]));
    for (const p of ["/api/catalog", "/api/info", "/api/shelf", "/api/run", "/api/reset"]) expect(paths.has(p), p).toBe(true);
    for (const c of calls) expect(wsHeader(c), `${c.method} ${c.path}`).toBe("w-seeded.id_1");
    expect(document.body.textContent).not.toContain("w-seeded.id_1");
  });

  it("a first visit makes up a short id of safe characters, keeps it in sessionStorage, and keeps sending that one", async () => {
    sessionStorage.removeItem(KEY);
    const calls = mockFetch();
    render(<App />);
    await pick("No policy: baseline");
    await ran();
    const stored = sessionStorage.getItem(KEY);
    expect(stored).toMatch(WS);
    for (const c of calls) expect(wsHeader(c), `${c.method} ${c.path}`).toBe(stored);
  });

  it("when sessionStorage throws the page still sends one stable valid id and does not fail", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      const calls = mockFetch();
      render(<App />);
      await pick("No policy: baseline");
      await ran();
      const ids = new Set(calls.map(wsHeader));
      expect(ids.size).toBe(1);
      expect([...ids][0]).toMatch(WS);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe("Evidence", () => {
  it("shows the measured table, what was not measured and what is also true", () => {
    render(<Evidence evidence={EVIDENCE} />);
    const rows = within(screen.getByTestId("evidence-table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[2].textContent).toMatch(/refused: action denied by policy: ListIndexTool requires act\.sub to be agent-b-example/);
    expect(screen.getByTestId("not-measured").textContent).toMatch(/second real agent/);
    expect(screen.getByTestId("not-measured").textContent).toMatch(/TEXT "\{\}"/);
    expect(screen.getByTestId("not-measured").textContent).toMatch(/hold-for-a-human and token-scope cases of this lab: they are simulated here/);
    expect(screen.getByTestId("also-true").textContent).toMatch(/not a pattern/);
    expect(screen.getByTestId("evidence-cedar").textContent).toBe(EVIDENCE.cedar);
  });

  it("renders the three measured rows cell by cell, and the not-a-propagation-time caveat beside the 7 seconds (F01, F02)", () => {
    render(<Evidence evidence={EVIDENCE} />);
    const cells = within(screen.getByTestId("evidence-table")).getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(cells).toEqual([
      ["Baseline (no policy)", "allowed", "allowed"],
      [
        "Policy A on CountTool (act.sub = the token's own agent) and policy B on ListIndexTool (act.sub = a different agent), both Active",
        "allowed",
        "refused: action denied by policy: ListIndexTool requires act.sub to be agent-b-example (JSON-RPC -32600)"
      ],
      ["Both policies deleted", "allowed", "allowed"]
    ]);
    expect(screen.getByTestId("evidence-rows-note").textContent).toBe(EVIDENCE.rowsNote);
    expect(within(screen.getByTestId("evidence")).getByText(/about 7 seconds/).textContent).toMatch(/one observation, not a measured or guaranteed propagation time/);
    const items = within(screen.getByTestId("not-measured")).getAllByRole("listitem").map((li) => li.textContent);
    for (const re of [/second real agent/, /act emitted as the TEXT/, /no-token wording/, /Candidate policy not being enforced/, /exactly, by substring or by set membership/]) {
      expect(items.filter((t) => re.test(t))).toHaveLength(1);
    }
  });

  it("renders nothing without data", () => {
    const { container } = render(<Evidence evidence={null} />);
    expect(container.textContent).toBe("");
    expect(render(<SetupGuide guide={null} />).container.textContent).toBe("");
    expect(render(<IsIsNot panel={null} />).container.textContent).toBe("");
  });
});

describe("ScenarioPicker", () => {
  const scenarios = catalog().scenarios;
  const pickerFor = (active) => render(<ScenarioPicker cases={CASES} scenarios={scenarios} active={active} onSelect={() => {}} />);
  it("marks the pressed scenario and says it is simulated, not measured, for a hold or scope scenario", () => {
    pickerFor(scenarios.find((s) => s.id === "hold-2-approve"));
    expect(screen.getByRole("button", { name: "Hold, approve, retry" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hold: no approval yet" }).getAttribute("aria-pressed")).toBe("false");
    const about = screen.getByTestId("scenario-about");
    expect(about.textContent).toMatch(/simulated, not measured/);
    expect(about.textContent).toMatch(/Expected: held, approved, allowed/);
    expect(about.querySelector(".chip").className).toContain("basis-unmeasured");
  });

  it("only the act.sub steps that match the real run are marked as such", () => {
    pickerFor(scenarios.find((s) => s.id === "actsub-2-gate"));
    const chip = screen.getByTestId("scenario-about").querySelector(".chip");
    expect(chip.textContent).toBe("outcome matches the real run (2026-11-16)");
    expect(chip.className).toContain("basis-measured");
    expect(screen.getByTestId("scenario-about").textContent).toMatch(/Expected: allowed, refused/);
  });
});
