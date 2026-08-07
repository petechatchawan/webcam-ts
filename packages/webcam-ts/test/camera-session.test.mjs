import test from "node:test";
import assert from "node:assert/strict";

import { Camera, CameraError } from "../dist/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function observeSettlementAfterTurn(promise) {
  const outcome = { settled: false, status: null, value: undefined, reason: undefined };
  promise.then(
    (value) => Object.assign(outcome, { settled: true, status: "fulfilled", value }),
    (reason) => Object.assign(outcome, { settled: true, status: "rejected", reason }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  return { ...outcome };
}

function createTrack({ deviceId = "camera", label = "Camera", readyState = "live" } = {}) {
  return {
    stopCalls: 0,
    readyState,
    label,
    stop() { this.stopCalls += 1; this.readyState = "ended"; },
    getSettings() { return { deviceId, width: 1280, height: 720 }; },
    getCapabilities() { return { width: { min: 320, max: 1920 } }; },
    async applyConstraints() {},
  };
}

function createStream(track = createTrack()) {
  return {
    getTracks() { return [track]; },
    getVideoTracks() { return [track]; },
  };
}

function createPort(open) {
  return {
    open,
    async enumerateDevices() { return []; },
  };
}

test("start commits one active stream and immutable state", async () => {
  const track = createTrack({ deviceId: "camera-a" });
  const stream = createStream(track);
  const camera = new Camera({ mediaDevices: createPort(async () => stream) });

  await camera.start({ deviceId: "camera-a" });

  assert.equal(camera.getActiveStream(), stream);
  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getState().deviceId, "camera-a");
  assert.equal(Object.isFrozen(camera.getState()), true);
  assert.equal(Object.isFrozen(camera.getState().settings), true);
  assert.equal(track.stopCalls, 0);
});

test("stop during start prevents stale commit and stops the resolved candidate", async () => {
  const pending = deferred();
  const track = createTrack();
  const stream = createStream(track);
  const camera = new Camera({ mediaDevices: createPort(() => pending.promise) });

  const startPromise = camera.start();
  await camera.stop();
  pending.resolve(stream);

  await assert.rejects(
    startPromise,
    (error) => error instanceof CameraError && error.code === "OPERATION_ABORTED",
  );
  assert.equal(track.stopCalls, 1);
  assert.equal(camera.getActiveStream(), null);
  assert.equal(camera.getState().status, "idle");
});

test("stop promptly preempts pending start without settling media acquisition", async () => {
  const pending = deferred();
  const lateTrack = createTrack();
  const lateStream = createStream(lateTrack);
  const camera = new Camera({ mediaDevices: createPort(() => pending.promise) });

  const startPromise = camera.start();
  const observedSettlement = observeSettlementAfterTurn(startPromise);
  await camera.stop();
  const beforeMediaSettles = await observedSettlement;

  pending.resolve(lateStream);
  await startPromise.catch(() => undefined);

  assert.equal(beforeMediaSettles.settled, true);
  assert.equal(beforeMediaSettles.status, "rejected");
  assert.equal(beforeMediaSettles.reason instanceof CameraError, true);
  assert.equal(beforeMediaSettles.reason?.code, "OPERATION_ABORTED");
  assert.equal(camera.getState().status, "idle");
});

test("dispose promptly preempts pending switch without settling media acquisition", async () => {
  const activeTrack = createTrack({ deviceId: "camera-a" });
  const activeStream = createStream(activeTrack);
  const pending = deferred();
  const lateTrack = createTrack({ deviceId: "camera-b" });
  const lateStream = createStream(lateTrack);
  let calls = 0;
  const camera = new Camera({
    mediaDevices: createPort(() => (++calls === 1 ? Promise.resolve(activeStream) : pending.promise)),
  });

  await camera.start();
  const switchPromise = camera.switch({ deviceId: "camera-b" });
  const observedSettlement = observeSettlementAfterTurn(switchPromise);
  await camera.dispose();
  const beforeMediaSettles = await observedSettlement;

  pending.resolve(lateStream);
  await switchPromise.catch(() => undefined);

  assert.equal(beforeMediaSettles.settled, true);
  assert.equal(beforeMediaSettles.status, "rejected");
  assert.equal(beforeMediaSettles.reason?.code, "DISPOSED");
  assert.equal(camera.getState().status, "disposed");
  assert.equal(activeTrack.stopCalls, 1);
});

test("late media resolution after preemption is stopped once and never committed", async () => {
  const pending = deferred();
  const lateTrack = createTrack({ deviceId: "late-camera" });
  const lateStream = createStream(lateTrack);
  const camera = new Camera({ mediaDevices: createPort(() => pending.promise) });
  const events = [];
  camera.subscribe((event) => events.push(event));

  const startPromise = camera.start();
  const observedSettlement = observeSettlementAfterTurn(startPromise);
  await camera.stop();
  const beforeMediaSettles = await observedSettlement;

  pending.resolve(lateStream);
  await startPromise.catch(() => undefined);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(beforeMediaSettles.settled, true);
  assert.equal(beforeMediaSettles.reason?.code, "OPERATION_ABORTED");
  assert.equal(lateTrack.stopCalls, 1);
  assert.equal(camera.getActiveStream(), null);
  assert.equal(
    events.some((event) => event.type === "stream-changed" && event.stream === lateStream),
    false,
  );
  assert.equal(
    events.some((event) => event.type === "operation-completed" && event.operation === "start"),
    false,
  );
});

test("late media rejection after preemption is consumed without unhandled rejection", async () => {
  const pending = deferred();
  const camera = new Camera({ mediaDevices: createPort(() => pending.promise) });
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  try {
    const startPromise = camera.start();
    const observedSettlement = observeSettlementAfterTurn(startPromise);
    await camera.stop();
    const beforeMediaSettles = await observedSettlement;

    pending.reject(new Error("late media failure"));
    await startPromise.catch(() => undefined);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(beforeMediaSettles.settled, true);
    assert.equal(beforeMediaSettles.reason?.code, "OPERATION_ABORTED");
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("failed switch preserves the previous active stream", async () => {
  const firstTrack = createTrack({ deviceId: "camera-a" });
  const firstStream = createStream(firstTrack);
  let calls = 0;
  const camera = new Camera({
    mediaDevices: createPort(async () => {
      calls += 1;
      if (calls === 1) return firstStream;
      throw Object.assign(new Error("busy"), { name: "NotReadableError" });
    }),
  });

  await camera.start({ deviceId: "camera-a" });
  await assert.rejects(
    () => camera.switch({ deviceId: "camera-b" }),
    (error) => error.code === "DEVICE_BUSY",
  );

  assert.equal(camera.getActiveStream(), firstStream);
  assert.equal(camera.getState().status, "active");
  assert.equal(firstTrack.stopCalls, 0);
});

test("latest switch wins and stale candidate is stopped", async () => {
  const activeTrack = createTrack({ deviceId: "camera-a" });
  const activeStream = createStream(activeTrack);
  const firstPending = deferred();
  const secondPending = deferred();
  const staleTrack = createTrack({ deviceId: "camera-b" });
  const staleStream = createStream(staleTrack);
  const winningTrack = createTrack({ deviceId: "camera-c" });
  const winningStream = createStream(winningTrack);
  let calls = 0;

  const camera = new Camera({
    mediaDevices: createPort(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(activeStream);
      if (calls === 2) return firstPending.promise;
      return secondPending.promise;
    }),
  });

  await camera.start({ deviceId: "camera-a" });
  const firstSwitch = camera.switch({ deviceId: "camera-b" });
  const secondSwitch = camera.switch({ deviceId: "camera-c" });
  secondPending.resolve(winningStream);
  await secondSwitch;
  firstPending.resolve(staleStream);

  await assert.rejects(firstSwitch, (error) => error.code === "OPERATION_SUPERSEDED");
  assert.equal(camera.getActiveStream(), winningStream);
  assert.equal(staleTrack.stopCalls, 1);
  assert.equal(activeTrack.stopCalls, 1);
  assert.equal(winningTrack.stopCalls, 0);
});

test("dispose preempts a switch and permanently terminates the camera", async () => {
  const activeTrack = createTrack();
  const activeStream = createStream(activeTrack);
  const pending = deferred();
  const candidateTrack = createTrack();
  const candidateStream = createStream(candidateTrack);
  let calls = 0;
  const camera = new Camera({
    mediaDevices: createPort(() => (++calls === 1 ? Promise.resolve(activeStream) : pending.promise)),
  });

  await camera.start();
  const switchPromise = camera.switch({ deviceId: "camera-b" });
  await camera.dispose();
  pending.resolve(candidateStream);

  await assert.rejects(switchPromise, (error) => error.code === "DISPOSED");
  assert.equal(activeTrack.stopCalls, 1);
  assert.equal(candidateTrack.stopCalls, 1);
  assert.equal(camera.getState().status, "disposed");
  await assert.rejects(() => camera.start(), (error) => error.code === "DISPOSED");
});

test("consumer listener failures do not reject lifecycle operations", async () => {
  const camera = new Camera({ mediaDevices: createPort(async () => createStream()) });
  camera.subscribe(() => { throw new Error("consumer failure"); });
  await assert.doesNotReject(() => camera.start());
  assert.equal(camera.getState().status, "active");
});

test("switch errors are attributed to the switch operation", async () => {
  const stream = createStream();
  let calls = 0;
  const camera = new Camera({
    mediaDevices: {
      async open() {
        calls += 1;
        if (calls === 1) return stream;
        throw Object.assign(new Error("busy"), { name: "NotReadableError" });
      },
      async enumerateDevices() { return []; },
    },
  });
  await camera.start();
  await assert.rejects(
    () => camera.switch({ deviceId: "camera-b" }),
    (error) => error.operation === "switch",
  );
});

test("default browser adapter attributes switch failures to switch", async () => {
  const originalNavigator = globalThis.navigator;
  const stream = createStream();
  let calls = 0;
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          async getUserMedia() {
            calls += 1;
            if (calls === 1) return stream;
            throw Object.assign(new Error("busy"), { name: "NotReadableError" });
          },
        },
      },
    });
    const camera = new Camera();
    await camera.start();
    await assert.rejects(
      () => camera.switch({ deviceId: "camera-b" }),
      (error) => error.operation === "switch",
    );
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  }
});

test("state snapshots do not freeze capability objects owned by the track", async () => {
  const zoomRange = { min: 1, max: 4 };
  const track = createTrack();
  track.getCapabilities = () => ({ zoom: zoomRange });
  const camera = new Camera({
    mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] },
  });

  await camera.start();

  assert.equal(Object.isFrozen(camera.getState().capabilities.zoom), true);
  assert.equal(Object.isFrozen(zoomRange), false);
});

test("public state snapshots never expose active without a session or idle with one", async () => {
  const stream = createStream(createTrack("camera-a"));
  const camera = new Camera({
    mediaDevices: {
      async open() { return stream; },
      async enumerateDevices() { return []; },
    },
    createSessionId: () => "session-a",
  });
  const snapshots = [];
  camera.subscribe((event) => {
    if (event.type === "state-changed") snapshots.push(event.state);
  });

  await camera.start();
  await camera.stop();

  assert.equal(
    snapshots.some((state) => state.status === "active" && state.sessionId === null),
    false,
  );
  assert.equal(
    snapshots.some((state) => state.status === "idle" && state.sessionId !== null),
    false,
  );
});

test("an unexpectedly ended active track releases the session and reports TRACK_ENDED", async () => {
  const endedListeners = new Set();
  const track = createTrack("camera-a");
  track.addEventListener = (type, listener) => {
    if (type === "ended") endedListeners.add(listener);
  };
  track.removeEventListener = (type, listener) => {
    if (type === "ended") endedListeners.delete(listener);
  };
  track.emitEnded = () => {
    track.readyState = "ended";
    for (const listener of [...endedListeners]) listener();
  };
  const stream = createStream(track);
  const camera = new Camera({
    mediaDevices: {
      async open() { return stream; },
      async enumerateDevices() { return []; },
    },
  });
  const events = [];
  camera.subscribe((event) => events.push(event));

  await camera.start();
  track.emitEnded();

  assert.equal(camera.getState().status, "idle");
  assert.equal(camera.getState().lastError?.code, "TRACK_ENDED");
  assert.equal(camera.getActiveStream(), null);
  assert.equal(
    events.some((event) => event.type === "stream-changed" && event.reason === "ended"),
    true,
  );
  assert.equal(events.some((event) => event.type === "session-ended"), true);
});
