import test from "node:test";
import assert from "node:assert/strict";

import { Camera, CameraError } from "../dist/index.js";

function createTrack(settings) {
  return {
    stopCalls: 0,
    readyState: "live",
    label: "Resolution fixture",
    stop() {
      this.stopCalls += 1;
      this.readyState = "ended";
    },
    getSettings() {
      return { ...settings };
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

function createPort(streams) {
  let index = 0;
  return {
    async open() {
      const stream = streams[index++];
      if (!stream) throw new Error("No synthetic stream queued");
      return stream;
    },
    async enumerateDevices() {
      return [];
    },
  };
}

const exactSquare1920 = {
  resolution: {
    width: { exact: 1920 },
    height: { exact: 1920 },
  },
};

test("exact start mismatch rejects and returns camera to idle", async () => {
  const candidateTrack = createTrack({ width: 1760, height: 1328 });
  const camera = new Camera({
    mediaDevices: createPort([createStream(candidateTrack)]),
  });

  await assert.rejects(
    () => camera.start(exactSquare1920),
    (error) =>
      error instanceof CameraError &&
      error.code === "CONSTRAINT_UNSATISFIED" &&
      error.operation === "start",
  );

  assert.equal(camera.getState().status, "idle");
  assert.equal(camera.getActiveStream(), null);
  assert.equal(candidateTrack.stopCalls, 1);
});

test("exact switch mismatch preserves previous active stream", async () => {
  const activeTrack = createTrack({ deviceId: "camera-a", width: 1280, height: 720 });
  const activeStream = createStream(activeTrack);
  const candidateTrack = createTrack({ deviceId: "camera-b", width: 1760, height: 1328 });
  const candidateStream = createStream(candidateTrack);
  const camera = new Camera({
    mediaDevices: createPort([activeStream, candidateStream]),
  });

  await camera.start({ deviceId: "camera-a" });
  await assert.rejects(
    () => camera.switch({ deviceId: "camera-b", ...exactSquare1920 }),
    (error) =>
      error instanceof CameraError &&
      error.code === "CONSTRAINT_UNSATISFIED" &&
      error.operation === "switch",
  );

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), activeStream);
  assert.equal(activeTrack.stopCalls, 0);
  assert.equal(candidateTrack.stopCalls, 1);
});

test("ideal resolution mismatch succeeds with delivered settings", async () => {
  const candidateTrack = createTrack({ width: 1760, height: 1328 });
  const candidateStream = createStream(candidateTrack);
  const camera = new Camera({
    mediaDevices: createPort([candidateStream]),
  });

  await camera.start({
    resolution: {
      width: { ideal: 1920 },
      height: { ideal: 1920 },
    },
  });

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), candidateStream);
  assert.equal(camera.getState().settings?.width, 1760);
  assert.equal(camera.getState().settings?.height, 1328);
  assert.equal(candidateTrack.stopCalls, 0);
});

test("missing authoritative delivered dimension does not fabricate exact mismatch", async () => {
  const candidateTrack = createTrack({ width: 1920 });
  const candidateStream = createStream(candidateTrack);
  const camera = new Camera({
    mediaDevices: createPort([candidateStream]),
  });

  await camera.start(exactSquare1920);

  assert.equal(camera.getState().status, "active");
  assert.equal(camera.getActiveStream(), candidateStream);
  assert.equal(candidateTrack.stopCalls, 0);
});
