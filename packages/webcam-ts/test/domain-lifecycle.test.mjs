import test from "node:test";
import assert from "node:assert/strict";

import { CameraError, buildMediaStreamConstraints } from "../dist/index.js";
import { assertCommandAllowed } from "../dist/testing/index.js";
import { verifyExactResolutionPostcondition } from "../dist/session/exact-resolution-postcondition.js";

test("start is rejected outside idle", () => {
  assert.throws(
    () => assertCommandAllowed("active", "start"),
    (error) => error instanceof CameraError && error.code === "INVALID_STATE",
  );
});

test("switch is accepted while switching for latest-command-wins", () => {
  assert.doesNotThrow(() => assertCommandAllowed("switching", "switch"));
});

test("camera request rejects non-positive exact width", () => {
  assert.throws(
    () => buildMediaStreamConstraints({ resolution: { width: { exact: 0 } } }),
    (error) => error instanceof CameraError && error.code === "INVALID_REQUEST",
  );
});

test("camera request maps stable primitives to browser constraints", () => {
  const constraints = buildMediaStreamConstraints({
    deviceId: "camera-1",
    resolution: {
      width: { ideal: 1280 },
      height: { min: 720, max: 1080 },
    },
    frameRate: 30,
    audio: false,
  });

  assert.deepEqual(constraints, {
    video: {
      deviceId: { exact: "camera-1" },
      width: { ideal: 1280 },
      height: { min: 720, max: 1080 },
      frameRate: 30,
    },
    audio: false,
  });
});

test("request rejects exact deviceId combined with exact facingMode", () => {
  assert.throws(
    () => buildMediaStreamConstraints({
      deviceId: "camera-a",
      facingMode: { exact: "environment" },
    }),
    (error) => error.code === "INVALID_REQUEST",
  );
});

test("exact resolution postcondition rejects authoritative delivered mismatch", () => {
  assert.throws(
    () => verifyExactResolutionPostcondition(
      { resolution: { width: { exact: 1920 }, height: { exact: 1920 } } },
      { width: 1760, height: 1328 },
      "start",
    ),
    (error) =>
      error instanceof CameraError &&
      error.code === "CONSTRAINT_UNSATISFIED" &&
      error.operation === "start" &&
      error.context?.requestedWidth === 1920 &&
      error.context?.requestedHeight === 1920 &&
      error.context?.actualWidth === 1760 &&
      error.context?.actualHeight === 1328,
  );
});

test("ideal resolution mismatch is not an exact postcondition failure", () => {
  assert.deepEqual(
    verifyExactResolutionPostcondition(
      { resolution: { width: { ideal: 1920 }, height: { ideal: 1920 } } },
      { width: 1760, height: 1328 },
      "start",
    ),
    { status: "unobservable" },
  );
});

test("missing authoritative delivered dimension leaves exact postcondition unobservable", () => {
  assert.deepEqual(
    verifyExactResolutionPostcondition(
      { resolution: { width: { exact: 1920 }, height: { exact: 1920 } } },
      { width: 1920 },
      "switch",
    ),
    { status: "unobservable" },
  );
});
