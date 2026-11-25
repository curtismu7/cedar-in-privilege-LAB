import React, { useState, useEffect, useRef } from "react";
import ReactFlow, { Background, Controls, MarkerType, Position, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { postJson, failureText } from "./api.js";
import { getDiagram, edgeIndex } from "./diagram-data.js";
import LabTrace from "./LabTrace.jsx";
import RunResult from "./RunResult.jsx";

// The mock PingID step-up gate (rule 24 class of honesty: mock, labelled). The factor picker + push/OTP verification live here; the
// server decides (verifyStepUp). The demo OTP is a labelled bypass. The measured real counterpart is 2026-11-18: enrolment at sign-in
// and a full password → push → approve → code chain; the composition with a real Privilege hold is simulated.
const FACTORS = [
  { id: "push", label: "Mobile push" },
  { id: "otp", label: "One-time code" }
];
const DEMO_OTP = "123123";

// Studio diagram (rule 17, partly met: the flow is lab-local, see diagram-data.js): the nodes and edges come from the diagram-studio/1
// data, looked up by name, never hand-built here.
const studio = getDiagram("cedar-in-privilege-flow");

// The shared outline + stripe look (standalone-ui.css .dg-node); colour by studio group.
const GROUP_CLASS = { agent: "dg-amber", gw: "dg-dark", tools: "dg-green", human: "dg-blue", refusal: "dg-red" };

// Which side of a box an arrow leaves from and arrives at: a layout hint for this data's compact grid (rows flow right, then down).
const SIDES = {
  agent: [Position.Left, Position.Right],
  door: [Position.Left, Position.Right],
  cedar: [Position.Left, Position.Bottom],
  tool: [Position.Top, Position.Bottom],
  human: [Position.Top, Position.Left],
  refused: [Position.Top, Position.Bottom]
};

// The arrows Simulate colours, found by the boxes they join (not by their position in the data's list).
const EDGE_CALL = edgeIndex(studio, "agent", "door");
const EDGE_SIGNIN = edgeIndex(studio, "door", "cedar");
const EDGE_VERDICT = {
  allowed: edgeIndex(studio, "cedar", "tool"),
  held: edgeIndex(studio, "cedar", "human"),
  refused: edgeIndex(studio, "cedar", "refused")
};
const EDGE_APPROVAL = edgeIndex(studio, "human", "cedar");
// How an arrow is coloured: ok, held for a human (a warning, not a refusal) and refused.
const TONE = { ok: "var(--status-ok)", held: "var(--status-warn)", refused: "var(--accent)" };
const VERDICT_TONE = { allowed: "ok", held: "held", refused: "refused", approved: "ok", rejected: "refused" };

function studioNodes() {
  return studio.nodes.map((n) => {
    const [targetPosition, sourcePosition] = SIDES[n.id] || [Position.Top, Position.Bottom];
    return {
      id: n.id,
      position: { x: n.x ?? 0, y: n.y ?? 0 },
      targetPosition,
      sourcePosition,
      className: `dg-node ${GROUP_CLASS[n.group] || "dg-grey"}`,
      data: {
        label: (
          <>
            <strong>{n.label}</strong>
            {(n.sub || []).map((t) => <span key={t}>{t}</span>)}
          </>
        )
      },
      style: { width: 220 }
    };
  });
}

function studioEdges() {
  return studio.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, label: e.label, animated: true }));
}

const summary = (r) => `Done: ${r.calls.map((c) => (c.kind === "approval" ? (c.ok ? "APPROVAL RECORDED" : "STEP-UP FAILED — NO APPROVAL") : `${c.tool} ${c.verdict.toUpperCase()}`)).join(", ")}.`;

// The mock PingID step-up panel: factor picker (push or OTP), shown before a step-up-gated run starts.
function StepUpPanel({ scenario, onStart, onCancel }) {
  const [factor, setFactor] = useState("push");
  const [otp, setOtp] = useState("");
  const isOtp = factor === "otp";
  return (
    <section className="card" data-testid="stepup-panel" aria-labelledby="stepup-h">
      <h2 id="stepup-h">Approver step-up required (mock PingID)</h2>
      <p className="hint">
        This scenario's approval requires the approver's own step-up — the same gate the real tenant showed on 2026-11-18
        (Multi_Factor policy, PINGID_AUTHENTICATION action): password, then a push on the phone, then the sign-in completes.
        Here it is mock: pick the factor, then run.
      </p>
      <div className="flow-controls" role="radiogroup" aria-label="Step-up factor">
        {FACTORS.map((f) => (
          <label key={f.id} className="hint">
            <input type="radio" name="stepup-factor" value={f.id} checked={factor === f.id}
              onChange={() => setFactor(f.id)} data-testid={`stepup-factor-${f.id}`} /> {f.label}
          </label>
        ))}
      </div>
      {isOtp && (
        <div className="flow-controls">
          <label htmlFor="stepup-otp" className="hint">One-time code (demo OTP: <code>{DEMO_OTP}</code>)</label>
          <input id="stepup-otp" type="text" inputMode="numeric" maxLength={6} value={otp}
            onChange={(e) => setOtp(e.target.value)} data-testid="stepup-otp" />
        </div>
      )}
      <div className="flow-controls">
        <button type="button" className="primary" data-testid="stepup-run"
          onClick={() => onStart(isOtp ? { factor, otp } : { factor })}>
          Run with {isOtp ? "the code" : "the push"}
        </button>
        <button type="button" onClick={onCancel}>Back to scenarios</button>
      </div>
      <p className="hint">The step-up is single-use per run: a failed factor never records the approval, and the hold stands.</p>
    </section>
  );
}

export default function FlowSim({ activeScenario, speed, resetKey }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(studioNodes());
  const [edges, setEdges] = useState(() => studioEdges());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // A step-up-gated scenario collects the approver's factor choice before it runs (mock PingID panel).
  const [pendingStepUp, setPendingStepUp] = useState(null); // the scenario awaiting the panel's answer
  const resultRef = useRef(null);
  const latest = useRef(0);

  // Only the walk is cleared (arrow colours, result, error): where the viewer put the boxes stays until Reset.
  const clearWalk = () => {
    setEdges(studioEdges());
    setResult(null);
    setError(null);
  };

  // Reset (header button and "Reset diagram"): restores box positions too.
  const reset = () => {
    latest.current += 1;
    setNodes(studioNodes());
    clearWalk();
    setRunning(false);
    window.dispatchEvent(new CustomEvent("cip:reset"));
  };

  useEffect(() => {
    if (!activeScenario) { setPendingStepUp(null); return; }
    if (activeScenario.stepUp) { setPendingStepUp(activeScenario); setResult(null); setError(null); }
    else { setPendingStepUp(null); run(activeScenario, null); }
  }, [activeScenario]);

  useEffect(() => {
    if (resetKey) reset();
  }, [resetKey]);

  const colorEdge = (index, tone) => {
    const color = TONE[tone === true ? "ok" : tone === false ? "refused" : tone];
    setEdges((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, animated: false, style: { stroke: color, strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color } }
          : e
      )
    );
  };

  const run = async (scenario, stepUp) => {
    const mine = ++latest.current;
    const stale = () => mine !== latest.current;
    setRunning(true);
    setPendingStepUp(null);
    clearWalk();
    // Story host hook: the page announces runs (storyWiring.js listens). ok is false only when the request itself failed;
    // a policy refusal is a completed run (the refusal IS the result).
    window.dispatchEvent(new CustomEvent("cip:run-start"));
    const finishRun = (ok) => window.dispatchEvent(new CustomEvent("cip:run-end", { detail: { ok } }));
    // One pause of the walk; false when a Reset or a newer run took over meanwhile (nothing more is drawn then).
    const wait = async () => {
      await new Promise((r) => setTimeout(r, 250 / (speed || 1)));
      return !stale();
    };
    try {
      if (!(await wait())) { finishRun(true); return; }
      const res = await postJson("/api/run", { scenario: scenario.id, stepUp: stepUp || undefined });
      if (stale()) { finishRun(true); return; }
      if (res.status !== 200 || !res.body || !res.body.calls) {
        setError(`The run failed: ${failureText(res.status, res.body)}`);
        finishRun(false);
        return;
      }
      const body = res.body;
      // Walk the diagram in step with what the mock door computed, call by call (a human approval is one step of its own).
      for (const c of body.calls) {
        if (!(await wait())) return;
        if (c.kind === "approval") {
          colorEdge(EDGE_APPROVAL, c.ok ? "ok" : "refused");
          continue;
        }
        colorEdge(EDGE_CALL, Boolean(body.token) ? "ok" : "refused");
        const signin = c.hops[0];
        if (!(await wait())) return;
        colorEdge(EDGE_SIGNIN, signin && signin.ok ? "ok" : "refused");
        if (signin && signin.ok) {
          if (!(await wait())) return;
          colorEdge(EDGE_VERDICT[c.verdict], VERDICT_TONE[c.verdict]);
        }
      }
      setResult(body);
      finishRun(true);
    } finally {
      // A failed or interrupted run never leaves Simulate disabled.
      if (!stale()) setRunning(false);
    }
  };

  useEffect(() => {
    if (result && resultRef.current && resultRef.current.scrollIntoView) resultRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [result]);

  const exchanges = result && result.calls
    ? result.calls.filter((c) => c.trace).map((c, i) => ({ step: i + 1, title: `Agent calls the door: tools/call ${c.tool} (${c.action})`, status: c.trace.response ? c.trace.response.status : null, trace: c.trace }))
    : [];

  return (
    <section className="card" data-testid="flow-sim" id="flow">
      <h2>{studio.title}</h2>
      <p className="hint">{studio.lede}</p>
      <div className="flow-controls">
        <button type="button" className="primary" disabled={running || !activeScenario || (activeScenario && activeScenario.stepUp)} onClick={() => activeScenario && run(activeScenario)}>
          Simulate
        </button>
        <button type="button" onClick={reset}>
          Reset diagram
        </button>
        <span className="hint">{activeScenario && activeScenario.stepUp ? "This scenario runs from the approver step-up panel below." : "Drag the boxes; Simulate keeps them where you put them. Speed is in the header; Reset restores the box positions."}</span>
      </div>
      <p className="hint run-status" role="status" data-testid="run-status">{running ? "Running the walk…" : result ? summary(result) : ""}</p>
      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodesDraggable
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.12, minZoom: 0.2 }}
          minZoom={0.2}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {pendingStepUp && !running && (
        <StepUpPanel scenario={pendingStepUp} onStart={(stepUp) => run(pendingStepUp, stepUp)} onCancel={() => setPendingStepUp(null)} />
      )}
      {error && (
        <div className="error-pane" role="alert" data-testid="run-error">
          <span>{error}</span>
          <button type="button" onClick={() => activeScenario && run(activeScenario)} disabled={!activeScenario}>Retry</button>
        </div>
      )}
      <div ref={resultRef}>
        <RunResult result={result} />
      </div>
      <LabTrace exchanges={exchanges} />
    </section>
  );
}
