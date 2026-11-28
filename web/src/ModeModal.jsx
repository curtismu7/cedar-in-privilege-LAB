import React, { useEffect, useRef, useState } from "react";

// Real-or-mock modal (owner, 2026-11-28): replaces the long simulation banner. It says one thing, MOCK or REAL, on load and again when the mode
// changes. Dismissed once per mode per browser session. Never shown over Story (Story's own first page says it).
const seenKey = (mode) => `cip-mode-seen-${mode}`;
const wasSeen = (mode) => { try { return sessionStorage.getItem(seenKey(mode)) === "1"; } catch { return false; } };
const markSeen = (mode) => { try { sessionStorage.setItem(seenKey(mode), "1"); } catch { /* private window: it just shows again */ } };

const COPY = {
  mock: {
    word: "MOCK",
    line: "Everything on this page is simulated: a mock token and a mock door. The door is not a Cedar engine and decides nothing real.",
  },
  real: {
    word: "REAL",
    line: "The act.sub case runs against your PingFederate and door. The hold and scope cases stay simulated; the door is not a Cedar engine and decides nothing real for them.",
  },
};

export default function ModeModal({ source, suppress }) {
  const mode = source === "real" ? "real" : "mock";
  const [dismissed, setDismissed] = useState(() => wasSeen(mode));
  const button = useRef(null);
  useEffect(() => { setDismissed(wasSeen(mode)); }, [mode]);
  const open = !dismissed && !suppress;
  useEffect(() => { if (open && button.current) button.current.focus(); }, [open]);
  if (!open) return null;
  const close = () => { markSeen(mode); setDismissed(true); };
  const c = COPY[mode];
  return (
    <div className="mode-modal-backdrop" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <div className="mode-modal" role="dialog" aria-modal="true" aria-labelledby="mode-modal-word" data-testid="mode-modal" data-mode={mode}>
        <div className="mode-modal-word" id="mode-modal-word">{c.word}</div>
        <p>{c.line}</p>
        <button type="button" ref={button} onClick={close} data-testid="mode-modal-ok">Got it</button>
      </div>
    </div>
  );
}
