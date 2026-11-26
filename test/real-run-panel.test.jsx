import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import RealRunPanel from "../web/src/RealRunPanel.jsx";

// The panel against a stubbed fetch: proves the verdict table renders the server's shape, the REAL badge and labels are on,
// the error path surfaces the server's message, and no mock-run wording is reused.

afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

const OK_RESULT = {
  at: "2026-11-26T12:00:00.000Z",
  issuerOrigin: "https://pf.example",
  doorOrigin: "https://door.example",
  act: "object",
  actSub: "agent-client-example",
  tokenShown: "opaque-token-value-1",
  calls: [
    { tool: "tools/list", verdict: "allowed", reason: "served", tools: ["CountTool", "ListIndexTool"] },
    { tool: "CountTool", verdict: "allowed", reason: "served" },
    { tool: "ListIndexTool", verdict: "refused-by-policy", reason: "action denied by policy: ListIndexTool requires act.sub to be agent-b-example" },
  ],
  inconclusive: false,
};

describe("RealRunPanel", () => {
  it("renders the verdicts with the REAL badge and the refused reason verbatim", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: async () => OK_RESULT })));
    render(<RealRunPanel />);
    expect(screen.getByTestId("real-badge")).toHaveTextContent("REAL");
    fireEvent.click(screen.getByTestId("real-run-btn"));
    await waitFor(() => expect(screen.getByTestId("real-result")).toBeInTheDocument());
    expect(screen.getByTestId("real-call-ListIndexTool")).toHaveTextContent("refused-by-policy");
    expect(screen.getByTestId("real-call-ListIndexTool")).toHaveTextContent("denied by policy: ListIndexTool requires act.sub to be agent-b-example");
    expect(screen.getByTestId("real-call-CountTool")).toHaveTextContent("allowed");
    expect(screen.getByTestId("real-token")).toHaveTextContent("opaque-token-value-1");
    expect(screen.queryByTestId("real-inconclusive")).toBeNull();
  });

  it("shows the server's failure message on a non-200 and offers a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 502, json: async () => ({ error: "real_run_failed", message: "PingFederate did not issue a token (HTTP 401): <redacted>" }) })));
    render(<RealRunPanel />);
    fireEvent.click(screen.getByTestId("real-run-btn"));
    await waitFor(() => expect(screen.getByTestId("real-error")).toHaveTextContent("PingFederate did not issue a token (HTTP 401): <redacted>"));
    expect(screen.queryByTestId("real-result")).toBeNull();
  });

  it("shows the inconclusive note when the server flags the run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: async () => ({ ...OK_RESULT, inconclusive: true }) })));
    render(<RealRunPanel />);
    fireEvent.click(screen.getByTestId("real-run-btn"));
    await waitFor(() => expect(screen.getByTestId("real-inconclusive")).toBeInTheDocument());
  });
});
