import test from "node:test";
import assert from "node:assert/strict";

import { WebcamError, buildMediaStreamConstraints } from "webcam-ts";
import { assertCommandAllowed } from "webcam-ts/testing";

function createDevice(deviceId = "camera-1", label = "Camera") {
  return { deviceId, groupId: "group", kind: "videoinput", label };
}

test("start is rejected while starting", () => {
  assert.throws(
    () => assertCommandAllowed("starting", "start"),
    (error) => error instanceof WebcamError && error.code === "INVALID_STATE",
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
    (error) => error instanceof WebcamError && error.code === "INVALID_REQUEST",
  );
});

test("camera request maps stable primitives to browser constraints", () => {
  const constraints = buildMediaStreamConstraints({
    device: createDevice("camera-1"),
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
      device: createDevice("camera-a"),
      facingMode: { exact: "environment" },
    }),
    (error) => error.code === "INVALID_REQUEST",
  );
});

test("request accepts a device object and maps it to an exact constraint", () => {
  const constraints = buildMediaStreamConstraints({ device: createDevice("camera-1") });

  assert.deepEqual(constraints, {
    video: { deviceId: { exact: "camera-1" } },
    audio: false,
  });
});

test("request without a device falls back to facingMode", () => {
  const constraints = buildMediaStreamConstraints({ facingMode: "user" });

  assert.deepEqual(constraints.video, { facingMode: "user" });
});

test("request rejects a device without a deviceId", () => {
  assert.throws(
    () => buildMediaStreamConstraints({ device: createDevice("") }),
    (error) =>
      error instanceof WebcamError &&
      error.code === "INVALID_REQUEST" &&
      error.context?.field === "device",
  );
});

test("request rejects device combined with exact facingMode", () => {
  assert.throws(
    () => buildMediaStreamConstraints({
      device: createDevice("camera-a"),
      facingMode: { exact: "environment" },
    }),
    (error) => error.code === "INVALID_REQUEST",
  );
});
