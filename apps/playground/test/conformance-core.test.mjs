import test from "node:test";
import assert from "node:assert/strict";

import {
  createScenarioResult,
  deriveScenarioStatus,
} from "../dist-test/conformance/scenario-runner.js";

const environment = Object.freeze({
  browser: Object.freeze({ family: "test", version: "1" }),
  engine: "test",
  os: Object.freeze({ family: "test", version: "1" }),
  formFactor: "desktop",
  secureContext: true,
  packageVersion: "4.0.0-alpha.1",
  gitSha: "test-sha",
  hardwareClass: "unknown",
});

test("a scenario cannot pass without an explicit assertion", () => {
  assert.equal(deriveScenarioStatus([]), "blocked");
});

test("a scenario fails when any required assertion fails", () => {
  assert.equal(
    deriveScenarioStatus([
      { id: "stream-live", passed: true, message: "stream is live" },
      { id: "state-active", passed: false, message: "state must be active" },
    ]),
    "fail",
  );
});

test("a scenario passes only when every assertion passes", () => {
  assert.equal(
    deriveScenarioStatus([
      { id: "stream-live", passed: true, message: "stream is live" },
      { id: "state-active", passed: true, message: "state is active" },
    ]),
    "pass",
  );
});

test("scenario results are immutable snapshots with assertion-derived status", () => {
  const result = createScenarioResult({
    scenarioId: "camera-start",
    startedAt: "2026-08-07T06:30:00.000Z",
    completedAt: "2026-08-07T06:30:01.000Z",
    environment,
    observations: [{ key: "camera.status", value: "active" }],
    assertions: [{ id: "state-active", passed: true, message: "state is active" }],
  });

  assert.equal(result.status, "pass");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.observations), true);
  assert.equal(Object.isFrozen(result.assertions), true);
});
