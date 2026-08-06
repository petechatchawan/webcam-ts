import test from "node:test";
import assert from "node:assert/strict";

import { Camera } from "../dist/index.js";
import { VideoPreview } from "../dist/preview/index.js";
import { CameraCapture } from "../dist/capture/index.js";

function createTrack(deviceId = "camera-a") {
  return {
    stopCalls: 0,
    readyState: "live",
    label: deviceId,
    stop() { this.stopCalls += 1; this.readyState = "ended"; },
    getSettings() { return { deviceId, width: 640, height: 480 }; },
    getCapabilities() { return {}; },
    async applyConstraints() {},
  };
}

function createStream(track = createTrack()) {
  return {
    getTracks() { return [track]; },
    getVideoTracks() { return [track]; },
  };
}

function createVideo() {
  return {
    srcObject: null,
    autoplay: false,
    muted: false,
    playsInline: false,
    style: { transform: "" },
    playCalls: 0,
    async play() { this.playCalls += 1; },
  };
}

test("preview follows committed stream changes and dispose does not stop tracks", async () => {
  const track = createTrack();
  const stream = createStream(track);
  const camera = new Camera({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  const video = createVideo();
  const preview = new VideoPreview(video, { mirror: true });

  preview.bind(camera);
  await camera.start();

  assert.equal(video.srcObject, stream);
  assert.equal(video.style.transform, "scaleX(-1)");
  assert.equal(video.autoplay, true);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);

  preview.dispose();
  assert.equal(video.srcObject, null);
  assert.equal(track.stopCalls, 0);
});

test("failed switch leaves preview on the previous stream", async () => {
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
  const video = createVideo();
  const preview = new VideoPreview(video);
  preview.bind(camera);

  await camera.start();
  await assert.rejects(() => camera.switch({ deviceId: "camera-b" }));
  assert.equal(video.srcObject, stream);
});

test("multiple previews can observe one camera", async () => {
  const stream = createStream();
  const camera = new Camera({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  const first = createVideo();
  const second = createVideo();
  new VideoPreview(first).bind(camera);
  new VideoPreview(second).bind(camera);
  await camera.start();
  assert.equal(first.srcObject, stream);
  assert.equal(second.srcObject, stream);
});

test("capture subpath imports safely without DOM access", async () => {
  const module = await import("../dist/capture/index.js");
  assert.equal(typeof module.CameraCapture, "function");
});

test("capture without active stream rejects INVALID_STATE", async () => {
  const camera = new Camera({ mediaDevices: { open: async () => createStream(), enumerateDevices: async () => [] } });
  const capture = new CameraCapture(camera, { backend: {} });
  await assert.rejects(() => capture.toBlob(), (error) => error.code === "INVALID_STATE");
});

test("capture borrows stream and disposes only its backend", async () => {
  const track = createTrack();
  const stream = createStream(track);
  const camera = new Camera({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  let capturedStream = null;
  let disposeCalls = 0;
  const backend = {
    async toBlob(input) {
      capturedStream = input;
      return { blob: new Blob(["x"], { type: "image/jpeg" }), width: 1, height: 1, type: "image/jpeg", timestamp: 1 };
    },
    async toImageData() { throw new Error("unused"); },
    async toImageBitmap() { throw new Error("unused"); },
    dispose() { disposeCalls += 1; },
  };
  const capture = new CameraCapture(camera, { backend });

  await camera.start();
  await capture.toBlob();
  capture.dispose();

  assert.equal(capturedStream, stream);
  assert.equal(disposeCalls, 1);
  assert.equal(track.stopCalls, 0);
});
