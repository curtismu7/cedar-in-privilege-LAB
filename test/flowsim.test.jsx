// The diagram (rules 5 and 17): boxes follow the cursor, Simulate keeps the user's layout, Reset restores it, speed changes the pacing,
// edges are coloured by what the mock door decided, and the diagram is loaded BY NAME from the diagram-studio/1 data.
// ReactFlow is replaced by a stand-in that records its props, so the nodes/edges the page hands it can be read and driven in jsdom.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rf = vi.hoisted(() => ({ props: null, fitView: 0 }));
vi.mock("reactflow", async (orig) => {
  const actual = await orig();
  const R = await import("react");
  return {
    ...actual,
    default: (props) => { rf.props = props; return R.createElement("div", { "data-testid": "rf-mock" }); },
    useReactFlow: () => ({ fitView: () => { rf.fitView += 1; } })
  };
});

import FlowSim from "../web/src/FlowSim.jsx";
import { getDiagram, edgeIndex } from "../web/src/diagram-data.js";
import { SCENARIOS } from "../server/src/scenarios.js";
import { runScenario } from "../server/src/index.js";
import { setJsonView } from "../web/src/components/JsonPane.jsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scenario = (id) => SCENARIOS.find((s) => s.id === id);
const run = (id, list = SCENARIOS) => {
  const { policies, policyState, ...s } = list.find((x) => x.id === id);
  return { ...s, policyCount: policies.length };
};
beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMMatrixReadOnly = class { constructor() {} };
  setJsonView("raw");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// `extra`: scenarios that exist only in this test (the page can only ask the server for ids it lists).
function fetchOk(extra = []) {
  global.fetch = (path, opts) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(runScenario([...SCENARIOS, ...extra].find((s) => s.id === JSON.parse(opts.body).scenario)))
  });
}
const node = (id) => rf.props.nodes.find((n) => n.id === id);
const edge = (source, target) => rf.props.edges.find((e) => e.source === source && e.target === target);

describe("diagram loaded by name (R17)", () => {
  it("getDiagram('cedar-in-privilege-flow') returns the diagram-studio/1 data; an unknown name throws; edges are found by source and target", () => {
    const d = getDiagram("cedar-in-privilege-flow");
    expect(d.schema).toBe("diagram-studio/1");
    expect(d.id).toBe("cedar-in-privilege-flow");
    expect(() => getDiagram("nope")).toThrow(/unknown diagram "nope"/);
    expect(edgeIndex(d, "cedar", "refused")).toBe(4);
    expect(edgeIndex(d, "human", "cedar")).toBe(5);
    expect(() => edgeIndex(d, "refused", "cedar")).toThrow(/no edge/);
  });

  it("the data passes the studio's shape rules (ids, groups, edges that exist, step edge numbers)", () => {
    const d = JSON.parse(readFileSync(join(root, "web/src/studio-data/cedar-in-privilege-flow.json"), "utf8"));
    const ID = /^[a-z0-9][a-z0-9_-]*$/;
    const COLORS = ["red", "dark", "grey", "blue", "green", "amber"];
    expect(d.schema).toBe("diagram-studio/1");
    expect(d.id).toMatch(ID);
    for (const [k, g] of Object.entries(d.groups)) { expect(k).toMatch(ID); expect(COLORS).toContain(g.color); expect(g.label.length).toBeGreaterThan(0); }
    const ids = new Set();
    for (const n of d.nodes) {
      expect(n.id).toMatch(ID); expect(ids.has(n.id)).toBe(false); ids.add(n.id);
      expect(Object.keys(d.groups)).toContain(n.group);
      expect(n.label.length).toBeLessThanOrEqual(80);
      expect(n.sub.length).toBeLessThanOrEqual(6);
      for (const t of n.sub) expect(t.length).toBeLessThanOrEqual(120);
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
    for (const e of d.edges) { expect(ids.has(e.source)).toBe(true); expect(ids.has(e.target)).toBe(true); }
    for (const s of d.steps) for (const i of s.edges) expect(Number.isInteger(i) && i >= 0 && i < d.edges.length).toBe(true);
  });

  it("the page builds its boxes and arrows from that data, one box per node, one arrow per edge", () => {
    fetchOk();
    render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    const d = getDiagram("cedar-in-privilege-flow");
    expect(rf.props.nodes.map((n) => n.id)).toEqual(d.nodes.map((n) => n.id));
    expect(rf.props.edges.map((e) => `${e.source}>${e.target}`)).toEqual(d.edges.map((e) => `${e.source}>${e.target}`));
  });
});

describe("boxes, Simulate, Reset and speed (R5, BD-5)", () => {
  it("a box follows the cursor while it is dragged, Simulate keeps where the user put it, and Reset puts it back", async () => {
    fetchOk();
    const view = render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    const start = { ...node("agent").position };
    act(() => rf.props.onNodesChange([{ type: "position", id: "agent", position: { x: 7, y: 9 }, dragging: true }]));
    expect(node("agent").position).toEqual({ x: 7, y: 9 });
    view.rerender(<FlowSim activeScenario={run("actsub-2-gate")} speed={1000} resetKey={0} />);
    await waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy());
    expect(node("agent").position).toEqual({ x: 7, y: 9 });
    fireEvent.click(screen.getByRole("button", { name: "Reset diagram" }));
    expect(node("agent").position).toEqual(start);
    expect(screen.queryByTestId("run-result")).toBeNull();
  });

  it("the header Reset (resetKey) restores positions as well", () => {
    fetchOk();
    const view = render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    const start = { ...node("door").position };
    act(() => rf.props.onNodesChange([{ type: "position", id: "door", position: { x: -50, y: 400 }, dragging: false }]));
    expect(node("door").position).toEqual({ x: -50, y: 400 });
    view.rerender(<FlowSim activeScenario={null} speed={1000} resetKey={1} />);
    expect(node("door").position).toEqual(start);
  });

  it("the canvas lets the page scroll over it and does not zoom on the wheel (BD-5)", () => {
    fetchOk();
    render(<FlowSim activeScenario={null} speed={1} resetKey={0} />);
    expect(rf.props.zoomOnScroll).toBe(false);
    expect(rf.props.preventScrolling).toBe(false);
    expect(rf.props.fitView).toBe(true);
    // the default minimum zoom (0.5) would clip the 760px-wide diagram at 375px; the whole diagram must be able to fit a phone
    expect(rf.props.minZoom).toBeLessThanOrEqual(0.3);
    expect(rf.props.fitViewOptions.minZoom).toBeLessThanOrEqual(0.3);
    expect(rf.props.nodesDraggable).toBe(true);
  });

  it("the speed setting paces the walk: a faster speed waits less", async () => {
    fetchOk();
    const delays = async (speed) => {
      const spy = vi.spyOn(globalThis, "setTimeout");
      const view = render(<FlowSim activeScenario={null} speed={speed} resetKey={0} />);
      view.rerender(<FlowSim activeScenario={run("actsub-1-baseline")} speed={speed} resetKey={0} />);
      await waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy(), { timeout: 8000 });
      const waits = spy.mock.calls.map((c) => c[1]).filter((ms) => typeof ms === "number" && ms >= 40 && ms <= 600);
      spy.mockRestore();
      cleanup();
      return waits;
    };
    const slow = await delays(0.5);
    const fast = await delays(4);
    expect(slow.length).toBeGreaterThan(0);
    expect(Math.max(...slow)).toBe(500);
    expect(Math.max(...fast)).toBe(62.5);
  });
});

describe("the edges show what the mock door decided (MT-05)", () => {
  const OK = "var(--status-ok)";
  const RED = "var(--accent)";
  const WARN = "var(--status-warn)";
  const play = async (id, extra = []) => {
    fetchOk(extra);
    const view = render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    view.rerender(<FlowSim activeScenario={run(id, [...SCENARIOS, ...extra])} speed={1000} resetKey={0} />);
    await waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy());
  };

  it("case 3, same token two tools: the call and sign-in arrows are green, allowed is green, refused is red, and the hold arrow is untouched", async () => {
    await play("actsub-2-gate");
    expect(edge("agent", "door").style.stroke).toBe(OK);
    expect(edge("door", "cedar").style.stroke).toBe(OK);
    expect(edge("cedar", "tool").style.stroke).toBe(OK);
    expect(edge("cedar", "refused").style.stroke).toBe(RED);
    expect(edge("cedar", "human").style).toBeUndefined();
    expect(edge("human", "cedar").style).toBeUndefined();
  });

  it("case 1, held: the hold arrow is the warning colour (not the refusal red), and nothing is served or refused", async () => {
    await play("hold-1-held");
    expect(edge("cedar", "human").style.stroke).toBe(WARN);
    expect(edge("cedar", "tool").style).toBeUndefined();
    expect(edge("cedar", "refused").style).toBeUndefined();
    expect(screen.getByTestId("run-status").textContent).toBe("Done: SearchIndexTool HELD.");
  });

  it("case 1, held then approved then retried: the hold arrow, the approval arrow and then the served arrow are all drawn", async () => {
    await play("hold-2-approve");
    expect(edge("cedar", "human").style.stroke).toBe(WARN);
    expect(edge("human", "cedar").style.stroke).toBe(OK);
    expect(edge("cedar", "tool").style.stroke).toBe(OK);
    expect(screen.getByTestId("run-status").textContent).toBe("Done: SearchIndexTool HELD, APPROVAL RECORDED, SearchIndexTool ALLOWED.");
    // The approval is not a gateway call: the trace panel has two exchanges, not three.
    expect(screen.getByTestId("gateway-trace").textContent).toMatch(/Agent calls the door: tools\/call SearchIndexTool \(mcp:InvokeUnattended\)/);
    expect(screen.queryByTestId("trace-3")).toBeNull();
    expect(screen.getByTestId("trace-2")).toBeTruthy();
  });

  it("case 2, token without the scope: the refusal arrow is red", async () => {
    await play("scope-1-without");
    expect(edge("cedar", "refused").style.stroke).toBe(RED);
    expect(edge("cedar", "tool").style).toBeUndefined();
  });

  it("no token (a scenario only this test has): the call and sign-in arrows are red and the walk stops at sign-in", async () => {
    const noToken = { ...scenario("scope-1-without"), id: "test-no-token", token: "none" };
    await play("test-no-token", [noToken]);
    expect(edge("agent", "door").style.stroke).toBe(RED);
    expect(edge("door", "cedar").style.stroke).toBe(RED);
    for (const to of ["tool", "human", "refused"]) expect(edge("cedar", to).style).toBeUndefined();
  });
});
