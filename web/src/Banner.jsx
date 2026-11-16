import React from "react";

// Simulation banner: required first on every page (rule 2), also in presenter mode.
export default function SimulationBanner({ source }) {
  return (
    <div className="banner" role="note" data-testid="sim-banner">
      <strong>Simulation</strong> — the runs on this page are simulated. A mock PingFederate token and a mock Privilege door run in-process
      (mode: {source || "mock"}). The door is an evaluator of THREE Cedar rule shapes (hold for a human, token scope, agent act.sub), each
      compared exactly: it is not a Cedar engine and it decides nothing real. Only the act.sub case has a result measured on a real tenant;
      the hold and scope cases are simulated, and their real counterparts run in the full demo app. Nothing leaves this machine.
    </div>
  );
}
