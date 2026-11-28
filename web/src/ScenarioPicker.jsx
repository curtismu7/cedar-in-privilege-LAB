import React, { useEffect, useState } from "react";

const BASIS = {
  "matches-measured": { cls: "basis-measured", text: "outcome matches the real run (2026-11-16)" },
  simulated: { cls: "basis-unmeasured", text: "simulated, not measured" }
};

// The cases, each a few scenarios. Every button runs one scenario against the mock door. A case says where its shape came from
// (measured, console text or UNVERIFIED) and where its real counterpart runs; the page never says a simulated case was measured.
// ONE case is shown at a time, picked from a dropdown (nine stacked on one page was too much). The other cases stay in the page, hidden, so a
// scenario button anywhere can still be pressed by the Story or the film. The shown case follows the active scenario (pressing a scenario shows its
// case) and the Story's `cip:case` event (it shows the case a bubble points into).
export default function ScenarioPicker({ cases, scenarios, active, onSelect, stories, packs, pack, onPack, plain }) {
  const [picked, setPicked] = useState(null);
  const caseList = cases || [];
  const shown = picked && caseList.some((c) => c.id === picked) ? picked : (active && caseList.some((c) => c.id === active.case) ? active.case : (caseList[0] && caseList[0].id));
  useEffect(() => { if (active && active.case) setPicked(active.case); }, [active && active.id]);
  useEffect(() => {
    const onCase = (e) => { if (e.detail) setPicked(String(e.detail)); };
    window.addEventListener("cip:case", onCase);
    return () => window.removeEventListener("cip:case", onCase);
  }, []);
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
  // `plain`: the case list renders without its own card and heading (the Tour tab's numbered section owns them).
  const body = (
    <>
      {packs && packs.length > 0 && (
        <label className="pack-control" htmlFor="pack">Story setting{" "}
          <select id="pack" data-testid="pack-select" value={pack || ""} onChange={(e) => onPack && onPack(e.target.value)}>
            {packs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="hint"> Only the framing story changes; the policies, ids and results do not.</span>
        </label>
      )}
      {caseList.length > 0 && (
        <label className="case-control" htmlFor="case-select">Case{" "}
          <select id="case-select" data-testid="case-select" value={shown || ""} onChange={(e) => setPicked(e.target.value)}>
            {caseList.map((c) => <option key={c.id} value={c.id}>{c.n}. {c.title}</option>)}
          </select>
          <span className="hint"> {caseList.length} cases; pick one to see its scenarios.</span>
        </label>
      )}
      {caseList.map((c) => (
        <div key={c.id} className="case" data-testid={`case-${c.id}`} data-case={c.id} hidden={c.id !== shown}>
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
      {active && active.case === shown && (
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
    </>
  );
  if (plain) return body;
  return (
    <section className="card" data-testid="scenario-picker">
      <h2>The tour: the cases</h2>
      <p className="hint">Pick a case from the list, then a scenario in it, then press Simulate. Each case is simulated in this page; only case 3 has a result measured on a real tenant.</p>
      {body}
    </section>
  );
}
