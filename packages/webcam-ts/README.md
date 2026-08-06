# webcam-ts

A framework-agnostic TypeScript library for deterministic webcam lifecycle management in modern browsers.

## Design

- Browser-focused with SSR-safe imports
- One `Camera` instance owns one active session
- Atomic `switch()` keeps the previous stream alive until the replacement is ready
- Latest switch wins; stale streams are always stopped
- `stop()` and `dispose()` preempt pending operations
- Preview, capture, devices, permissions, and controls are separate services
- No framework or runtime dependency

## Install

```bash
npm install webcam-ts
```

## Start and switch cameras

```ts
import { Camera } from "webcam-ts";

const camera = new Camera();

await camera.start({
  facingMode: "user",
  resolution: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
});

await camera.switch({
  facingMode: "environment",
});

await camera.stop();
await camera.dispose();
```

`start()` is valid only while idle. Use `switch()` to replace an active camera. A failed switch leaves the previous stream running.

## Preview

```ts
import { VideoPreview } from "webcam-ts/preview";

const preview = new VideoPreview(videoElement, {
  mirror: true,
});

preview.bind(camera);
preview.setMirror(false);
preview.dispose();
```

`VideoPreview` borrows the active stream. Disposing a preview never stops camera tracks.

## Capture

```ts
import { CameraCapture } from "webcam-ts/capture";

const capture = new CameraCapture(camera);
const photo = await capture.toBlob({
  type: "image/jpeg",
  quality: 0.92,
});

await upload(photo.blob);
capture.dispose();
```

Capture results do not create Object URLs or Base64 strings implicitly. The consumer controls those allocations and their cleanup.

## Devices and permissions

```ts
import {
  CameraDeviceManager,
  CameraPermissionService,
} from "webcam-ts/devices";

const devices = new CameraDeviceManager();
const cameras = await devices.list();

// Explicit probing: reuses the active track when it matches, otherwise
// opens a temporary stream and always cleans it up.
const capabilities = await devices.probe(cameras[0].deviceId, { camera });

const permissions = new CameraPermissionService();
const state = await permissions.request({ video: true });
```

Device listing never opens a temporary stream. Capability probing is explicit and never invents unsupported resolution values. Permission querying reports `unsupported` or `unknown` explicitly when the browser cannot provide reliable information.

## Controls

```ts
import { CameraControls } from "webcam-ts/controls";

const controls = new CameraControls(camera);
await controls.set({
  zoom: 2,
  torch: true,
  focusMode: "continuous",
});
```

Controls validate active-track capabilities before applying constraints.

## State and events

```ts
const unsubscribe = camera.subscribe((event) => {
  if (event.type === "state-changed") {
    console.log(event.state.status);
  }
});

const state = camera.getState(); // immutable snapshot
unsubscribe();
```

Consumer listener exceptions are isolated and cannot change camera operation results.

## SSR behavior

```ts
import { Camera } from "webcam-ts";

const camera = new Camera(); // safe during SSR
await camera.start();        // rejects with UNSUPPORTED_RUNTIME outside a browser
```

The package does not access `window`, `document`, or `navigator` during module initialization.

## Testing

```ts
import {
  FakeMediaDevicesPort,
  FakeMediaStream,
} from "webcam-ts/testing";

const mediaDevices = new FakeMediaDevicesPort();
mediaDevices.enqueueStream(new FakeMediaStream() as unknown as MediaStream);
const camera = new Camera({ mediaDevices });
```

## License

MIT
