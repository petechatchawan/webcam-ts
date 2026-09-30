import test from "node:test";
import assert from "node:assert/strict";

import { Webcam, WebcamError } from "webcam-ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createTrack({ deviceId = "camera", label = "Webcam", readyState = "live" } = {}) {
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

function createDevice(deviceId = "camera", label = "Webcam") {
  return { deviceId, groupId: "group", kind: "videoinput", label };
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
  const camera = new Webcam({ mediaDevices: createPort(async () => stream) });

  await camera.start({ device: createDevice("camera-a") });

  assert.equal(camera.getActiveStream(), stream);
  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getState().deviceId, "camera-a");
  assert.equal(Object.isFrozen(camera.getState()), true);
  assert.equal(Object.isFrozen(camera.getState().settings), true);
  assert.equal(track.stopCalls, 0);
});

test("error context snapshots clone and freeze nested values", () => {
  const fields = ["deviceId", "facingMode"];
  const error = new WebcamError("conflicting request", {
    code: "INVALID_REQUEST",
    context: { fields },
  });
  const snapshot = error.toSnapshot();

  assert.deepEqual(snapshot.context.fields, fields);
  assert.equal(Object.isFrozen(snapshot.context.fields), true);
  assert.notEqual(snapshot.context.fields, fields);
  assert.equal(Object.isFrozen(fields), false);
});

test("error context snapshots preserve non-record values", () => {
  const capturedAt = new Date(2026, 8, 28);
  const error = new WebcamError("capture failed", {
    code: "CAPTURE_FAILED",
    context: { capturedAt },
  });

  assert.equal(error.toSnapshot().context.capturedAt, capturedAt);
});

test("state error snapshots deeply freeze nested context", async () => {
  const camera = new Webcam({ mediaDevices: createPort(async () => createStream()) });

  await assert.rejects(() => camera.start({
    device: createDevice("camera-a"),
    facingMode: { exact: "user" },
  }));

  const fields = camera.getState().lastError.context.fields;
  assert.deepEqual(fields, ["device", "facingMode"]);
  assert.equal(Object.isFrozen(fields), true);
});

test("stop during start prevents stale commit and stops the resolved candidate", async () => {
  const pending = deferred();
  const track = createTrack();
  const stream = createStream(track);
  const camera = new Webcam({ mediaDevices: createPort(() => pending.promise) });

  const startPromise = camera.start();
  await camera.stop();
  pending.resolve(stream);

  await assert.rejects(
    startPromise,
    (error) => error instanceof WebcamError && error.code === "OPERATION_ABORTED",
  );
  assert.equal(track.stopCalls, 1);
  assert.equal(camera.getActiveStream(), null);
  assert.equal(camera.getState().status, "idle");
});

test("aborting a start mid-flight recovers to idle and allows the next start", async () => {
  const pending = deferred();
  const abortController = new AbortController();
  const activeTrack = createTrack({ deviceId: "camera-a" });
  const activeStream = createStream(activeTrack);
  let calls = 0;
  const camera = new Webcam({
    mediaDevices: createPort(() => {
      calls += 1;
      return calls === 1 ? pending.promise : Promise.resolve(activeStream);
    }),
  });

  const startPromise = camera.start({ signal: abortController.signal });
  abortController.abort();
  pending.resolve(createStream(createTrack({ deviceId: "camera-b" })));

  await assert.rejects(startPromise, (error) => error.code === "OPERATION_ABORTED");
  assert.equal(camera.getState().status, "idle");

  await camera.start({ device: createDevice("camera-a") });
  assert.equal(camera.getActiveStream(), activeStream);
  assert.equal(camera.getState().status, "active");
});

test("failed start while active preserves the previous stream", async () => {
  const firstTrack = createTrack({ deviceId: "camera-a" });
  const firstStream = createStream(firstTrack);
  let calls = 0;
  const camera = new Webcam({
    mediaDevices: createPort(async () => {
      calls += 1;
      if (calls === 1) return firstStream;
      throw Object.assign(new Error("busy"), { name: "NotReadableError" });
    }),
  });

  await camera.start({ device: createDevice("camera-a") });
  await assert.rejects(
    () => camera.start({ device: createDevice("camera-b") }),
    (error) => error.code === "DEVICE_BUSY",
  );

  assert.equal(camera.getActiveStream(), firstStream);
  assert.equal(camera.getState().status, "active");
  assert.equal(firstTrack.stopCalls, 0);
});

test("aborting a replacement start mid-flight keeps the previous stream active", async () => {
  const activeTrack = createTrack({ deviceId: "camera-a" });
  const activeStream = createStream(activeTrack);
  const pending = deferred();
  const abortController = new AbortController();
  const candidateTrack = createTrack({ deviceId: "camera-b" });
  let calls = 0;
  const camera = new Webcam({
    mediaDevices: createPort(() => (++calls === 1 ? Promise.resolve(activeStream) : pending.promise)),
  });

  await camera.start({ device: createDevice("camera-a") });
  const replacementPromise = camera.start({ device: createDevice("camera-b"), signal: abortController.signal });
  abortController.abort();
  pending.resolve(createStream(candidateTrack));

  await assert.rejects(replacementPromise, (error) => error.code === "OPERATION_ABORTED");
  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), activeStream);
  assert.equal(activeTrack.stopCalls, 0);
  assert.equal(candidateTrack.stopCalls, 1);
});

test("a second start while starting is rejected instead of superseding", async () => {
  const pending = deferred();
  const track = createTrack({ deviceId: "camera-a" });
  const stream = createStream(track);
  const camera = new Webcam({ mediaDevices: createPort(() => pending.promise) });

  const firstStart = camera.start({ device: createDevice("camera-a") });
  await assert.rejects(
    () => camera.start({ device: createDevice("camera-b") }),
    (error) => error.code === "INVALID_STATE",
  );
  pending.resolve(stream);
  await firstStart;

  assert.equal(camera.getActiveStream(), stream);
  assert.equal(camera.getState().status, "active");
  assert.equal(track.stopCalls, 0);
});

test("dispose preempts a replacement start and permanently terminates the camera", async () => {
  const activeTrack = createTrack();
  const activeStream = createStream(activeTrack);
  const pending = deferred();
  const candidateTrack = createTrack();
  const candidateStream = createStream(candidateTrack);
  let calls = 0;
  const camera = new Webcam({
    mediaDevices: createPort(() => (++calls === 1 ? Promise.resolve(activeStream) : pending.promise)),
  });

  await camera.start();
  const replacementPromise = camera.start({ device: createDevice("camera-b") });
  await camera.dispose();
  pending.resolve(candidateStream);

  await assert.rejects(replacementPromise, (error) => error.code === "DISPOSED");
  assert.equal(activeTrack.stopCalls, 1);
  assert.equal(candidateTrack.stopCalls, 1);
  assert.equal(camera.getState().status, "disposed");
  await assert.rejects(() => camera.start(), (error) => error.code === "DISPOSED");
});

test("consumer listener failures do not reject lifecycle operations", async () => {
  const camera = new Webcam({ mediaDevices: createPort(async () => createStream()) });
  camera.subscribe(() => { throw new Error("consumer failure"); });
  await assert.doesNotReject(() => camera.start());
  assert.equal(camera.getState().status, "active");
});

test("candidate inspection failure preserves the active stream and releases the candidate", async () => {
  const previousTrack = createTrack({ deviceId: "camera-a" });
  const previousStream = createStream(previousTrack);
  const candidateTrack = createTrack({ deviceId: "camera-b" });
  candidateTrack.getCapabilities = () => { throw new Error("capability read failed"); };
  const candidateStream = createStream(candidateTrack);
  let opens = 0;
  const camera = new Webcam({
    mediaDevices: createPort(async () => {
      opens += 1;
      return opens === 1 ? previousStream : candidateStream;
    }),
  });

  await camera.start({ device: createDevice("camera-a") });
  await assert.rejects(
    () => camera.start({ device: createDevice("camera-b") }),
    (error) => error instanceof WebcamError,
  );

  assert.equal(camera.getActiveStream(), previousStream);
  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getState().deviceId, "camera-a");
  assert.equal(previousTrack.stopCalls, 0);
  assert.equal(candidateTrack.stopCalls, 1);
});

test("replacement start errors are attributed to the start operation", async () => {
  const stream = createStream();
  let calls = 0;
  const camera = new Webcam({
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
    () => camera.start({ device: createDevice("camera-b") }),
    (error) => error.operation === "start",
  );
});

test("default browser adapter attributes replacement failures to start", async () => {
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
    const camera = new Webcam();
    await camera.start();
    await assert.rejects(
      () => camera.start({ device: createDevice("camera-b") }),
      (error) => error.operation === "start",
    );
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  }
});

test("state snapshots do not freeze capability objects owned by the track", async () => {
  const zoomRange = { min: 1, max: 4 };
  const track = createTrack();
  track.getCapabilities = () => ({ zoom: zoomRange });
  const camera = new Webcam({
    mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] },
  });

  await camera.start();

  assert.equal(Object.isFrozen(camera.getState().capabilities.zoom), true);
  assert.equal(Object.isFrozen(zoomRange), false);
});

test("an empty track label is preserved instead of coerced to null", async () => {
  const track = createTrack({ label: "" });
  const camera = new Webcam({ mediaDevices: createPort(async () => createStream(track)) });

  await camera.start();

  assert.equal(camera.getState().trackLabel, "");
});

test("public state snapshots never expose active without a session or idle with one", async () => {
  const stream = createStream(createTrack({ deviceId: "camera-a" }));
  const camera = new Webcam({
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
  const track = createTrack({ deviceId: "camera-a" });
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
  const camera = new Webcam({
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

test("track ended during replacement still commits the pending start", async () => {
  const endedListeners = new Set();
  const activeTrack = createTrack({ deviceId: "camera-a" });
  activeTrack.addEventListener = (type, listener) => {
    if (type === "ended") endedListeners.add(listener);
  };
  activeTrack.removeEventListener = (type, listener) => {
    if (type === "ended") endedListeners.delete(listener);
  };
  activeTrack.emitEnded = () => {
    activeTrack.readyState = "ended";
    for (const listener of [...endedListeners]) listener();
  };
  const activeStream = createStream(activeTrack);
  const pending = deferred();
  const candidateTrack = createTrack({ deviceId: "camera-b" });
  const candidateStream = createStream(candidateTrack);
  let calls = 0;
  const camera = new Webcam({
    mediaDevices: createPort(() => (++calls === 1 ? Promise.resolve(activeStream) : pending.promise)),
  });
  const events = [];
  camera.subscribe((event) => events.push(event));

  await camera.start({ device: createDevice("camera-a") });
  const replacementPromise = camera.start({ device: createDevice("camera-b") });
  activeTrack.emitEnded();
  pending.resolve(candidateStream);
  await replacementPromise;

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), candidateStream);
  assert.equal(activeTrack.stopCalls, 1);
  const endedIndex = events.findIndex(
    (event) => event.type === "stream-changed" && event.reason === "ended",
  );
  const startedIndex = events.findIndex(
    (event, index) => event.type === "stream-changed" && event.reason === "started" && index > endedIndex,
  );
  assert.notEqual(endedIndex, -1);
  assert.notEqual(startedIndex, -1);
  assert.ok(endedIndex < startedIndex);
});
