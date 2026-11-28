import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Json from "./components/JsonPane.jsx";
import LabTrace from "./LabTrace.jsx";
import { PolicyList, CopyButton } from "./RunResult.jsx";
import { FACTORS, DEMO_OTP } from "./FlowSim.jsx";
import { postJson, failureText } from "./api.js";

const MAX_PROMPT = 280;
const VERDICT_LABEL = { held: "HELD", refused: "REFUSED", allowed: "ALLOWED" };

// One line of the conversation. Every string here is text from the server or the viewer and is only ever rendered as text.
function Turn({ turn }) {
  if (turn.role === "user") {
    return (
      <li className="turn turn-user" data-testid="turn-user">
        <span className="turn-who">You</span>
        <p>{turn.text}</p>
      </li>
    );
  }
  if (turn.role === "tool") {
    return (
      <li className={`turn turn-tool call ${turn.verdict}`} data-testid={`turn-tool-${turn.index}`}>
        <span className="turn-who">Door</span>
        <p>
          <strong>{turn.tool}</strong> <span className="hint">{turn.action}</span>{" "}
          <span className={`chip verdict-${turn.verdict}`} data-testid={`turn-verdict-${turn.index}`}>{VERDICT_LABEL[turn.verdict] || String(turn.verdict).toUpperCase()}</span>{" "}
          <span className="hint">HTTP {turn.http}{turn.verdict === "held" ? " (simulated)" : ""}</span>
        </p>
        <p className="run-reason">{turn.text}</p>
      </li>
    );
  }
  if (turn.role === "event") {
    return (
      <li className={`turn turn-event call ${turn.ok ? "approved" : "refused"}`} data-testid="turn-approval">
        <span className="turn-who">Person</span>
        <p>{turn.text}</p>
      </li>
    );
  }
  return (
    <li className={`turn turn-agent ${turn.kind}`} data-testid={`turn-agent-${turn.kind}`}>
      <span className="turn-who">Agent</span>
      <p>{turn.text}</p>
    </li>
  );
}

// Step "Ask the agent": the viewer types a prompt, a scripted agent (no model) decides which tools to call, the mock door answers, and the
// page shows the conversation, the Cedar on the door and every API call with its reply. The scenario picked above supplies the door setup.
export default function AskAgent({ scenario, resetKey }) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [factor, setFactor] = useState("push");
  const [otp, setOtp] = useState("");
  const latest = useRef(0);
  const lastBody = useRef(null); // the request that is on screen or failed, so Retry repeats exactly it (an Approve stays an Approve)
  const scenarioId = scenario ? scenario.id : null;

  // A new door setup starts a new conversation with that setup's suggested prompt; Reset clears it.
  useEffect(() => {
    latest.current += 1;
    lastBody.current = null;
    setFactor("push");
    setOtp("");
    setAnswer(null);
    setError(null);
    setBusy(false);
    setPrompt(scenario && scenario.prompt ? scenario.prompt : "");
  }, [scenarioId, resetKey]);

  const post = async (body) => {
    if (!scenario || busy) return;
    const mine = ++latest.current;
    setBusy(true);
    setError(null);
    lastBody.current = body;
    // Story host hook (storyWiring.js listens), as FlowSim does: ok is false only when the request itself failed; a hold or a refusal is a completed run.
    window.dispatchEvent(new CustomEvent("cip:run-start"));
    const res = await postJson("/api/agent/ask", body);
    if (mine !== latest.current) { window.dispatchEvent(new CustomEvent("cip:run-end", { detail: { ok: true } })); return; }
    setBusy(false);
    if (res.status !== 200 || !res.body || !res.body.transcript) {
      setError(`The agent could not run: ${failureText(res.status, res.body)}`);
      window.dispatchEvent(new CustomEvent("cip:run-end", { detail: { ok: false } }));
      return;
    }
    flushSync(() => setAnswer(res.body));   // the answer is on the page before the Story is told the run ended (a step may point at it)
    window.dispatchEvent(new CustomEvent("cip:run-end", { detail: { ok: true } }));
  };

  // An approval is for the prompt the shown answer was for, never for text edited since: it sends the answered prompt.
  const send = (approved) => {
    if (!approved) return post({ prompt, scenario: scenario.id });
    const body = { prompt: answer && answer.run && answer.run.prompt ? answer.run.prompt : prompt, scenario: scenario.id, approved: true };
    if (scenario.stepUp) body.stepUp = factor === "otp" ? { factor, otp } : { factor };
    return post(body);
  };

  const text = prompt.trim();
  const canSend = Boolean(scenario) && text.length > 0 && text.length <= MAX_PROMPT && !busy;
  const run = answer && answer.run;
  const approver = run && run.calls.find((c) => c.approver);

  return (
    <div data-testid="ask-agent">
      <p>
        Type what you would ask an AI agent. The agent here is <strong>scripted</strong> (no model, no network): it reads your words, picks tools
        (<code>count</code>, <code>list</code>, <code>search</code>) and calls the mock door. The door setup decides the rest (its policies, the token
        and whether the call is unattended), not the prompt: try asking it to ignore them.
      </p>
      {!scenario && <p className="hint" data-testid="ask-pick-first">Pick a scenario in step 2 first: it sets which policies the door holds. It also fills in a suggested prompt.</p>}
      {scenario && (
        <p className="hint" data-testid="ask-setup">
          Door setup: <strong>{scenario.title}</strong> · {scenario.policyCount} polic{scenario.policyCount === 1 ? "y" : "ies"} on the door{scenario.policyCount ? ` (${scenario.policyState})` : ""}.
        </p>
      )}
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); if (canSend) send(false); }}>
        <label htmlFor="ask-prompt" className="hint">Your prompt <span aria-hidden="true">({text.length}/{MAX_PROMPT})</span></label>
        <textarea
          id="ask-prompt"
          data-testid="ask-prompt"
          rows={3}
          maxLength={MAX_PROMPT}
          value={prompt}
          disabled={!scenario}
          placeholder="Search the index for open cases."
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flow-controls">
          <button type="submit" className="primary" data-testid="ask-send" disabled={!canSend}>{busy ? "Asking…" : "Send to the agent"}</button>
          {scenario && scenario.prompt && prompt !== scenario.prompt && (
            <button type="button" data-testid="ask-suggest" onClick={() => setPrompt(scenario.prompt)}>Use the suggested prompt</button>
          )}
        </div>
      </form>
      {error && (
        <div className="error-pane" role="alert" data-testid="ask-error">
          <span>{error}</span>
          <button type="button" onClick={() => lastBody.current && post(lastBody.current)} disabled={busy || !lastBody.current}>Retry</button>
        </div>
      )}
      {answer && (
        <div className="ask-answer" data-testid="ask-answer">
          <h3>The conversation <span className="chip basis-unmeasured">simulated</span></h3>
          <ol className="chat" data-testid="chat">
            {answer.transcript.map((t, i) => <Turn key={i} turn={t} />)}
          </ol>
          {answer.awaitingApproval && (
            <div className="ask-approve" data-testid="ask-approve">
              <p className="hint">
                The call is waiting for a person. In a real tenant the approver decides in the console or on a phone; here you play that person
                (simulated){approver ? `, ${approver.approver}` : ""}.
              </p>
              {answer.stepUp && (
                <div className="flow-controls" role="radiogroup" aria-label="Approver step-up factor">
                  {FACTORS.map((f) => (
                    <label key={f.id} className="hint">
                      <input type="radio" name="ask-factor" value={f.id} checked={factor === f.id} onChange={() => setFactor(f.id)} data-testid={`ask-factor-${f.id}`} /> {f.label}
                    </label>
                  ))}
                  {factor === "otp" && (
                    <label className="hint" htmlFor="ask-otp">Code (demo OTP <code>{DEMO_OTP}</code>){" "}
                      <input id="ask-otp" type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} data-testid="ask-otp" />
                    </label>
                  )}
                </div>
              )}
              <button type="button" className="primary" data-testid="ask-approve-btn" disabled={busy} onClick={() => send(true)}>
                Approve{answer.stepUp ? " after the step-up" : ""} (simulated), then the agent retries
              </button>
            </div>
          )}
          <h3>The policies on the door</h3>
          <PolicyList policies={run.policies} />
          <h3 data-testid="ask-calls">API calls and responses</h3>
          {answer.exchanges.length === 0 ? (
            <p className="hint" data-testid="ask-no-calls">The agent made no API call: no tool matched the prompt, so there was nothing to send.</p>
          ) : (
            <>
              <p className="hint">In order: the token request to the mock PingFederate, then each <code>tools/call</code> the agent sent to the door and what came back. Each item shows the request, the reply and the two checks (sign-in, AI policy).</p>
              <LabTrace exchanges={answer.exchanges} />
            </>
          )}
          {run.token && answer.exchanges.length > 0 && (
            <details>
              <summary>Mock token and its claims</summary>
              <p className="hint">
                <span className="chip basis-unmeasured">mock-issued</span> Issued by this lab's in-process PingFederate stand-in (HS256 fixture key); it signs nothing real.{" "}
                <CopyButton text={run.token.token} />
              </p>
              <Json value={run.token.token} label="Mock token" testId="ask-mock-token" />
              <Json value={run.token.claims} label="Token claims (mock)" testId="ask-token-claims" hot={["act", "sub", "scope", "mock"]} />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
