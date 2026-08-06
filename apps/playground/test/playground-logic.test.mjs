import test from "node:test";
import assert from "node:assert/strict";
import * as logic from "../dist-test/playground-logic.js";

const {
  appendEventLog,
  buildCameraRequest,
  deriveCommandAvailability,
  replaceObjectUrl,
} = logic;

test("active status enables switch and stop but not start", () => {
  assert.deepEqual(deriveCommandAvailability("active"), {
    canStart: false,
    canSwitch: true,
    canStop: true,
    busy: false,
  });
});

test("request uses exact device and ideal resolution", () => {
  assert.deepEqual(
    buildCameraRequest({
      deviceId: "camera-2",
      facingMode: "",
      resolutionId: "LANDSCAPE-720P",
      resolutionLabel: "LANDSCAPE-720P",
      width: 1280,
      height: 720,
      audio: false,
      mirror: false,
    }),
    {
      deviceId: "camera-2",
      resolution: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
  );
});

test("mobile resolution catalog exposes all approved portrait landscape and square presets", () => {
  assert.equal(typeof logic.getResolutionPresets, "function");
  const presets = logic.getResolutionPresets();
  assert.equal(presets.length, 19);
  assert.deepEqual(
    presets.map(({ id, width, height }) => [id, width, height]),
    [
      ["PORTRAIT-360P", 360, 640],
      ["PORTRAIT-480P", 480, 854],
      ["PORTRAIT-720P", 720, 1280],
      ["PORTRAIT-1080P", 1080, 1920],
      ["PORTRAIT-2K", 1440, 2560],
      ["PORTRAIT-4K", 2160, 3840],
      ["LANDSCAPE-360P", 640, 360],
      ["LANDSCAPE-480P", 854, 480],
      ["LANDSCAPE-720P", 1280, 720],
      ["LANDSCAPE-1080P", 1920, 1080],
      ["LANDSCAPE-2K", 2560, 1440],
      ["LANDSCAPE-4K", 3840, 2160],
      ["SQUARE-360", 360, 360],
      ["SQUARE-480", 480, 480],
      ["SQUARE-720", 720, 720],
      ["SQUARE-1080", 1080, 1080],
      ["SQUARE-1920", 1920, 1920],
      ["SQUARE-2K", 2048, 2048],
      ["SQUARE-4K", 4096, 4096],
    ],
  );
  assert.ok(Object.isFrozen(presets));
  assert.ok(presets.every(Object.isFrozen));
});

test("camera permission gate accepts only granted", () => {
  assert.equal(typeof logic.hasCameraPermission, "function");
  assert.equal(logic.hasCameraPermission("granted"), true);
  for (const state of ["unknown", "prompt", "unsupported", "denied"]) {
    assert.equal(logic.hasCameraPermission(state), false);
  }
});

test("event log keeps newest entries within limit", () => {
  assert.deepEqual(appendEventLog(["a", "b"], "c", 2), ["b", "c"]);
});

test("replacing a capture URL revokes the previous URL", () => {
  const revoked = [];
  const port = {
    createObjectURL: () => "blob:new",
    revokeObjectURL: (value) => revoked.push(value),
  };
  assert.equal(replaceObjectUrl("blob:old", new Blob(["x"]), port), "blob:new");
  assert.deepEqual(revoked, ["blob:old"]);
});
