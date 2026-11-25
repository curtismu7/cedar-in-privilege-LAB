import React from "react";

const BASIS = {
  "matches-measured": { cls: "basis-measured", text: "outcome matches the real run (2026-11-16)" },
  simulated: { cls: "basis-unmeasured", text: "simulated, not measured" }
};

// Three cases, each a few scenarios. Every button runs one scenario against the mock door. A case says where its shape came from
// (measured, console text or UNVERIFIED) and where its real counterpart runs; the page never says a simulated case was measured.
export default function ScenarioPicker({ cases, scenarios, active, onSelect, stories, packs, pack, onPack }) {
  const button = (s) => (
    <button
      key={s.id}
      type="button"
      className="scenario-btn"
      data-testid={`scenario-${s.id}`}
      aria-pressed={Boolean(active && active.id === s.id)}
      onClick={() => onSelect(s)}
    >
      {s.label}
    </button>
  );
  const basis = active ? BASIS[active.matchesMeasured ? "matches-measured" : "simulated"] : null;
  return (
    <section className="card" data-testid="scenario-picker">
      <h2>The tour: three cases</h2>
      <p className="hint">Pick a scenario in a case, then press Simulate. Each case is simulated in this page; only case 3 has a result measured on a real tenant.</p>
      {packs && packs.length > 0 && (
        <label className="pack-control" htmlFor="pack">Story setting{" "}
          <select id="pack" data-testid="pack-select" value={pack || ""} onChange={(e) => onPack && onPack(e.target.value)}>
            {packs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="hint"> Only the framing story changes; the policies, ids and results do not.</span>
        </label>
      )}
      {(cases || []).map((c) => (
        <div key={c.id} className="case" data-testid={`case-${c.id}`}>
          <h3>
            {c.n}. {c.title}{" "}
            <span className={`chip ${c.basis === "simulated" ? "basis-unmeasured" : c.basis === "measured once" ? "basis-measured" : "basis-partial"}`} data-testid={`case-basis-${c.id}`}>
              {c.basis === "simulated" ? "simulated here" : c.basis === "measured once" ? "measured once, 2026-11-16" : "simulated; step-up factor measured 2026-11-18"}
            </span>
          </h3>
          <p>{c.summary}</p>
          {stories && stories[c.id] && <p className="story" data-testid={`story-${c.id}`}>{stories[c.id]}</p>}
          <p className="hint" data-testid={`case-source-${c.id}`}>{c.source}</p>
          <p className="hint" data-testid={`case-real-${c.id}`}>{c.real}</p>
          <div className="scenario-list" data-testid={`scenarios-${c.id}`}>{scenarios.filter((s) => s.case === c.id).map(button)}</div>
        </div>
      ))}
      {active && (
        <div className="scenario-about" data-testid="scenario-about">
          <p><strong>{active.title}</strong></p>
          <p>{active.what}</p>
          <p className="hint">
            <span className={`chip ${basis.cls}`}>{basis.text}</span>{" "}
            Policies on the door: {active.policyCount}{active.policyCount ? ` (${active.policyState})` : ""}.
            {active.expect && active.expect.length > 0 && <> Expected: {active.expect.join(", ")}.</>}
          </p>
        </div>
      )}
    </section>
  );
}
