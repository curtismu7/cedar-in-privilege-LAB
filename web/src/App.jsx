import React, { useEffect, useRef, useState } from "react";
import TopMenu from "./top-menu/TopMenu.jsx";
import VerifyMark from "./components/VerifyMark.jsx";
import ShelfLink from "./components/ShelfLink.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import { HELP_SECTIONS } from "./helpContent.js";
import { TALK_TRACK } from "./talkTrack.js";
import "./top-menu/top-menu.css";
import SimulationBanner from "./Banner.jsx";
import FlowSim from "./FlowSim.jsx";
import ScenarioPicker from "./ScenarioPicker.jsx";
import Evidence from "./Evidence.jsx";
import { SetupGuide, IsIsNot } from "./Guide.jsx";
import { useApi, postJson, workspaceHeaders } from "./api.js";

// The version the header shows: package.json's, fixed at build time (vite.config.js).
const LAB_VERSION = typeof __LAB_VERSION__ === "string" ? __LAB_VERSION__ : null;

// Presenter mode (rule 3): shows the talk-track line for the current scenario while presenting.
function presenterSay(active) {
  return active ? active.say : "Pick a scenario and press Simulate. Start with case 1: a call that is held for a human.";
}

export default function App() {
  const [reloadKey, setReloadKey] = useState(0);
  // The story setting (rule 10): null asks for the customer.config default, then the page follows what the server answered.
  const [pack, setPack] = useState(null);
  const catalog = useApi(pack ? `/api/catalog?pack=${encodeURIComponent(pack)}` : "/api/catalog", [reloadKey, pack]);
  const info = useApi("/api/info", [reloadKey]);
  const [source, setSource] = useState("mock");
  const [activeScenario, setActiveScenario] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("theme") || "auto"; } catch { return "auto"; }
  });
  const [presenter, setPresenter] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  // The section the nav marks as current: follows the link the viewer picked, and the address when it changes.
  const SECTIONS = ["flow", "setup", "is", "evidence"];
  const fromHash = () => (typeof location !== "undefined" && SECTIONS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null);
  const [section, setSection] = useState(() => fromHash() || "flow");
  const modeBox = useRef(null);

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* none */ }
  }, [theme]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && presenter) setPresenter(false);
      if (e.key.toLowerCase() === "p" && e.altKey) setPresenter((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenter]);

  useEffect(() => {
    const onHash = () => setSection((s) => fromHash() || s);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (info.data) setSource(info.data.source);
  }, [info.data]);

  const realOff = info.data ? info.data.realAvailable === false : false;
  // The shared TopMenu (byte-pinned) draws the Mode select without a way to describe it, so the visible reason is linked to it here.
  useEffect(() => {
    const select = modeBox.current && modeBox.current.querySelector('[data-testid="mode-select"]');
    if (!select) return undefined;
    if (realOff) select.setAttribute("aria-describedby", "real-reason");
    else select.removeAttribute("aria-describedby");
    return () => select.removeAttribute("aria-describedby");
  }, [realOff]);

  // Rule 19: the toggle posts the mode, then reloads all data. Real answers 409 here (owner-only, see the reason in the toggle).
  const switchMode = async (target) => {
    const r = await postJson("/api/mode", { source: target });
    if (r.status === 200) {
      setSource(r.body.source);
      setReloadKey((k) => k + 1);
    }
  };

  const reset = async () => {
    await postJson("/api/reset", {});
    setActiveScenario(null);
    setResetKey((k) => k + 1);
  };

  const data = catalog.data;
  return (
    <div className="app">
      <header className="shell-bar">
        <div className="shell-brand">
          <span className="brand-mark" aria-hidden="true">◆</span>
          Cedar in Privilege
        </div>
        <nav className="shell-nav" aria-label="Sections">
          <a href="#flow" aria-current={section === "flow" ? "page" : undefined} onClick={() => setSection("flow")}>Tour</a>
          <a href="#setup" aria-current={section === "setup" ? "page" : undefined} onClick={() => setSection("setup")}>Set up</a>
          <a href="#is" aria-current={section === "is" ? "page" : undefined} onClick={() => setSection("is")}>Is / Is not</a>
          <a href="#evidence" aria-current={section === "evidence" ? "page" : undefined} onClick={() => setSection("evidence")}>Measured</a>
        </nav>
        <div className="shell-right" ref={modeBox}>
          <TopMenu
            mode={{ value: source === "real" ? "real" : "mock", onChange: (m) => switchMode(m === "real" ? "real" : "mock"), realAvailable: info.data ? info.data.realAvailable !== false : null, realHint: info.data?.realReason || undefined }}
            theme={{ value: theme, onChange: setTheme }}
            present={{ active: presenter, onToggle: () => setPresenter((v) => !v), label: "Presenter (Alt+P)" }}
            talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
            help={{ onClick: () => setHelpOpen(true), title: "What this lab is, and what is simulated" }}
            version={LAB_VERSION}
            onReset={reset}
            extra={<>
              <label className="speed-control" htmlFor="speed">Speed
                <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              </label>
              {realOff && (
                <span id="real-reason" className="real-reason" data-testid="real-reason">
                  Real is not available in this lab. The one real result is the Measured card; to run it yourself see <code>npm run real</code> in cedar-act-sub-LAB.
                </span>
              )}
            </>}
          >
            <ShelfLink headers={workspaceHeaders()} />
            <VerifyMark id="cedar-in-privilege-lab" headers={workspaceHeaders} />
          </TopMenu>
        </div>
      </header>
      <div className="accent-rule" aria-hidden="true" />
      <main>
        <SimulationBanner source={source} />
        {(catalog.error || info.error) && (
          <div className="error-pane" role="alert" data-testid="load-error">
            <span>The page could not load its data: {catalog.error || info.error}.</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </div>
        )}
        <section className="card intro" data-testid="intro">
          <h1>How Cedar AI policies work in PingOne Privilege</h1>
          <p>Cedar is the policy language Privilege uses for its AI policies. A guided tour of three cases: a call held for a human, a token-scope gate, and an agent act.sub gate. Each is simulated here in a mock door; only the act.sub case has a result measured on a real tenant. Below the tour: how to set Cedar up in the console, and what Cedar is and is not.</p>
          {data && <p className="hint">{data.mockNote}</p>}
        </section>
        {presenter && (
          <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track">
            {presenterSay(activeScenario)}
          </aside>
        )}
        <ScenarioPicker cases={(data && data.cases) || []} scenarios={(data && data.scenarios) || []} active={activeScenario} onSelect={setActiveScenario} stories={data && data.stories} packs={data && data.packs} pack={data && data.pack} onPack={setPack} />
        <FlowSim activeScenario={activeScenario} speed={speed} resetKey={resetKey} />
        <SetupGuide guide={data && data.guide} />
        <IsIsNot panel={data && data.isIsNot} />
        <Evidence evidence={data && data.evidence} />
      </main>
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP_SECTIONS} />
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={TALK_TRACK} />
      <footer className="app-footer">
        Demo tier · runs are simulated · mock tokens labelled · the measured card (act.sub only) is static evidence from 2026-11-16
      </footer>
    </div>
  );
}
