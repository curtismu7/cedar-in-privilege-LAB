import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import App from "../web/src/App.jsx";
import { parseTalkTrack, TALK_TRACK } from "../web/src/talkTrack.js";
import { HELP_SECTIONS } from "../web/src/helpContent.js";
import { SCENARIOS, CASES, EVIDENCE, MOCK_NOTE } from "../server/src/scenarios.js";
import { GUIDE, IS_IS_NOT } from "../server/src/guide.js";
import { packList, storiesFor } from "../server/src/stories.js";

// The header's shared Help, version, Shelf and Talk track controls (finding BD-8). The dialogs are the family's vendored FloatingDialog
// services; the lab only supplies their content.
beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMMatrixReadOnly = class { constructor() {} };
  if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
  if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const pkgVersion = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version;
const talkMd = readFileSync(join(process.cwd(), "docs", "talk-track.md"), "utf8");

const catalog = () => ({
  pack: "banking", packs: packList(), org: null, stories: storiesFor("banking", null),
  door: "door-example", mockNote: MOCK_NOTE, cases: CASES, guide: GUIDE, isIsNot: IS_IS_NOT, evidence: EVIDENCE,
  scenarios: SCENARIOS.map(({ policies, policyState, calls, ...s }) => ({ ...s, policyState: policyState || "Active", policyCount: policies.length, callCount: calls.length }))
});

function stubFetch(shelf) {
  const res = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  global.fetch = (path) => {
    if (path === "/api/shelf") return shelf === null ? Promise.reject(new Error("no shelf")) : res(shelf);
    if (path === "/api/catalog") return res(catalog());
    if (path === "/api/info") return res({ source: "mock", realAvailable: false, realReason: "Real is owner-only" });
    return res({}, 404);
  };
}
const errors = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("Help", () => {
  it("is a button in the shared top menu; it opens the Help dialog with the lab's own sections, and Close and Escape both close it", async () => {
    const err = errors();
    stubFetch({ shelfUrl: null });
    render(<App />);
    const menu = within(await screen.findByTestId("top-menu"));
    const help = menu.getByTestId("help-link");
    expect(help.tagName).toBe("BUTTON");
    expect(help).toHaveTextContent("Help");
    expect(screen.queryByTestId("help-dialog")).toBeNull();
    fireEvent.click(help);
    const dialog = await screen.findByTestId("help-dialog");
    for (const s of HELP_SECTIONS) expect(within(dialog).getByRole("heading", { name: s.heading })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/not a Cedar engine/);
    expect(dialog).toHaveTextContent(/UNVERIFIED/);
    fireEvent.click(within(dialog).getAllByRole("button", { name: /close/i })[0]);
    await waitFor(() => expect(screen.queryByTestId("help-dialog")).toBeNull());
    fireEvent.click(help);
    await screen.findByTestId("help-dialog");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("help-dialog")).toBeNull());
    expect(err).not.toHaveBeenCalled();
  });

  it("is keyboard accessible: a real button that takes focus, a named dialog, and focus returns to it when the dialog closes", async () => {
    stubFetch({ shelfUrl: null });
    render(<App />);
    const help = within(await screen.findByTestId("top-menu")).getByTestId("help-link");
    expect(help.tabIndex).toBeGreaterThanOrEqual(0);
    help.focus();
    expect(document.activeElement).toBe(help);
    fireEvent.click(help);
    const dialog = await screen.findByTestId("help-dialog");
    expect(dialog.getAttribute("role") || dialog.querySelector("[role=dialog]")?.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-label") || dialog.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe("Help");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("help-dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(help));
  });

  it("says what the lab is in the lab's honest words: simulated, one measured run, not a Cedar engine, nothing about a second agent", () => {
    const text = HELP_SECTIONS.map((s) => [s.heading, ...[].concat(s.body)].join(" ")).join(" ");
    expect(text).toMatch(/simulated/);
    expect(text).toMatch(/one real agent/);
    expect(text).toMatch(/Only the act\.sub case has a measured result/);
    expect(text).toMatch(/hold and scope cases are simulated/);
    expect(text).toMatch(/not a Cedar engine/);
    expect(text).toMatch(/No second agent was called/);
    expect(text).not.toMatch(/\bverified\b/i);
  });
});

describe("version", () => {
  it("shows the package version in the header", async () => {
    stubFetch({ shelfUrl: null });
    render(<App />);
    const v = within(await screen.findByTestId("top-menu")).getByTestId("version");
    expect(v).toHaveTextContent(`v${pkgVersion}`);
    expect(v.textContent).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

describe("Shelf link", () => {
  it("points at the shelf address /api/shelf answers with, in a new tab", async () => {
    stubFetch({ shelfUrl: "https://shelf.example" });
    render(<App />);
    const link = await within(await screen.findByTestId("top-menu")).findByRole("link", { name: "Shelf" });
    expect(link).toHaveAttribute("href", "https://shelf.example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("is not drawn, and nothing breaks, when no shelf is configured or none can be reached", async () => {
    for (const shelf of [{ shelfUrl: null }, null]) {
      const err = errors();
      stubFetch(shelf);
      const { unmount } = render(<App />);
      const menu = within(await screen.findByTestId("top-menu"));
      await waitFor(() => expect(screen.getByTestId("mode-modal")).toBeTruthy());
      await new Promise((r) => setTimeout(r, 30));
      expect(menu.queryByRole("link", { name: "Shelf" })).toBeNull();
      expect(menu.getByTestId("help-link")).toBeTruthy();
      expect(err).not.toHaveBeenCalled();
      unmount();
      vi.restoreAllMocks();
    }
  });
});

describe("Talk track", () => {
  it("the dialog is fed by docs/talk-track.md: every walk step and every question of the doc is in it, in the doc's order", () => {
    const walk = talkMd.split("\n").filter((l) => /^\d+\.\s+\*\*/.test(l)).length;
    const asked = talkMd.split("\n").filter((l) => /^-\s+\*\*/.test(l)).length;
    expect(walk).toBeGreaterThanOrEqual(8);
    expect(asked).toBeGreaterThanOrEqual(7);
    expect(TALK_TRACK).toHaveLength(1 + walk + asked);
    expect(TALK_TRACK).toEqual(parseTalkTrack(talkMd));
    expect(new Set(TALK_TRACK.map((t) => t.id)).size).toBe(TALK_TRACK.length);
    for (const t of TALK_TRACK) { expect(t.title.length).toBeGreaterThan(0); expect(t.say.length).toBeGreaterThan(0); expect(t.title + t.say).not.toMatch(/\*\*|`/); }
    expect(TALK_TRACK[1].title).toBe("Read the Mock modal");
  });

  it("the header button opens the shared talk-track dialog with the script, and a second press closes it", async () => {
    const err = errors();
    stubFetch({ shelfUrl: null });
    render(<App />);
    const toggle = within(await screen.findByTestId("top-menu")).getByTestId("talk-track-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("talk-track-dialog")).toBeNull();
    fireEvent.click(toggle);
    const dialog = await screen.findByTestId("talk-track-dialog");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByTestId("talk-track")).toBeTruthy();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(TALK_TRACK.length);
    expect(within(dialog).getByRole("heading", { name: "Read the Mock modal" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/the runs are simulated/);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByTestId("talk-track-dialog")).toBeNull());
    expect(err).not.toHaveBeenCalled();
  });

  it("Escape closes the talk track too", async () => {
    stubFetch({ shelfUrl: null });
    render(<App />);
    fireEvent.click(within(await screen.findByTestId("top-menu")).getByTestId("talk-track-toggle"));
    await screen.findByTestId("talk-track-dialog");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("talk-track-dialog")).toBeNull());
  });
});
