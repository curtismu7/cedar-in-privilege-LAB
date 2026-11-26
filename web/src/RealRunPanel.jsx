import React, { useState } from "react";
import { postJson } from "./api.js";

// The Real run panel: shown when Mode is Real (owner-gated — the server only allows it with a valid local .env). The button runs the same
// read-only probe `npm run real` runs (token, tools/list, two tool calls) and renders the verdicts inline, labelled REAL. Mock panels keep
// their own labels; nothing here reuses a mock run's data.
export default function RealRunPanel({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null);
    const r = await postJson("/api/real/run", {});
    setBusy(false);
    if (r.status === 200) { setResult(r.body); if (onDone) onDone(r.body); }
    else setError((r.body && (r.body.message || r.body.error)) || "the real call failed");
  };

  return (
    <section className="card real-run" data-testid="real-run" aria-label="Real run">
      <h2>
        Real run
        <span className="badge real" data-testid="real-badge">REAL</span>
      </h2>
      <p>
        Reads, on this page's behalf, what <code>npm run real</code> reads: one client-credentials token from your PingFederate, then tools/list,
        CountTool and ListIndexTool on your door — the act.sub case (case 3), the only one of this lab's cases with a real counterpart. Read-only:
        no policy is created or deleted. The hold and scope cases (1 and 2) stay simulated even in Real mode; the access token is shown (this is a
        learning lab) and the client secret never is.
      </p>
      <button type="button" data-testid="real-run-btn" onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run the real probe"}
      </button>
      {error && (
        <div className="real-error" role="alert" data-testid="real-error">
          The real call failed: {error}
        </div>
      )}
      {result && (
        <div className="real-result" data-testid="real-result">
          <p className="hint">
            Token from {result.issuerOrigin}, door {result.doorOrigin} · act is {result.act}
            {result.actSub ? `, act.sub = ${result.actSub}` : ""} · {new Date(result.at).toLocaleString()}
          </p>
          <table>
            <thead>
              <tr><th scope="col">Call</th><th scope="col">Verdict</th><th scope="col">Detail</th></tr>
            </thead>
            <tbody>
              {result.calls.map((c) => (
                <tr key={c.tool} data-testid={`real-call-${c.tool}`}>
                  <td>{c.tool}{c.tools ? ` (${c.tools.length} tools)` : ""}</td>
                  <td>
                    <span className={`verdict verdict-${c.verdict}`}>{c.verdict}</span>
                  </td>
                  <td>{c.reason || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.tokenShown && (
            <details className="real-token">
              <summary>The real access token (shown on purpose, learning lab)</summary>
              <code className="real-token-value" data-testid="real-token">{result.tokenShown}</code>
            </details>
          )}
          {result.inconclusive && (
            <p className="hint" data-testid="real-inconclusive">
              This run says nothing about the policy: at least one call was unreadable or rejected (or every call was refused at the grant
              layer, before any AI policy).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
