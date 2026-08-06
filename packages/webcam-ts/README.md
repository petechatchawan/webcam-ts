# webcam-ts

A framework-agnostic, SSR-safe TypeScript camera library for modern browsers.

## Demo

**https://petechatchawan.github.io/webcam-ts/**

The demo is a Vanilla TypeScript consumer that imports only public package entrypoints.

## Install

```bash
npm install webcam-ts
```

## Start a camera

```ts
import { Camera } from "webcam-ts";
import { VideoPreview } from "webcam-ts/preview";

const camera = new Camera();
const preview = new VideoPreview(document.querySelector("video")!, {
  mirror: true,
});
preview.bind(camera);

await camera.start({
  facingMode: "user",
  resolution: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
});
```

## Switch atomically

```ts
await camera.switch({ deviceId: "external-camera-id" });
```

A failed switch preserves the previous active stream. Concurrent switches use latest-command-wins, while `stop()` and `dispose()` preempt pending operations.

## Capture

```ts
import { CameraCapture } from "webcam-ts/capture";

const capture = new CameraCapture(camera);
const result = await capture.toBlob({
  type: "image/jpeg",
  quality: 0.92,
});
```

## Devices and controls

```ts
import {
  CameraDeviceManager,
  CameraPermissionService,
} from "webcam-ts/devices";
import { CameraControls } from "webcam-ts/controls";

const devices = await new CameraDeviceManager().list();
const permissions = await new CameraPermissionService().query();
const controls = new CameraControls(camera);
```

## Runtime contract

- Browser-focused with SSR-safe imports and construction.
- One `Camera` instance owns at most one active session.
- `CameraSession` is the sole owner of active and candidate streams.
- Preview, capture, device, permission, and control services remain separate.
- Errors, state snapshots, and events are typed.

The v4 alpha intentionally has no v3 compatibility facade.
