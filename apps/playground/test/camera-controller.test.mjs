import test from "node:test";
import assert from "node:assert/strict";
import { CameraController } from "../dist-test/camera-controller.js";

const idleState = Object.freeze({
  status: "idle",
  sessionId: null,
  deviceId: null,
  trackLabel: null,
  settings: null,
  capabilities: null,
  startedAt: null,
  lastError: null,
});

function activeState(deviceId = "camera-1") {
  return Object.freeze({
    ...idleState,
    status: "active",
    sessionId: "session-1",
    deviceId,
    trackLabel: "Test camera",
    settings: Object.freeze({ deviceId, width: 1280, height: 720 }),
    capabilities: Object.freeze({}),
    startedAt: 1,
  });
}

function createFixture({ switchError } = {}) {
  let state = idleState;
  const cameraListeners = new Set();
  const disposeCalls = { preview: 0, capture: 0, devices: 0, camera: 0 };
  const revokedUrls = [];
  const emitState = () => {
    for (const listener of cameraListeners) listener({ type: "state-changed", state });
  };

  const camera = {
    async start() {
      state = activeState();
      emitState();
    },
    async switch() {
      if (switchError) throw switchError;
      state = activeState("camera-2");
      emitState();
    },
    async stop() {
      state = idleState;
      emitState();
    },
    async dispose() {
      disposeCalls.camera += 1;
      state = Object.freeze({ ...idleState, status: "disposed" });
    },
    getState() {
      return state;
    },
    subscribe(listener) {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
  };

  const controller = new CameraController({
    camera,
    preview: {
      setMirror() {},
      dispose() {
        disposeCalls.preview += 1;
      },
    },
    capture: {
      async toBlob() {
        return {
          blob: new Blob(["photo"], { type: "image/jpeg" }),
          width: 640,
          height: 480,
          type: "image/jpeg",
          timestamp: 10,
        };
      },
      dispose() {
        disposeCalls.capture += 1;
      },
    },
    devices: {
      async list() {
        return Object.freeze([]);
      },
      subscribe() {
        return () => undefined;
      },
      dispose() {
        disposeCalls.devices += 1;
      },
    },
    permissions: {
      async query() {
        return Object.freeze({ camera: "unsupported", microphone: "unsupported" });
      },
      async request() {
        return Object.freeze({ camera: "granted", microphone: "unsupported" });
      },
    },
    controls: {
      getCapabilities() {
        return Object.freeze({});
      },
      async set() {
        return Object.freeze({});
      },
    },
    urlPort: {
      createObjectURL() {
        return "blob:capture";
      },
      revokeObjectURL(value) {
        revokedUrls.push(value);
      },
    },
    now: () => 100,
  });

  return { controller, disposeCalls, revokedUrls };
}

const selection = {
  deviceId: "camera-1",
  facingMode: "",
  width: 1280,
  height: 720,
  audio: false,
  mirror: true,
};

test("failed switch preserves active state and reports typed error", async () => {
  const error = Object.assign(new Error("Camera is busy"), {
    code: "DEVICE_BUSY",
    operation: "switch",
    recoverable: true,
  });
  const fixture = createFixture({ switchError: error });
  await fixture.controller.initialize();
  await fixture.controller.start(selection);

  await assert.rejects(() => fixture.controller.switch({ ...selection, deviceId: "camera-2" }));

  assert.equal(fixture.controller.getSnapshot().camera.status, "active");
  assert.equal(fixture.controller.getSnapshot().error.code, "DEVICE_BUSY");
  assert.equal(fixture.controller.getSnapshot().error.operation, "switch");
});

test("capture replacement and dispose revoke object URLs exactly once", async () => {
  const fixture = createFixture();
  await fixture.controller.initialize();
  await fixture.controller.start(selection);
  await fixture.controller.capture({ type: "image/jpeg", quality: 0.9 });
  await fixture.controller.capture({ type: "image/jpeg", quality: 0.8 });
  await fixture.controller.dispose();
  await fixture.controller.dispose();

  assert.deepEqual(fixture.revokedUrls, ["blob:capture", "blob:capture"]);
  assert.deepEqual(fixture.disposeCalls, {
    preview: 1,
    capture: 1,
    devices: 1,
    camera: 1,
  });
});
