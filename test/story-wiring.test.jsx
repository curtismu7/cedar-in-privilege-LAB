import { describe, it, expect } from "vitest";
import { buildSteps, createHost } from "../web/src/storyWiring.js";
import { STEPS } from "../web/src/storyScript.js";

// Play for me presses what a step's `prompt.press` names, and the engine waits for a run only through the marker a prompt step takes. buildSteps once
// dropped `prompt`, so Play pressed nothing and a run-done step with no target on the page stalled with "The run could not be checked".
describe("buildSteps", () => {
  const host = createHost({ win: new EventTarget(), doc: document });
  const built = buildSteps({ captions: {}, host });

  it("passes every step's press prompt to the engine, unchanged", () => {
    for (const s of STEPS.filter((x) => x.prompt)) {
      const step = built.find((b) => b.key === s.key);
      expect(step.prompt, s.key).toEqual(s.prompt);
    }
    expect(built.filter((b) => b.prompt).length).toBe(STEPS.filter((x) => x.prompt).length);
    expect(built.filter((b) => b.prompt).length).toBeGreaterThan(8);
  });

  it("keeps the order, keys and triggers of the script", () => {
    expect(built.map((b) => [b.key, b.trigger])).toEqual(STEPS.map((s) => [s.key, s.trigger]));
  });

  it("host.send clicks the page's own button the step names", () => {
    document.body.innerHTML = '<button data-testid="scenario-hold-1-held">a</button>';
    let clicked = 0;
    document.querySelector("[data-testid=scenario-hold-1-held]").addEventListener("click", () => { clicked += 1; });
    host.send(built.find((b) => b.key === "hold_intro"));
    expect(clicked).toBe(1);
    expect(() => host.send({ prompt: { press: "[data-testid=nope]" } })).toThrow();
  });
});
