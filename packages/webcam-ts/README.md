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
import { CameraPreview } from "webcam-ts/preview";

const camera = new Camera();
const preview = new CameraPreview(document.querySelector("video")!, {
	mirror: true,
});
preview.bind(camera);

await camera.start({ facingMode: "user" });
```

## Replace atomically

```ts
await camera.start({ deviceId: "external-camera-id" });
```

Calling `start()` while active replaces the stream atomically. A failed replacement preserves the previous active stream. `stop()` and `dispose()` preempt a pending start.

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
import { CameraDeviceManager, CameraPermissionService } from "webcam-ts/devices";
import { CameraControls } from "webcam-ts/controls";

const devices = await new CameraDeviceManager().list();
const permissions = await new CameraPermissionService().query();
const controls = new CameraControls(camera);
const capabilities = await new CameraDeviceManager().snapshotCapabilities("camera-id");
```

## Events

```ts
const unsubscribe = camera.subscribe((event) => {
	if (event.type === "state-changed") console.log(event.state.status);
});
unsubscribe();
```

## Errors

```ts
import { Camera, CameraError } from "webcam-ts";

try {
	await camera.start({ deviceId: "external-camera-id" });
} catch (error) {
	if (error instanceof CameraError) console.log(error.code, error.recoverable);
}
```

## Runtime contract

- Browser-focused with SSR-safe imports and construction.
- One `Camera` instance owns at most one active session.
- `Camera` is the sole owner of active and candidate streams.
- Preview, capture, device, permission, and control services remain separate.
- Errors, state snapshots, and events are typed.

The v4 alpha intentionally has no v3 compatibility facade.
