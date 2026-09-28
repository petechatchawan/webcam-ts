import test from "node:test";
import assert from "node:assert/strict";

import { Webcam, WebcamError } from "webcam-ts";
import {
  DeviceManager,
  PermissionService,
} from "webcam-ts/devices";
import { Controls } from "webcam-ts/controls";

function createTrack({ capabilities = {}, settings = {} } = {}) {
  return {
    stopCalls: 0,
    applyCalls: [],
    readyState: "live",
    label: "Webcam",
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
  const deviceInfo = {
    kind: "videoinput",
    deviceId: "camera-a",
    groupId: "group",
    label: "Front",
  };
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { openCalls += 1; return createStream(); },
      async enumerateDevices() {
        return [
          deviceInfo,
          { kind: "audioinput", deviceId: "mic", groupId: "group", label: "Mic" },
        ];
      },
    },
  });

  const devices = await manager.listDevices();
  assert.equal(openCalls, 0);
  assert.deepEqual(devices, [deviceInfo]);
  assert.equal(devices[0], deviceInfo);
  assert.equal(Object.isFrozen(devices), true);
});

test("device listing normalizes enumeration failures", async () => {
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { return createStream(); },
      async enumerateDevices() { throw new Error("enumeration failed"); },
    },
  });

  await assert.rejects(
    () => manager.listDevices(),
    (error) => error instanceof WebcamError && error.code === "UNKNOWN",
  );
});

test("browser enumeration failures do not use a stream-open error code", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        async enumerateDevices() { throw new Error("browser enumeration failed"); },
      },
    },
  });

  try {
    const manager = new DeviceManager();
    await assert.rejects(
      () => manager.listDevices(),
      (error) => error instanceof WebcamError && error.code === "UNKNOWN",
    );
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});

test("devicechange listener is shared and removed after last unsubscribe", async () => {
  let installs = 0;
  let removals = 0;
  let trigger = null;
  let publishedDevices = null;
  const deviceInfo = {
    kind: "videoinput",
    deviceId: "camera-a",
    groupId: "group",
    label: "Front",
  };
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { return createStream(); },
      async enumerateDevices() {
        return [
          deviceInfo,
          { kind: "audioinput", deviceId: "mic", groupId: "group", label: "Mic" },
        ];
      },
      subscribeDeviceChange(listener) {
        installs += 1;
        trigger = listener;
        return () => { removals += 1; };
      },
    },
  });

  const first = manager.subscribeToDeviceListChanges((devices) => { publishedDevices = devices; });
  const second = manager.subscribeToDeviceListChanges(() => {});
  assert.equal(installs, 1);
  trigger();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(publishedDevices, [deviceInfo]);
  first();
  assert.equal(removals, 0);
  second();
  assert.equal(removals, 1);
});

test("devicechange subscription can retry after installation fails", async () => {
  let installs = 0;
  let trigger = null;
  let notifications = 0;
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { return createStream(); },
      async enumerateDevices() { return []; },
      subscribeDeviceChange(listener) {
        installs += 1;
        if (installs === 1) throw new Error("listener installation failed");
        trigger = listener;
        return () => {};
      },
    },
  });

  assert.throws(
    () => manager.subscribeToDeviceListChanges(() => {}),
    (error) => error instanceof WebcamError && error.code === "UNKNOWN",
  );
  const unsubscribe = manager.subscribeToDeviceListChanges(() => { notifications += 1; });

  assert.equal(installs, 2);
  trigger();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notifications, 1);
  unsubscribe();
});

test("devicechange teardown errors are typed and can be retried", () => {
  let removals = 0;
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { return createStream(); },
      async enumerateDevices() { return []; },
      subscribeDeviceChange() {
        return () => {
          removals += 1;
          if (removals === 1) throw new Error("listener removal failed");
        };
      },
    },
  });
  const unsubscribe = manager.subscribeToDeviceListChanges(() => {});

  assert.throws(
    () => unsubscribe(),
    (error) => error instanceof WebcamError && error.code === "UNKNOWN",
  );
  unsubscribe();
  assert.equal(removals, 2);
});

test("unsupported Permissions API returns unsupported", async () => {
  const service = new PermissionService({
    permissions: null,
    mediaDevices: { open: async () => createStream(), enumerateDevices: async () => [] },
  });
  assert.deepEqual(await service.query(), { camera: "unsupported", microphone: "unsupported" });
});

test("successful permission request reports granted and cleans temporary stream", async () => {
  const track = createTrack();
  const service = new PermissionService({
    permissions: null,
    mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] },
  });

  const result = await service.request({ video: true, audio: false });
  assert.deepEqual(result, { camera: "granted", microphone: "unsupported" });
  assert.equal(track.stopCalls, 1);
});

test("permission request normalizes media port failures", async () => {
  const service = new PermissionService({
    permissions: null,
    mediaDevices: {
      async open() { throw new Error("permission request failed"); },
      async enumerateDevices() { return []; },
    },
  });

  await assert.rejects(
    () => service.request(),
    (error) => error instanceof WebcamError && error.code === "STREAM_OPEN_FAILED",
  );
});

test("permission request normalizes temporary stream cleanup failures", async () => {
  const track = createTrack();
  track.stop = () => { throw new Error("track cleanup failed"); };
  const service = new PermissionService({
    permissions: null,
    mediaDevices: {
      async open() { return createStream(track); },
      async enumerateDevices() { return []; },
    },
  });

  await assert.rejects(
    () => service.request(),
    (error) => error instanceof WebcamError && error.code === "UNKNOWN",
  );
});

test("controls reject unsupported zoom before applyConstraints", async () => {
  const track = createTrack({ capabilities: {} });
  const camera = new Webcam({ mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] } });
  await camera.start();
  const controls = new Controls(camera);

  await assert.rejects(() => controls.set({ zoom: 2 }), (error) => error.code === "CONTROL_UNSUPPORTED");
  assert.equal(track.applyCalls.length, 0);
  assert.equal(track.stopCalls, 0);
});

test("controls normalize capability read failures", async () => {
  const track = createTrack();
  const camera = new Webcam({ mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] } });
  await camera.start();
  track.getCapabilities = () => { throw new Error("capability read failed"); };
  const controls = new Controls(camera);

  assert.throws(
    () => controls.getCapabilities(),
    (error) => error instanceof WebcamError && error.code === "CONTROL_FAILED",
  );
});

test("control updates normalize capability read failures", async () => {
  const track = createTrack();
  const camera = new Webcam({ mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] } });
  await camera.start();
  track.getCapabilities = () => { throw new Error("capability read failed"); };
  const controls = new Controls(camera);

  await assert.rejects(
    () => controls.set({ zoom: 2 }),
    (error) => error instanceof WebcamError && error.code === "CONTROL_FAILED",
  );
});

test("controls apply validated values without owning the track", async () => {
  const track = createTrack({
    capabilities: { zoom: { min: 1, max: 4, step: 0.5 }, torch: true, focusMode: ["continuous"] },
    settings: { zoom: 1 },
  });
  const camera = new Webcam({ mediaDevices: { open: async () => createStream(track), enumerateDevices: async () => [] } });
  await camera.start();
  const controls = new Controls(camera);

  await controls.set({ zoom: 2, torch: true, focusMode: "continuous" });
  assert.deepEqual(track.applyCalls, [{ advanced: [{ zoom: 2, torch: true, focusMode: "continuous" }] }]);
  assert.equal(track.stopCalls, 0);
});

test("capability snapshot reuses a matching active track without opening or stopping it", async () => {
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
  const camera = new Webcam({ mediaDevices: port });
  const manager = new DeviceManager({ mediaDevices: port });
  await camera.start({ deviceId: "camera-a" });

  const result = await manager.snapshotCapabilities("camera-a", { webcam: camera });

  assert.equal(openCalls, 1);
  assert.equal(result.deviceId, "camera-a");
  assert.equal(result.capabilities.width.max, 1920);
  assert.equal(track.stopCalls, 0);
});

test("capability snapshot cleans an explicit temporary stream", async () => {
  const track = createTrack({
    capabilities: { width: { min: 320, max: 3840 } },
    settings: { deviceId: "camera-b", width: 1920, height: 1080 },
  });
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { return createStream(track); },
      async enumerateDevices() { return []; },
    },
  });

  const result = await manager.snapshotCapabilities("camera-b");

  assert.equal(result.capabilities.width.max, 3840);
  assert.equal(track.stopCalls, 1);
});

test("capability snapshot normalizes track inspection failures and stops its stream", async () => {
  const track = createTrack();
  track.getCapabilities = () => { throw new Error("capability inspection failed"); };
  const manager = new DeviceManager({
    mediaDevices: {
      async open() { return createStream(track); },
      async enumerateDevices() { return []; },
    },
  });

  await assert.rejects(
    () => manager.snapshotCapabilities("camera-a"),
    (error) => error instanceof WebcamError && error.code === "UNKNOWN",
  );
  assert.equal(track.stopCalls, 1);
});
