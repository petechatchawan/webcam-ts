import test from "node:test";
import assert from "node:assert/strict";
import {
  appendEventLog,
  buildCameraRequest,
  deriveCommandAvailability,
  replaceObjectUrl,
} from "../dist/playground-logic.js";

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
      width: 1280,
      height: 720,
      audio: false,
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
