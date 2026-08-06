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

function createFixture({ startError, switchError } = {}) {
  let state = idleState;
  const cameraListeners = new Set();
  const disposeCalls = { preview: 0, capture: 0, devices: 0, camera: 0 };
  const revokedUrls = [];
  const emitState = () => {
    for (const listener of cameraListeners) listener({ type: "state-changed", state });
  };

  const camera = {
    async start() {
      if (startError) throw startError;
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
  resolutionId: "LANDSCAPE-720P",
  resolutionLabel: "LANDSCAPE-720P",
  resolutionMode: "exact",
  width: 1280,
  height: 720,
  audio: false,
  mirror: true,
};

test("start is blocked until camera permission is granted", async () => {
  const fixture = createFixture();
  await fixture.controller.initialize();

  await assert.rejects(
    () => fixture.controller.start(selection),
    (error) => error?.code === "PERMISSION_REQUIRED",
  );

  assert.equal(fixture.controller.getSnapshot().camera.status, "idle");
  assert.equal(fixture.controller.getSnapshot().error.code, "PERMISSION_REQUIRED");
  assert.equal(fixture.controller.getSnapshot().requestedResolution, null);
});

test("successful start commits requested resolution next to actual track settings", async () => {
  const fixture = createFixture();
  await fixture.controller.initialize();
  await fixture.controller.requestPermissions(false);
  await fixture.controller.start(selection);

  assert.deepEqual(fixture.controller.getSnapshot().requestedResolution, {
    id: "LANDSCAPE-720P",
    label: "LANDSCAPE-720P",
    mode: "exact",
    width: 1280,
    height: 720,
  });
  assert.equal(fixture.controller.getSnapshot().camera.settings.width, 1280);
  assert.equal(fixture.controller.getSnapshot().camera.settings.height, 720);
});

test("exact start failure reports the requested resolution and failed constraint", async () => {
  const error = Object.assign(new Error("Constraints could not be satisfied"), {
    code: "CONSTRAINT_UNSATISFIED",
    operation: "start",
    recoverable: true,
    context: Object.freeze({
      browserErrorName: "OverconstrainedError",
      constraint: "height",
    }),
  });
  const fixture = createFixture({ startError: error });
  await fixture.controller.initialize();
  await fixture.controller.requestPermissions(false);

  await assert.rejects(() => fixture.controller.start({
    ...selection,
    resolutionId: "SQUARE-1920",
    resolutionLabel: "SQUARE-1920",
    width: 1920,
    height: 1920,
  }));

  assert.equal(fixture.controller.getSnapshot().camera.status, "idle");
  assert.equal(fixture.controller.getSnapshot().error.code, "CONSTRAINT_UNSATISFIED");
  assert.equal(
    fixture.controller.getSnapshot().error.message,
    "SQUARE-1920 requires exactly 1920×1920, but the selected camera cannot satisfy the height constraint. Choose another preset or use Prefer closest.",
  );
  assert.equal(fixture.controller.getSnapshot().requestedResolution, null);
});

test("failed switch preserves active state and reports typed error", async () => {
  const error = Object.assign(new Error("Camera is busy"), {
    code: "DEVICE_BUSY",
    operation: "switch",
    recoverable: true,
  });
  const fixture = createFixture({ switchError: error });
  await fixture.controller.initialize();
  await fixture.controller.requestPermissions(false);
  await fixture.controller.start(selection);

  await assert.rejects(() => fixture.controller.switch({
    ...selection,
    deviceId: "camera-2",
    resolutionId: "PORTRAIT-720P",
    resolutionLabel: "PORTRAIT-720P",
    width: 720,
    height: 1280,
  }));

  assert.equal(fixture.controller.getSnapshot().camera.status, "active");
  assert.equal(fixture.controller.getSnapshot().error.code, "DEVICE_BUSY");
  assert.equal(fixture.controller.getSnapshot().error.operation, "switch");
  assert.equal(fixture.controller.getSnapshot().requestedResolution.id, "LANDSCAPE-720P");
});

test("capture replacement and dispose revoke object URLs exactly once", async () => {
  const fixture = createFixture();
  await fixture.controller.initialize();
  await fixture.controller.requestPermissions(false);
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
