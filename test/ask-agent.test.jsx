import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import AskAgent from "../web/src/AskAgent.jsx";
import { askAgent } from "../server/src/index.js";
import { SCENARIOS } from "../server/src/scenarios.js";
import { CAN_DO } from "../server/src/agent.js";

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMMatrixReadOnly = class { constructor() {} };
});
afterEach(() => cleanup());

// The catalog's view of a scenario (policies and calls stripped), as the page gets it.
const view = (id) => {
  const { policies, policyState, calls, ...s } = SCENARIOS.find((x) => x.id === id);
  return { ...s, policyState: policyState || "Active", policyCount: policies.length, callCount: calls.length };
};
const j = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// The page talks to the real server module: whatever the server answers is what the page renders.
function mockAsk() {
  const sent = [];
  global.fetch = (path, opts) => {
    if (path !== "/api/agent/ask") return j({}, 404);
    const body = JSON.parse(opts.body);
    sent.push(body);
    return j(askAgent({ prompt: body.prompt, scenario: SCENARIOS.find((s) => s.id === body.scenario), approved: body.approved === true, stepUp: body.stepUp || null }));
  };
  return sent;
}

describe("Ask the agent", () => {
  it("with no scenario picked, says to pick one and cannot send", () => {
    mockAsk();
    render(<AskAgent scenario={null} resetKey={0} />);
    expect(screen.getByTestId("ask-pick-first")).toBeTruthy();
    expect(screen.getByTestId("ask-send").disabled).toBe(true);
    expect(screen.getByTestId("ask-prompt").disabled).toBe(true);
  });

  it("a picked scenario prefills its suggested prompt; sending shows the conversation, the Cedar on the door and the API calls", async () => {
    const sent = mockAsk();
    render(<AskAgent scenario={view("actsub-2-gate")} resetKey={0} />);
    expect(screen.getByTestId("ask-prompt").value).toBe("Count the entries, then list the index.");
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-answer");
    expect(sent).toEqual([{ prompt: "Count the entries, then list the index.", scenario: "actsub-2-gate" }]);
    expect(screen.getByTestId("turn-user").textContent).toMatch(/Count the entries/);
    expect(screen.getByTestId("turn-verdict-0").textContent).toBe("ALLOWED");
    expect(screen.getByTestId("turn-verdict-1").textContent).toBe("REFUSED");
    expect(screen.getByTestId("turn-agent-reply").textContent).toMatch(/act\.sub to be agent-b-example/);
    expect(screen.getByTestId("policy-list")).toBeTruthy();
    // The API calls: the token request and the two tools/call exchanges, in the vendored trace panel.
    expect(screen.getByTestId("gateway-trace")).toBeTruthy();
    expect(screen.getByText(/asks the mock PingFederate for a token/)).toBeTruthy();
    expect(screen.getByText(/tools\/call CountTool/)).toBeTruthy();
    expect(screen.getByText(/tools\/call ListIndexTool/)).toBeTruthy();
  });

  it("a held call offers the approval; approving sends approved:true and the agent's retry is served", async () => {
    const sent = mockAsk();
    render(<AskAgent scenario={view("hold-2-approve")} resetKey={0} />);
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-approve");
    expect(screen.getByTestId("turn-verdict-0").textContent).toBe("HELD");
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await waitFor(() => expect(screen.queryByTestId("ask-approve")).toBeNull());
    expect(sent[1].approved).toBe(true);
    expect(screen.getByTestId("turn-approval").textContent).toMatch(/approved/);
    expect(screen.getByTestId("turn-agent-reply").textContent).toMatch(/answered/);
  });

  it("review finding 2: Approve applies to the prompt the answer was for, not to text edited since", async () => {
    const sent = mockAsk();
    render(<AskAgent scenario={view("hold-2-approve")} resetKey={0} />);
    const asked = view("hold-2-approve").prompt;
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-approve");
    fireEvent.change(screen.getByTestId("ask-prompt"), { target: { value: "count the entries" } });
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await waitFor(() => expect(sent.length).toBe(2));
    expect(sent[1].prompt).toBe(asked);
    expect(sent[1].approved).toBe(true);
    await waitFor(() => expect(screen.getByTestId("turn-user").textContent).toMatch(/search the index/i));
  });

  it("review finding 3: a wrong one-time code leaves the approve panel so the right code can be tried", async () => {
    const sent = mockAsk();
    render(<AskAgent scenario={view("stepup-1-approve")} resetKey={0} />);
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-approve");
    fireEvent.click(screen.getByTestId("ask-factor-otp"));
    fireEvent.change(screen.getByTestId("ask-otp"), { target: { value: "111111" } });
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await waitFor(() => expect(sent.length).toBe(2));
    await waitFor(() => expect(screen.getByTestId("turn-approval").textContent).toMatch(/./));
    expect(screen.getByTestId("ask-approve")).toBeTruthy();
    fireEvent.change(screen.getByTestId("ask-otp"), { target: { value: "123123" } });
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await waitFor(() => expect(screen.queryByTestId("ask-approve")).toBeNull());
    expect(sent[2].stepUp).toEqual({ factor: "otp", otp: "123123" });
    expect(screen.getByTestId("turn-agent-reply").textContent).toMatch(/answered/);
  });

  it("review finding 6: Retry after a failed Approve repeats the approval, not a plain run", async () => {
    const sent = [];
    let down = true;
    global.fetch = (path, opts) => {
      const body = JSON.parse(opts.body);
      sent.push(body);
      if (down && body.approved) return Promise.reject(new TypeError("Failed to fetch"));
      return j(askAgent({ prompt: body.prompt, scenario: SCENARIOS.find((s) => s.id === body.scenario), approved: body.approved === true, stepUp: body.stepUp || null }));
    };
    render(<AskAgent scenario={view("hold-2-approve")} resetKey={0} />);
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-approve");
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await screen.findByTestId("ask-error");
    down = false;
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.queryByTestId("ask-approve")).toBeNull());
    expect(sent.at(-1).approved).toBe(true);
    expect(screen.getByTestId("turn-agent-reply").textContent).toMatch(/answered/);
  });

  it("Story hook: each ask announces cip:run-start then cip:run-end (ok), also for a held call; a failed request ends with ok:false", async () => {
    const seen = [];
    const rec = (e) => seen.push([e.type, e.detail ? e.detail.ok : null]);
    window.addEventListener("cip:run-start", rec); window.addEventListener("cip:run-end", rec);
    mockAsk();
    render(<AskAgent scenario={view("hold-2-approve")} resetKey={0} />);
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-approve");
    expect(seen).toEqual([["cip:run-start", null], ["cip:run-end", true]]);
    global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await screen.findByTestId("ask-error");
    expect(seen.slice(2)).toEqual([["cip:run-start", null], ["cip:run-end", false]]);
    window.removeEventListener("cip:run-start", rec); window.removeEventListener("cip:run-end", rec);
  });

  it("a step-up scenario asks for the factor and sends it with the approval", async () => {
    const sent = mockAsk();
    render(<AskAgent scenario={view("stepup-1-approve")} resetKey={0} />);
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-approve");
    fireEvent.click(screen.getByTestId("ask-factor-otp"));
    fireEvent.change(screen.getByTestId("ask-otp"), { target: { value: "123123" } });
    fireEvent.click(screen.getByTestId("ask-approve-btn"));
    await waitFor(() => expect(sent.length).toBe(2));
    expect(sent[1].stepUp).toEqual({ factor: "otp", otp: "123123" });
  });

  it("a prompt with no tool word shows no API calls and what the agent can do", async () => {
    mockAsk();
    render(<AskAgent scenario={view("actsub-2-gate")} resetKey={0} />);
    fireEvent.change(screen.getByTestId("ask-prompt"), { target: { value: "make me a sandwich" } });
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("ask-no-calls");
    expect(screen.getByTestId("turn-agent-reply").textContent).toBe(`Agent${CAN_DO}`);
  });

  it("empty and over-long prompts cannot be sent, and the suggested prompt can be put back", () => {
    mockAsk();
    render(<AskAgent scenario={view("scope-1-without")} resetKey={0} />);
    const box = screen.getByTestId("ask-prompt");
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByTestId("ask-send").disabled).toBe(true);
    expect(box.maxLength).toBe(280);
    fireEvent.change(box, { target: { value: "something else" } });
    fireEvent.click(screen.getByTestId("ask-suggest"));
    expect(box.value).toBe("Search the index for open cases.");
  });

  it("the prompt is rendered as text, never as markup", async () => {
    mockAsk();
    render(<AskAgent scenario={view("scope-2-with")} resetKey={0} />);
    fireEvent.change(screen.getByTestId("ask-prompt"), { target: { value: "<img src=x onerror=alert(1)> search <script>x</script>" } });
    fireEvent.click(screen.getByTestId("ask-send"));
    await screen.findByTestId("turn-user");
    expect(screen.getByTestId("turn-user").querySelector("img, script")).toBeNull();
    expect(screen.getByTestId("turn-user").textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("an unreachable server shows the error with Retry, and Reset or a new scenario clears the conversation", async () => {
    global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const { rerender } = render(<AskAgent scenario={view("scope-2-with")} resetKey={0} />);
    fireEvent.click(screen.getByTestId("ask-send"));
    expect((await screen.findByTestId("ask-error")).textContent).toMatch(/not reachable/);
    mockAsk();
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByTestId("ask-answer");
    rerender(<AskAgent scenario={view("scope-2-with")} resetKey={1} />);
    await waitFor(() => expect(screen.queryByTestId("ask-answer")).toBeNull());
  });
});
