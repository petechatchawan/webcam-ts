import test from "node:test";
import assert from "node:assert/strict";

import { Webcam, WebcamError } from "webcam-ts";
import { Preview } from "webcam-ts/preview";
import { CanvasFrameEncoder, Capture } from "webcam-ts/capture";

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

async function withCaptureDom(operation, { failDispose = false } = {}) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const context = {
    setTransform() {},
    clearRect() {},
    drawImage() {},
    getImageData() { throw new Error("pixel read failed"); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return context; },
    toBlob(callback) { callback(null); },
  };
  let attachedStream = null;
  const video = {
    get srcObject() { return attachedStream; },
    set srcObject(value) {
      if (failDispose && value === null) throw new Error("video cleanup failed");
      attachedStream = value;
    },
    readyState: 2,
    videoWidth: 2,
    videoHeight: 2,
    addEventListener() {},
    removeEventListener() {},
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (name) => name === "video" ? video : canvas },
  });
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => { throw new Error("bitmap creation failed"); },
  });

  try {
    await operation();
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
    if (originalCreateImageBitmap) {
      Object.defineProperty(globalThis, "createImageBitmap", originalCreateImageBitmap);
    } else {
      delete globalThis.createImageBitmap;
    }
  }
}

test("preview follows committed stream changes and dispose does not stop tracks", async () => {
  const track = createTrack();
  const stream = createStream(track);
  const camera = new Webcam({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  const video = createVideo();
  const preview = new Preview(video, { mirror: true });

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

test("failed replacement start leaves preview on the previous stream", async () => {
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
  const video = createVideo();
  const preview = new Preview(video);
  preview.bind(camera);

  await camera.start();
  await assert.rejects(() => camera.start({ deviceId: "camera-b" }));
  assert.equal(video.srcObject, stream);
});

test("blocked autoplay still assigns the stream to the video element", async () => {
  const stream = createStream();
  const camera = new Webcam({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  const video = createVideo();
  video.play = async () => { throw Object.assign(new Error("play blocked"), { name: "NotAllowedError" }); };
  const preview = new Preview(video);

  preview.bind(camera);
  await camera.start();
  await Promise.resolve();

  assert.equal(video.srcObject, stream);
  preview.dispose();
});

test("multiple previews can observe one camera", async () => {
  const stream = createStream();
  const camera = new Webcam({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  const first = createVideo();
  const second = createVideo();
  new Preview(first).bind(camera);
  new Preview(second).bind(camera);
  await camera.start();
  assert.equal(first.srcObject, stream);
  assert.equal(second.srcObject, stream);
});

test("capture subpath imports safely without DOM access", async () => {
  const module = await import("webcam-ts/capture");
  assert.equal(typeof module.Capture, "function");
});

test("capture without active stream rejects INVALID_STATE", async () => {
  const camera = new Webcam({ mediaDevices: { open: async () => createStream(), enumerateDevices: async () => [] } });
  const capture = new Capture(camera, { encoder: {} });
  await assert.rejects(() => capture.toBlob(), (error) => error.code === "INVALID_STATE");
});

test("capture borrows stream and disposes only its encoder", async () => {
  const track = createTrack();
  const stream = createStream(track);
  const camera = new Webcam({ mediaDevices: { open: async () => stream, enumerateDevices: async () => [] } });
  let capturedStream = null;
  let disposeCalls = 0;
  const encoder = {
    async toBlob(input) {
      capturedStream = input;
      return { blob: new Blob(["x"], { type: "image/jpeg" }), width: 1, height: 1, type: "image/jpeg", timestamp: 1 };
    },
    async toImageData() { throw new Error("unused"); },
    async toImageBitmap() { throw new Error("unused"); },
    dispose() { disposeCalls += 1; },
  };
  const capture = new Capture(camera, { encoder });

  await camera.start();
  await capture.toBlob();
  capture.dispose();

  assert.equal(capturedStream, stream);
  assert.equal(disposeCalls, 1);
  assert.equal(track.stopCalls, 0);
});

test("capture normalizes encoder disposal failures and can retry disposal", () => {
  let disposeCalls = 0;
  const encoder = {
    async toBlob() { throw new Error("unused"); },
    async toImageData() { throw new Error("unused"); },
    async toImageBitmap() { throw new Error("unused"); },
    dispose() {
      disposeCalls += 1;
      if (disposeCalls === 1) throw new Error("encoder cleanup failed");
    },
  };
  const capture = new Capture(new Webcam(), { encoder });

  assert.throws(
    () => capture.dispose(),
    (error) => error instanceof WebcamError && error.code === "CAPTURE_FAILED",
  );
  capture.dispose();
  assert.equal(disposeCalls, 2);
});

test("preview normalizes DOM errors from public methods", () => {
  const video = createVideo();
  Object.defineProperty(video, "srcObject", {
    configurable: true,
    get() { return null; },
    set() { throw new Error("preview attachment failed"); },
  });
  const preview = new Preview(video);

  assert.throws(
    () => preview.bind(new Webcam()),
    (error) => error instanceof WebcamError && error.code === "PREVIEW_FAILED",
  );
});

test("canvas encoder normalizes blob encoding errors", async () => {
  await withCaptureDom(async () => {
    const encoder = new CanvasFrameEncoder();
    await assert.rejects(
      () => encoder.toBlob(createStream()),
      (error) => error instanceof WebcamError && error.code === "CAPTURE_FAILED",
    );
    encoder.dispose();
  });
});

test("canvas encoder normalizes image data read errors", async () => {
  await withCaptureDom(async () => {
    const encoder = new CanvasFrameEncoder();
    await assert.rejects(
      () => encoder.toImageData(createStream()),
      (error) => error instanceof WebcamError && error.code === "CAPTURE_FAILED",
    );
    encoder.dispose();
  });
});

test("canvas encoder normalizes image bitmap creation errors", async () => {
  await withCaptureDom(async () => {
    const encoder = new CanvasFrameEncoder();
    await assert.rejects(
      () => encoder.toImageBitmap(createStream()),
      (error) => error instanceof WebcamError && error.code === "CAPTURE_FAILED",
    );
    encoder.dispose();
  });
});

test("canvas encoder normalizes disposal errors", async () => {
  await withCaptureDom(async () => {
    const encoder = new CanvasFrameEncoder();
    await assert.rejects(
      () => encoder.toImageData(createStream()),
      (error) => error instanceof WebcamError && error.code === "CAPTURE_FAILED",
    );
    assert.throws(
      () => encoder.dispose(),
      (error) => error instanceof WebcamError && error.code === "CAPTURE_FAILED",
    );
  }, { failDispose: true });
});
