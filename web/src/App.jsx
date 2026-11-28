import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import TopMenu from "./top-menu/TopMenu.jsx";
import StoryToggle, { storyKey } from "./story/StoryToggle.jsx";
import VerifyMark from "./components/VerifyMark.jsx";
import ShelfLink from "./components/ShelfLink.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import { HELP_SECTIONS } from "./helpContent.js";
import { TALK_TRACK } from "./talkTrack.js";
import "./top-menu/top-menu.css";
import SimulationBanner from "./Banner.jsx";
import FlowSim from "./FlowSim.jsx";
import AskAgent from "./AskAgent.jsx";
import RealRunPanel from "./RealRunPanel.jsx";
import ScenarioPicker from "./ScenarioPicker.jsx";
import Evidence from "./Evidence.jsx";
import { SetupGuide, IsIsNot } from "./Guide.jsx";
import { useApi, postJson, workspaceHeaders } from "./api.js";

// The version the header shows: package.json's, fixed at build time (vite.config.js).
const LAB_VERSION = typeof __LAB_VERSION__ === "string" ? __LAB_VERSION__ : null;

// Story mode (shared/story/README.md): the toggle is in the shell's extra slot; the walk-through itself is lazy-loaded, so Demo mode never pays for it.
const STORY_PREFIX = "cip";
// Cedar's own public pages (links only: this lab never calls them).
const CEDAR_SITE = "https://www.cedarpolicy.com/";
const CEDAR_REFERENCE = "https://docs.cedarpolicy.com/policies/syntax-policy.html";
const StoryRoot = lazy(() => import("./StoryRoot.jsx"));

// If the Story chunk cannot load (the lab was rebuilt, a stale file name, the network) the page must survive: Demo mode is never taken down by Story.
class StoryBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="story-bar" role="alert" data-testid="story-error">
        <span className="story-msg">Story could not load. Reload the page and try again.</span>
        <button type="button" onClick={this.props.onExit}>Exit</button>
      </div>
    );
  }
}

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
  // Story mode: on = Demo|Story toggle; toggleKey remounts the toggle so its state matches the view after an Exit.
  const [storyOn, setStoryOn] = useState(() => { try { return localStorage.getItem(storyKey(STORY_PREFIX)) === "story" || new URLSearchParams(window.location.search).has("story"); } catch { return false; } });
  const [toggleKey, setToggleKey] = useState(0);
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
    // Story mode opens a section from the host (storyWiring switchTab): the script's `tab` lands here as a cip:goto event.
    const onGoto = (e) => { if (e.detail && SECTIONS.includes(e.detail)) setSection(e.detail); };
    window.addEventListener("cip:goto", onGoto);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("cip:goto", onGoto); };
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

  const onView = (on) => {
    setStoryOn(on);
    try { localStorage.setItem(storyKey(STORY_PREFIX), on ? "story" : "demo"); } catch { /* storage blocked: the choice just does not persist */ }
  };
  // Exit in the Story bar: back to Demo, remembered, and ?story=1 dropped from the address so a reload stays in Demo.
  const leaveStory = () => {
    try { const u = new URL(window.location.href); if (u.searchParams.has("story")) { u.searchParams.delete("story"); window.history.replaceState(null, "", u); } } catch { /* no address to tidy */ }
    setToggleKey((k) => k + 1);
    onView(false);
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
          {[
            ["flow", "Tour"],
            ["setup", "Set up"],
            ["is", "Is / Is not"],
            ["evidence", "Measured"]
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>{label}</a>
          ))}
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
              <StoryToggle key={toggleKey} prefix={STORY_PREFIX} onChange={onView} />
              {realOff ? (
                <span id="real-reason" className="real-reason" data-testid="real-reason">
                  Real needs the owner's local .env: with one, Real runs the read-only probe from this page; without one, the Measured card stays the one real record.
                </span>
              ) : source === "real" ? (
                <span id="real-reason" className="real-reason" data-testid="real-on-hint">
                  REAL mode: the Real run panel below talks to your PingFederate and door (act.sub case). Hold and scope cases stay simulated.
                </span>
              ) : null}
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
        {/* Tabs, not a scroll-down page: every section is one pane; only the picked one is on the page (the others are display:none).
            #flow keeps the intro so the Tour tab stays the landing tab; the hash always names the section itself. */}
        <div className="tab-panes">
          <div className="tab-pane" data-testid={`pane-flow`} hidden={section !== "flow"}>
            <section className="card intro" data-testid="intro">
              <h1><span className="step-num" data-n="1" aria-hidden="true" />How Cedar AI policies work in PingOne Privilege</h1>
              <p>Cedar is an open-source policy language and specification (<a href={CEDAR_SITE} target="_blank" rel="noopener noreferrer" data-testid="cedar-link-site">cedarpolicy.com</a>, <a href={CEDAR_REFERENCE} target="_blank" rel="noopener noreferrer" data-testid="cedar-link-reference">policy language reference</a>), and the language Privilege uses for its AI policies. A guided tour of three cases: a call held for a human, a token-scope gate, and an agent act.sub gate. Pick a case, then type a prompt to an agent and watch what it sends to the door and what comes back. Each case is simulated here in a mock door; only the act.sub case has a result measured on a real tenant. The other tabs: how to set Cedar up in the console, and what Cedar is and is not.</p>
              {data && <p className="hint">{data.mockNote}</p>}
            </section>
            {presenter && (
              <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track">
                {presenterSay(activeScenario)}
              </aside>
            )}
            <section className="card tour-section" data-testid="tour-cases">
              <h2><span className="step-num" data-n="2" aria-hidden="true" />The tour: three cases</h2>
              <ScenarioPicker cases={(data && data.cases) || []} scenarios={(data && data.scenarios) || []} active={activeScenario} onSelect={setActiveScenario} stories={data && data.stories} packs={data && data.packs} pack={data && data.pack} onPack={setPack} plain />
            </section>
            <section className="card tour-section" data-testid="tour-ask">
              <h2><span className="step-num" data-n="3" aria-hidden="true" />Ask the agent: type a prompt, see the API calls</h2>
              <AskAgent scenario={activeScenario ? ((data && data.scenarios) || []).find((s) => s.id === activeScenario.id) || activeScenario : null} resetKey={resetKey} />
            </section>
            <section className="card tour-section" data-testid="tour-flow">
              <h2><span className="step-num" data-n="4" aria-hidden="true" />One call, one door, three kinds of Cedar answer</h2>
              <FlowSim activeScenario={activeScenario} speed={speed} resetKey={resetKey} headless />
            </section>
            {source === "real" && <RealRunPanel />}
          </div>
          <div className="tab-pane" data-testid={`pane-setup`} hidden={section !== "setup"}>
            <SetupGuide guide={data && data.guide} />
          </div>
          <div className="tab-pane" data-testid={`pane-is`} hidden={section !== "is"}>
            <IsIsNot panel={data && data.isIsNot} />
          </div>
          <div className="tab-pane" data-testid={`pane-evidence`} hidden={section !== "evidence"}>
            <Evidence evidence={data && data.evidence} />
          </div>
        </div>
      </main>
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP_SECTIONS} />
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={TALK_TRACK} />

      {storyOn ? (
        <StoryBoundary onExit={leaveStory}>
          <Suspense fallback={null}>
            <StoryRoot mode="mock" ready={Boolean(info.data)} onExit={leaveStory} prefix={STORY_PREFIX} />
          </Suspense>
        </StoryBoundary>
      ) : null}
      <footer className="app-footer">
        Demo tier · runs are simulated · mock tokens labelled · the measured card (act.sub only) is static evidence from 2026-11-16
      </footer>
    </div>
  );
}
