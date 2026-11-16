import React from "react";
import { CopyButton } from "./RunResult.jsx";

// Static evidence from a real tenant. Nothing on this card is produced by a mock run, and the label says when it was measured.
export default function Evidence({ evidence }) {
  if (!evidence) return null;
  return (
    <>
    <section className="card evidence" data-testid="evidence" id="evidence">
      <h2>Measured result, act.sub case only <span className="chip basis-measured" data-testid="evidence-label">{evidence.label}</span></h2>
      <p>{evidence.setup}</p>
      <p className="hint">This card is static text, not a run of the mock above.</p>
      <h3>The Cedar the template generates (example ids)</h3>
      <pre className="cedar" data-testid="evidence-cedar">{evidence.cedar}</pre>
      <p className="hint">{evidence.cedarNote}</p>
      <h3>What the real door did</h3>
      <div className="table-wrap">
        <table data-testid="evidence-table">
          <thead><tr><th>Door state</th><th>CountTool</th><th>ListIndexTool</th></tr></thead>
          <tbody>
            {evidence.rows.map((r) => (
              <tr key={r.phase}><td>{r.phase}</td><td>{r.CountTool}</td><td>{r.ListIndexTool}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" data-testid="evidence-rows-note">{evidence.rowsNote}</p>
      <p>{evidence.timing}</p>
      <p>{evidence.wire}</p>
      <h3>Not measured</h3>
      <ul data-testid="not-measured">{evidence.notMeasured.map((t) => <li key={t}>{t}</li>)}</ul>
      <h3>Real is not in this lab: where to run it</h3>
      <p className="real-cmd">
        <code data-testid="real-command">{evidence.command}</code> <CopyButton text={evidence.command} />
      </p>
      <p className="hint">{evidence.commandNote}</p>
    </section>
    <section className="card unverified" data-testid="unverified" aria-labelledby="unverified-h">
      <h2 id="unverified-h">Claims from outside the measured run (UNVERIFIED)</h2>
      <p className="hint">None of these was measured on the real tenant on 2026-11-16 and none is re-run here. They are kept apart from the measured card on purpose.</p>
      <ul data-testid="also-true">{evidence.alsoTrue.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
    </>
  );
}
