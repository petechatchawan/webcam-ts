import test from "node:test";
import assert from "node:assert/strict";

import { Camera } from "../dist/index.js";
import {
  CameraDeviceManager,
  CameraPermissionService,
} from "../dist/devices/index.js";
import { CameraControls } from "../dist/controls/index.js";

function createTrack({ capabilities = {}, settings = {} } = {}) {
  return {
    stopCalls: 0,
    applyCalls: [],
    readyState: "live",
    label: "Camera",
    stop() { this.stopCalls += 1; this.readyState = "ended"; },
    getSettings() { return { deviceId: "camera-a", ...settings }; },
    getCapabilities() { return capabilities; },
    async applyConstraints(value) { this.applyCalls.push(value); },
  };
}

function createStream(track = createTrack()) {
  return {
    getTracks() { return [track]; },
    getVideoTracks() { return [track]; },
  };
}

test("device listing never opens a media stream", async () => {
  let openCalls = 0;
  const manager = new CameraDeviceManager({
    mediaDevices: {
      async open() { openCalls += 1; return createStream(); },
      async enumerateDevices() {
        return [
          { kind: "videoinput", deviceId: "camera-a", groupId: "group", label: "Front" },
          { kind: "audioinput", deviceId: "mic", groupId: "group", label: "Mic" },
        ];
      },
    },
  });

  const devices = await manager.list();
  assert.equal(openCalls, 0);
  assert.deepEqual(devices, [{ deviceId: "camera-a", groupId: "group", label: "Front" }]);
});

test("devicechange listener is shared and removed after last unsubscribe", async () => {
  let installs = 0;
  let removals = 0;
  let trigger = null;
  const manager = new CameraDeviceManager({
    mediaDevices: {
      async open() { return createStream(); },
      async enumerateDevices() { return []; },
      subscribeDeviceChange(listener) {
        installs += 1;
        trigger = listener;
        return () => { removals += 1; };
      },
    },
  });

  const first = manager.subscribe(() => {});
  const second = manager.subscribe(() => {});
  assert.equal(installs, 1);
  await trigger();
  first();
  assert.equal(removals, 0);
  second();
  assert.equal(removals, 1);
});

test("unsupported Permissions API returns unsupported", async () => {
  const service = new CameraPermissionService({
    permissions: null,
    mediaDevices: { open: async () => createStream(), enumerateDevices: async () => [] },
  });
  assert.deepEqual(await service.query(), { camera: "unsupported", microphone: "unsupported" });
});

test("successful permission request reports granted and cleans temporary stream", async () => {
  const track = createTrack();
  const service = new CameraPermissionService({
    permissions: null,
    mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] },
  });

  const result = await service.request({ video: true, audio: false });
  assert.deepEqual(result, { camera: "granted", microphone: "unsupported" });
  assert.equal(track.stopCalls, 1);
});

test("controls reject unsupported zoom before applyConstraints", async () => {
  const track = createTrack({ capabilities: {} });
  const camera = new Camera({ mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] } });
  await camera.start();
  const controls = new CameraControls(camera);

  await assert.rejects(() => controls.set({ zoom: 2 }), (error) => error.code === "CONTROL_UNSUPPORTED");
  assert.equal(track.applyCalls.length, 0);
  assert.equal(track.stopCalls, 0);
});

test("controls apply validated values without owning the track", async () => {
  const track = createTrack({
    capabilities: { zoom: { min: 1, max: 4, step: 0.5 }, torch: true, focusMode: ["continuous"] },
    settings: { zoom: 1 },
  });
  const camera = new Camera({ mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] } });
  await camera.start();
  const controls = new CameraControls(camera);

  await controls.set({ zoom: 2, torch: true, focusMode: "continuous" });
  assert.deepEqual(track.applyCalls, [{ advanced: [{ zoom: 2, torch: true, focusMode: "continuous" }] }]);
  assert.equal(track.stopCalls, 0);
});

test("capability probe reuses a matching active track without opening or stopping it", async () => {
  const track = createTrack({
    capabilities: { width: { min: 320, max: 1920 } },
    settings: { deviceId: "camera-a", width: 1280, height: 720 },
  });
  const stream = createStream(track);
  let openCalls = 0;
  const port = {
    async open() { openCalls += 1; return stream; },
    async enumerateDevices() { return []; },
  };
  const camera = new Camera({ mediaDevices: port });
  const manager = new CameraDeviceManager({ mediaDevices: port });
  await camera.start({ deviceId: "camera-a" });

  const result = await manager.probe("camera-a", { camera });

  assert.equal(openCalls, 1);
  assert.equal(result.deviceId, "camera-a");
  assert.equal(result.capabilities.width.max, 1920);
  assert.equal(track.stopCalls, 0);
});

test("capability probe cleans an explicit temporary stream", async () => {
  const track = createTrack({
    capabilities: { width: { min: 320, max: 3840 } },
    settings: { deviceId: "camera-b", width: 1920, height: 1080 },
  });
  const manager = new CameraDeviceManager({
    mediaDevices: {
      async open() { return createStream(track); },
      async enumerateDevices() { return []; },
    },
  });

  const result = await manager.probe("camera-b");

  assert.equal(result.capabilities.width.max, 3840);
  assert.equal(track.stopCalls, 1);
});
