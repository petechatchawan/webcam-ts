import test from "node:test";
import assert from "node:assert/strict";

import { Camera, CameraError } from "../dist/index.js";
import { verifyExactResolutionPostcondition } from "../dist/session/exact-resolution-postcondition.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createTrack({ width = 1280, height = 720, deviceId = "camera" } = {}) {
  return {
    stopCalls: 0,
    readyState: "live",
    label: "Orientation fixture",
    stop() {
      this.stopCalls += 1;
      this.readyState = "ended";
    },
    getSettings() {
      return { width, height, deviceId };
    },
    getCapabilities() {
      return {};
    },
    async applyConstraints() {},
  };
}

function createStream(track) {
  return {
    getTracks() {
      return [track];
    },
    getVideoTracks() {
      return [track];
    },
  };
}

function overconstrained(constraint = "width") {
  return Object.assign(new Error(`Cannot satisfy ${constraint}`), {
    name: "OverconstrainedError",
    constraint,
  });
}

function createQueuedPort(entries) {
  const calls = [];
  let index = 0;
  return {
    calls,
    async open(constraints) {
      calls.push(structuredClone(constraints));
      const entry = entries[index++];
      if (entry instanceof Error) throw entry;
      if (!entry) throw new Error("No synthetic media result queued");
      return entry;
    },
    async enumerateDevices() {
      return [];
    },
  };
}

const portrait720Exact = {
  resolution: {
    width: { exact: 720 },
    height: { exact: 1280 },
  },
};

test("exact postcondition accepts a 90-degree orientation-equivalent dimension pair", () => {
  assert.deepEqual(
    verifyExactResolutionPostcondition(
      portrait720Exact,
      { width: 1280, height: 720 },
      "start",
    ),
    { status: "verified" },
  );
});

test("exact postcondition still rejects a genuinely different resolution", () => {
  assert.throws(
    () =>
      verifyExactResolutionPostcondition(
        portrait720Exact,
        { width: 1920, height: 1080 },
        "start",
      ),
    (error) => error instanceof CameraError && error.code === "CONSTRAINT_UNSATISFIED",
  );
});

test("partial exact postcondition does not use rotated-pair matching", () => {
  assert.throws(
    () =>
      verifyExactResolutionPostcondition(
        { resolution: { width: { exact: 720 } } },
        { width: 1280, height: 720 },
        "start",
      ),
    (error) => error instanceof CameraError && error.code === "CONSTRAINT_UNSATISFIED",
  );
});

test("exact start retries once with swapped dimensions after a resolution constraint failure", async () => {
  const rotatedTrack = createTrack({ width: 1280, height: 720 });
  const rotatedStream = createStream(rotatedTrack);
  const port = createQueuedPort([overconstrained("width"), rotatedStream]);
  const camera = new Camera({ mediaDevices: port });

  await camera.start(portrait720Exact);

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), rotatedStream);
  assert.equal(camera.getState().settings?.width, 1280);
  assert.equal(camera.getState().settings?.height, 720);
  assert.equal(port.calls.length, 2);
  assert.deepEqual(port.calls[0].video.width, { exact: 720 });
  assert.deepEqual(port.calls[0].video.height, { exact: 1280 });
  assert.deepEqual(port.calls[1].video.width, { exact: 1280 });
  assert.deepEqual(port.calls[1].video.height, { exact: 720 });
  assert.equal(rotatedTrack.stopCalls, 0);
});

test("exact switch retries swapped dimensions and preserves candidate-first ownership", async () => {
  const activeTrack = createTrack({ width: 1280, height: 720, deviceId: "camera-a" });
  const activeStream = createStream(activeTrack);
  const nextTrack = createTrack({ width: 1280, height: 720, deviceId: "camera-b" });
  const nextStream = createStream(nextTrack);
  const port = createQueuedPort([activeStream, overconstrained("height"), nextStream]);
  const camera = new Camera({ mediaDevices: port });

  await camera.start({ deviceId: "camera-a" });
  await camera.switch({ deviceId: "camera-b", ...portrait720Exact });

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), nextStream);
  assert.equal(port.calls.length, 3);
  assert.deepEqual(port.calls[1].video.width, { exact: 720 });
  assert.deepEqual(port.calls[1].video.height, { exact: 1280 });
  assert.deepEqual(port.calls[2].video.width, { exact: 1280 });
  assert.deepEqual(port.calls[2].video.height, { exact: 720 });
  assert.equal(activeTrack.stopCalls, 1);
  assert.equal(nextTrack.stopCalls, 0);
});

test("non-resolution acquisition failures never trigger an orientation retry", async () => {
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  const port = createQueuedPort([denied]);
  const camera = new Camera({ mediaDevices: port });

  await assert.rejects(
    () => camera.start(portrait720Exact),
    (error) => error instanceof CameraError && error.code === "PERMISSION_DENIED",
  );

  assert.equal(port.calls.length, 1);
  assert.equal(camera.getState().status, "idle");
});

test("ideal, square, and partial exact requests do not use orientation retry", async () => {
  for (const request of [
    { resolution: { width: { ideal: 720 }, height: { ideal: 1280 } } },
    { resolution: { width: { exact: 720 }, height: { exact: 720 } } },
    { resolution: { width: { exact: 720 } } },
  ]) {
    const port = createQueuedPort([overconstrained("width")]);
    const camera = new Camera({ mediaDevices: port });
    await assert.rejects(() => camera.start(request));
    assert.equal(port.calls.length, 1);
  }
});

test("dual orientation failure remains constraint-unsatisfied and records retry context", async () => {
  const port = createQueuedPort([overconstrained("width"), overconstrained("height")]);
  const camera = new Camera({ mediaDevices: port });

  await assert.rejects(
    () => camera.start(portrait720Exact),
    (error) =>
      error instanceof CameraError &&
      error.code === "CONSTRAINT_UNSATISFIED" &&
      error.context?.requestedWidth === 720 &&
      error.context?.requestedHeight === 1280 &&
      error.context?.orientationRetryAttempted === true,
  );

  assert.equal(port.calls.length, 2);
  assert.equal(camera.getState().status, "idle");
  assert.equal(camera.getActiveStream(), null);
});

test("a non-resolution failure on the swapped attempt is not mislabeled as dual-orientation failure", async () => {
  const port = createQueuedPort([overconstrained("width"), overconstrained("frameRate")]);
  const camera = new Camera({ mediaDevices: port });

  await assert.rejects(
    () => camera.start(portrait720Exact),
    (error) =>
      error instanceof CameraError &&
      error.code === "CONSTRAINT_UNSATISFIED" &&
      error.context?.constraint === "frameRate" &&
      error.context?.orientationRetryAttempted === undefined,
  );

  assert.equal(port.calls.length, 2);
  assert.equal(camera.getState().status, "idle");
});

test("dual orientation switch failure preserves the previous active stream", async () => {
  const activeTrack = createTrack({ deviceId: "camera-a" });
  const activeStream = createStream(activeTrack);
  const port = createQueuedPort([
    activeStream,
    overconstrained("width"),
    overconstrained("height"),
  ]);
  const camera = new Camera({ mediaDevices: port });

  await camera.start({ deviceId: "camera-a" });
  await assert.rejects(
    () => camera.switch({ deviceId: "camera-b", ...portrait720Exact }),
    (error) =>
      error instanceof CameraError &&
      error.code === "CONSTRAINT_UNSATISFIED" &&
      error.context?.orientationRetryAttempted === true,
  );

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), activeStream);
  assert.equal(activeTrack.stopCalls, 0);
  assert.equal(port.calls.length, 3);
});

test("stop during the swapped retry preempts the operation and cleans a late stream", async () => {
  const secondAttemptStarted = deferred();
  const pendingRetry = deferred();
  const lateTrack = createTrack({ width: 1280, height: 720 });
  const lateStream = createStream(lateTrack);
  let calls = 0;
  const mediaDevices = {
    async open() {
      calls += 1;
      if (calls === 1) throw overconstrained("width");
      secondAttemptStarted.resolve();
      return pendingRetry.promise;
    },
    async enumerateDevices() {
      return [];
    },
  };
  const camera = new Camera({ mediaDevices });

  const startPromise = camera.start(portrait720Exact);
  await secondAttemptStarted.promise;
  await camera.stop();
  pendingRetry.resolve(lateStream);

  await assert.rejects(
    startPromise,
    (error) => error instanceof CameraError && error.code === "OPERATION_ABORTED",
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls, 2);
  assert.equal(camera.getState().status, "idle");
  assert.equal(camera.getActiveStream(), null);
  assert.equal(lateTrack.stopCalls, 1);
});