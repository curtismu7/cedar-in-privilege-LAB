// BD-6: the trace panel drew an allowed (200) reply's `result` in the same strong style as a refusal's `error`. The lab now passes
// hot={["error"]}: the refusal's error stays marked, the allowed reply's result is not.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import LabTrace, { TRACE_HOT } from "../web/src/LabTrace.jsx";
import { setJsonView } from "../web/src/components/JsonPane.jsx";
import { SCENARIOS } from "../server/src/scenarios.js";
import { runScenario } from "../server/src/index.js";

afterEach(() => cleanup());

// The same exchanges FlowSim builds from a run.
const exchangesFor = (id) => runScenario(SCENARIOS.find((s) => s.id === id)).calls
  .map((c, i) => ({ step: i + 1, title: `Agent calls the door: tools/call ${c.tool}`, status: c.trace.response ? c.trace.response.status : null, trace: c.trace, tool: c.tool }));

const rawHot = (testId) => [...screen.getByTestId(testId).querySelectorAll(".jtok--hot")].map((n) => n.textContent.replace(/"/g, ""));
const formHot = (testId) => [...screen.getByTestId(testId).querySelectorAll('[data-hot="true"] > .jform__k')].map((n) => n.textContent);

describe("BD-6 a successful reply is not drawn as an alert", () => {
  it("the lab marks `error` only", () => {
    expect(TRACE_HOT).toEqual(["error"]);
  });

  for (const view of ["raw", "form"]) {
    it(`case 3, ${view} view: the allowed CountTool reply has no hot key, the refused ListIndexTool reply has its error marked`, () => {
      setJsonView(view);
      const exchanges = exchangesFor("actsub-2-gate");
      const allowed = exchanges.find((e) => e.tool === "CountTool");
      const refused = exchanges.find((e) => e.tool === "ListIndexTool");
      expect(allowed.status).toBe(200);
      expect(JSON.stringify(allowed.trace.response.body)).toContain('"result"');
      expect(refused.trace.response.body.error).toBeTruthy();
      render(<LabTrace exchanges={exchanges} />);
      const hot = view === "raw" ? rawHot : formHot;
      const ok = hot(`trace-${allowed.step}-response-body`);
      expect(ok).not.toContain("result");
      expect(ok).not.toContain("tools");
      expect(hot(`trace-${allowed.step}-request-body`)).not.toContain("result");
      expect(hot(`trace-${refused.step}-response-body`)).toContain("error");
    });
  }
});
