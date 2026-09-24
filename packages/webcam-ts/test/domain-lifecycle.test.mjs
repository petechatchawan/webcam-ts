import test from "node:test";
import assert from "node:assert/strict";

import { CameraError, buildMediaStreamConstraints } from "../dist/index.js";
import { assertCommandAllowed } from "../dist/testing/index.js";

test("start is rejected while starting", () => {
  assert.throws(
    () => assertCommandAllowed("starting", "start"),
    (error) => error instanceof CameraError && error.code === "INVALID_STATE",
  );
});

test("start is accepted while active to replace the stream", () => {
  assert.doesNotThrow(() => assertCommandAllowed("active", "start"));
});

test("stop preempts a pending start", () => {
  assert.doesNotThrow(() => assertCommandAllowed("starting", "stop"));
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
