# webcam-ts

A framework-agnostic, SSR-safe TypeScript library for browser webcam sessions.

## Demo

**https://petechatchawan.github.io/webcam-ts/**

The demo is a Vanilla TypeScript consumer that imports only public package
entrypoints.

## Install

```sh
npm install webcam-ts
```

## Public entrypoints

The package keeps the browser APIs close to their platform names and groups
services by entrypoint. Type-only exports are listed after the runtime APIs.
The root entrypoint uses `Webcam` for the core session and its domain types;
subpaths use concise names because the import path already provides the
scope, such as `Preview` from `webcam-ts/preview` and `Capture` from
`webcam-ts/capture`.
The previous `Webcam`-prefixed service names are not exported as compatibility
aliases; use the names listed below.

| Import               | Runtime APIs                                                                                                                                                               | Types                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webcam-ts`          | `Webcam`, `WebcamError`, `buildMediaStreamConstraints`                                                                                                                     | `WebcamOptions`, `WebcamRequest`, `ConstraintNumber`, `ConstraintString`, `WebcamState`, `WebcamStatus`, `WebcamEvent`, `WebcamEventListener`, `WebcamOperation`, `WebcamErrorCode`, `WebcamErrorOptions`, `WebcamErrorSnapshot`, `MediaDevicesPort` |
| `webcam-ts/preview`  | `Preview`                                                                                                                                                                  | `PreviewOptions`                                                                                                                                                                                                                                     |
| `webcam-ts/capture`  | `Capture`, `CanvasFrameEncoder`                                                                                                                                            | `CaptureOptions`, `FrameEncoder`, `CropRegion`, `CaptureFrameOptions`, `CaptureBlobOptions`, `CapturedBlob`, `CapturedImageData`, `CapturedImageBitmap`                                                                                              |
| `webcam-ts/devices`  | `DeviceManager`, `PermissionService`                                                                                                                                       | `DeviceCapabilityInfo`, `DeviceCapabilityInfoOptions`, `DeviceManagerOptions`, `DeviceListChangeListener`, `MediaPermissionState`, `PermissionMap`, `PermissionRequest`, `PermissionServiceOptions`                                                  |
| `webcam-ts/controls` | `Controls`                                                                                                                                                                 | `ControlUpdate`                                                                                                                                                                                                                                      |
| `webcam-ts/testing`  | `FakeMediaStreamTrack`, `FakeMediaStream`, `FakeMediaDevicesPort`, `EventHub`, `assertCommandAllowed`, `stopStream`, `BrowserMediaDevicesAdapter`, `normalizeBrowserError` | No additional type-only exports                                                                                                                                                                                                                      |

The testing subpath is for tests and low-level integrations. Most applications
only need the root, preview, capture, devices, and controls entrypoints.

## Start, inspect, stop, and dispose

Create a Webcam, bind an optional video preview, then start a session. A Webcam
owns its active stream; preview and capture borrow it.

```ts
import { Webcam, type WebcamState, type WebcamStatus } from "webcam-ts";
import { Preview } from "webcam-ts/preview";

const video = document.querySelector<HTMLVideoElement>("#preview");
if (!video) throw new Error("Missing preview video element");

const webcam = new Webcam();
const preview = new Preview(video, { mirror: true });
preview.bind(webcam);

const stateChanged = webcam.subscribe((event) => {
	if (event.type === "state-changed") {
		const state: WebcamState = event.state;
		console.log(state.status, state.deviceId, state.settings);
	}
});

try {
	await webcam.start({
		facingMode: "user",
		resolution: {
			width: { ideal: 1280 },
			height: { ideal: 720 },
		},
	});

	console.log(webcam.getState());
	const status: WebcamStatus = webcam.getState().status;
	console.log(status);
	console.log(webcam.getActiveStream());
	console.log(webcam.getActiveTrack()?.getSettings());
	await webcam.stop();
} finally {
	stateChanged();
	preview.dispose();
	await webcam.dispose();
}
```

Webcam.start accepts a WebcamRequest and returns a Promise. Calling start while
active replaces the stream atomically; if replacement fails, the previous
session stays active. stop and dispose preempt a pending start. dispose is
permanent; later start or stop calls reject with WebcamError code DISPOSED.

getState returns an immutable WebcamState with status, sessionId, deviceId,
trackLabel, settings, capabilities, startedAt, and lastError. WebcamStatus can
be idle, starting, active, stopping, or disposed.

### Build and validate a request

WebcamRequest supports deviceId, facingMode, resolution, frameRate, audio, and
AbortSignal. Numeric constraints may be a number or an object with min, max,
ideal, and exact. String constraints may use ideal or exact.

```ts
import {
	Webcam,
	buildMediaStreamConstraints,
	type ConstraintNumber,
	type ConstraintString,
	type WebcamRequest,
} from "webcam-ts";

const width: ConstraintNumber = { ideal: 1280, max: 1920 };
const facingMode: ConstraintString = { ideal: "environment" };
const controller = new AbortController();

const request: WebcamRequest = {
	facingMode,
	resolution: { width, height: { ideal: 720 } },
	frameRate: { ideal: 30, max: 60 },
	audio: false,
	signal: controller.signal,
};

const browserConstraints: MediaStreamConstraints = buildMediaStreamConstraints(request);
console.log(browserConstraints.video);

const exactDeviceRequest: WebcamRequest = {
	deviceId: "external-camera-id",
	audio: false,
};
console.log(buildMediaStreamConstraints(exactDeviceRequest).video);

const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-camera");
if (!cancelButton) throw new Error("Missing cancel button");
const webcam = new Webcam();
const starting = webcam.start(request);
const cancelStart = () => controller.abort();
cancelButton.addEventListener("click", cancelStart, { once: true });
try {
	await starting;
} catch (error) {
	console.log("start ended", error);
} finally {
	cancelButton.removeEventListener("click", cancelStart);
	await webcam.dispose();
}
```

A deviceId is requested as an exact match. An exact deviceId cannot be combined
with an exact facingMode. Use ideal constraints when the browser may choose a
nearby supported value. buildMediaStreamConstraints validates and converts the
request without opening a stream.

Call controller.abort from a cancel action while start is pending. The browser's
permission prompt may still need to settle; if a stream arrives after the
operation was aborted, Webcam releases that candidate stream.

Set audio to a MediaTrackConstraints object, such as
{ echoCancellation: true }, when the Webcam session should also request a
microphone.

### Observe lifecycle events

Webcam.subscribe returns an unsubscribe function. WebcamEventListener receives
a WebcamEvent union:

- state-changed includes the new WebcamState.
- stream-changed includes the new stream, previous stream, and reason.
- operation-started and operation-completed include operation and operationId.
- operation-failed and session-ended include a WebcamError.

```ts
import { Webcam, type WebcamEvent, type WebcamEventListener } from "webcam-ts";

const webcam = new Webcam();

const onEvent: WebcamEventListener = (event: WebcamEvent) => {
	switch (event.type) {
		case "state-changed":
			console.log("status", event.state.status);
			break;
		case "stream-changed":
			console.log("stream change", event.reason, event.stream);
			break;
		case "operation-started":
		case "operation-completed":
			console.log(event.operation, event.operationId);
			break;
		case "operation-failed":
		case "session-ended":
			console.error(event.error.code, event.error.message);
			break;
	}
};

const unsubscribe = webcam.subscribe(onEvent);
try {
	await webcam.start();
} finally {
	unsubscribe();
	await webcam.dispose();
}
```

### Use a custom media port

WebcamOptions accepts a MediaDevicesPort so an application can supply its own
browser adapter or a fake in tests. The optional clock and session ID functions
are useful for deterministic tests.

```ts
import { Webcam, type MediaDevicesPort, type WebcamOptions } from "webcam-ts";

const mediaDevices: MediaDevicesPort = {
	open: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
	enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
	subscribeDeviceChange(listener) {
		navigator.mediaDevices.addEventListener("devicechange", listener);
		return () => navigator.mediaDevices.removeEventListener("devicechange", listener);
	},
};

let time = 100;
const options: WebcamOptions = {
	mediaDevices,
	now: () => time++,
	createSessionId: () => "test-session",
};

const webcam = new Webcam(options);
```

## Preview

Preview attaches a Webcam stream to an HTMLVideoElement. It does not own
or stop the stream. Its methods let an application bind, detach, switch the
video element, change mirroring, and dispose the preview.

```ts
import { Webcam } from "webcam-ts";
import { Preview, type PreviewOptions } from "webcam-ts/preview";

const video = document.querySelector<HTMLVideoElement>("#preview");
const secondVideo = document.querySelector<HTMLVideoElement>("#second-preview");
if (!video || !secondVideo) throw new Error("Missing preview video element");

const options: PreviewOptions = {
	autoplay: true,
	muted: true,
	playsInline: true,
	mirror: true,
};
const webcam = new Webcam();
const preview = new Preview(video, options);

try {
	await webcam.start();
	preview.bind(webcam);
	preview.setMirror(false);
	preview.setElement(secondVideo);
	preview.detach();
	preview.bind(webcam);
} finally {
	preview.dispose();
	await webcam.dispose();
}
```

## Capture

Capture borrows the active stream and delegates frame encoding to a
FrameEncoder. The default encoder is CanvasFrameEncoder. Disposing the capture
releases its encoder; it does not stop the Webcam stream.

```ts
import {
	CanvasFrameEncoder,
	Capture,
	type CaptureBlobOptions,
	type CaptureFrameOptions,
	type CapturedBlob,
	type CapturedImageData,
	type CapturedImageBitmap,
	type CropRegion,
	type FrameEncoder,
	type CaptureOptions,
} from "webcam-ts/capture";
import { Webcam } from "webcam-ts";

const webcam = new Webcam();
await webcam.start();
const encoder: FrameEncoder = new CanvasFrameEncoder();
const captureOptions: CaptureOptions = { encoder };
const capture = new Capture(webcam, captureOptions);

const crop: CropRegion = { x: 0, y: 0, width: 640, height: 480 };
const frameOptions: CaptureFrameOptions = {
	crop,
	scale: 0.5,
	mirror: true,
};
const blobOptions: CaptureBlobOptions = {
	...frameOptions,
	type: "image/webp",
	quality: 0.9,
};

try {
	const blob: CapturedBlob = await capture.toBlob(blobOptions);
	const pixels: CapturedImageData = await capture.toImageData(frameOptions);
	const bitmap: CapturedImageBitmap = await capture.toImageBitmap(frameOptions);

	console.log(blob.blob, blob.width, blob.height, blob.type, blob.timestamp);
	console.log(pixels.imageData, bitmap.imageBitmap);
} finally {
	capture.dispose();
	await webcam.dispose();
}
```

CaptureFrameOptions applies scale, mirror, and an optional crop rectangle in
source-frame pixels. CaptureBlobOptions adds image/jpeg, image/png, or
image/webp and an optional quality from 0 to 1.

CanvasFrameEncoder can also be used directly with a borrowed active stream:

```ts
import { Webcam } from "webcam-ts";
import { CanvasFrameEncoder } from "webcam-ts/capture";

const webcam = new Webcam();
await webcam.start();
const stream = webcam.getActiveStream();
if (!stream) throw new Error("Start the Webcam before capturing");

const encoder = new CanvasFrameEncoder();
try {
	const frame = await encoder.toBlob(stream, {
		type: "image/jpeg",
		quality: 0.92,
	});
	console.log(frame.blob);
} finally {
	encoder.dispose();
	await webcam.dispose();
}
```

Use Capture for the usual flow because it checks that the Webcam is
active and manages the encoder lifetime. toImageBitmap requires browser support
for createImageBitmap.

## Devices

DeviceManager lists browser MediaDeviceInfo records, subscribes to device-list
changes, and can inspect a device's settings and capabilities. listDevices
returns only video input devices and does not open a stream. When the requested
device is not already active on the supplied Webcam, snapshotCapabilities opens
a temporary stream and stops it before returning.

```ts
import {
	DeviceManager,
	type DeviceCapabilityInfo,
	type DeviceCapabilityInfoOptions,
	type DeviceListChangeListener,
	type DeviceManagerOptions,
} from "webcam-ts/devices";
import { Webcam, type MediaDevicesPort } from "webcam-ts";

const mediaDevices: MediaDevicesPort = {
	open: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
	enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
	subscribeDeviceChange(listener) {
		navigator.mediaDevices.addEventListener("devicechange", listener);
		return () => navigator.mediaDevices.removeEventListener("devicechange", listener);
	},
};
const managerOptions: DeviceManagerOptions = { mediaDevices };
const manager = new DeviceManager(managerOptions);
const webcam = new Webcam();
await webcam.start();
const onDeviceListChange: DeviceListChangeListener = (devices) => {
	console.log("video devices", devices);
};
const unsubscribe = manager.subscribeToDeviceListChanges(onDeviceListChange);

const devices = await manager.listDevices();
const device = devices[0];

if (device) {
	const controller = new AbortController();
	const options: DeviceCapabilityInfoOptions = {
		webcam,
		signal: controller.signal,
	};
	const info: DeviceCapabilityInfo = await manager.snapshotCapabilities(device.deviceId, options);

	console.log(info.deviceId, info.label);
	console.log(info.settings, info.capabilities);
}

unsubscribe();
manager.dispose();
await webcam.dispose();
```

DeviceCapabilityInfo contains deviceId, label, settings, and capabilities.
Pass an AbortSignal in DeviceCapabilityInfoOptions to cancel a capability
probe. The returned MediaDeviceInfo values are the browser's records; webcam-ts
does not create a duplicate device wrapper.

## Permissions

PermissionService.query reads permission state where the browser Permissions
API supports it. It does not prompt the user. request opens a temporary stream
to trigger the browser permission flow, stops that stream, and returns the
resulting PermissionMap.

```ts
import {
	PermissionService,
	type MediaPermissionState,
	type PermissionMap,
	type PermissionRequest,
	type PermissionServiceOptions,
} from "webcam-ts/devices";

const options: PermissionServiceOptions = {
	permissions: navigator.permissions,
	mediaDevices: {
		open: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
		enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
	},
};
const permissions = new PermissionService(options);

const current: PermissionMap = await permissions.query();
const cameraState: MediaPermissionState = current.camera;
console.log(current.camera, current.microphone);

if (current.camera !== "granted") {
	const request: PermissionRequest = { video: true, audio: false };
	const result = await permissions.request(request);
	console.log(result.camera);
}
```

With no Permissions API, query returns unsupported. Browsers may also return
unknown when a permission query is unavailable or rejected. PermissionService
defaults to requesting video only; set audio to true for microphone access.
At least one of video or audio must be requested.

## Camera controls

The `Controls` service reads supported track capabilities and applies torch, zoom, and
focusMode constraints to the active track. Unsupported controls reject with
WebcamError code CONTROL_UNSUPPORTED.

```ts
import { Controls, type ControlUpdate } from "webcam-ts/controls";
import { Webcam } from "webcam-ts";

const webcam = new Webcam();
await webcam.start();
const controls = new Controls(webcam);
const capabilities = controls.getCapabilities();

const update: ControlUpdate = {
	...(capabilities.zoom ? { zoom: capabilities.zoom.min } : {}),
	...(capabilities.torch ? { torch: true } : {}),
	...(capabilities.focusMode?.includes("continuous") ? { focusMode: "continuous" } : {}),
};

if (Object.keys(update).length > 0) {
	const settings: Readonly<MediaTrackSettings> = await controls.set(update);
	console.log(settings);
}
await webcam.dispose();
```

## Errors

Operations throw WebcamError. Inspect code, operation, recoverable, context,
and cause instead of relying on browser-specific error names.

```ts
import {
	Webcam,
	WebcamError,
	type WebcamErrorCode,
	type WebcamErrorOptions,
	type WebcamErrorSnapshot,
	type WebcamOperation,
} from "webcam-ts";

const webcam = new Webcam();

try {
	await webcam.start({ deviceId: "external-camera-id" });
} catch (error) {
	if (error instanceof WebcamError) {
		const code: WebcamErrorCode = error.code;
		const operation: WebcamOperation | undefined = error.operation;
		const snapshot: WebcamErrorSnapshot = error.toSnapshot();
		console.error(code, operation, error.recoverable, error.context, snapshot);
	}
}

// WebcamErrorOptions describes the constructor contract for custom adapters.
const options: WebcamErrorOptions = {
	code: "DEVICE_BUSY",
	operation: "start",
	recoverable: true,
	context: { deviceId: "external-camera-id" },
};
const customError = new WebcamError("The device is busy", options);
```

WebcamErrorSnapshot is a readonly, serializable view; it does not include cause.
Common WebcamErrorCode values include INVALID_REQUEST, INVALID_STATE, DISPOSED,
PERMISSION_DENIED, DEVICE_NOT_FOUND, DEVICE_BUSY, CONSTRAINT_UNSATISFIED,
SECURITY_RESTRICTION, OPERATION_ABORTED, STREAM_OPEN_FAILED, STREAM_INVALID,
TRACK_ENDED, CONTROL_UNSUPPORTED, CONTROL_FAILED, PREVIEW_FAILED,
CAPTURE_FAILED, UNSUPPORTED_RUNTIME, UNSUPPORTED_BROWSER, and UNKNOWN.
WebcamOperation is start, stop, or dispose.

## Testing and low-level adapters

Import these helpers from webcam-ts/testing. FakeMediaStreamTrack and
FakeMediaStream implement only the browser surface used by webcam-ts, so they
are intended for tests.

```ts
import { Webcam } from "webcam-ts";
import {
	assertCommandAllowed,
	BrowserMediaDevicesAdapter,
	FakeMediaDevicesPort,
	FakeMediaStream,
	FakeMediaStreamTrack,
	normalizeBrowserError,
	stopStream,
	EventHub,
} from "webcam-ts/testing";

const track = new FakeMediaStreamTrack("test webcam");
track.setSettings({ deviceId: "test-device", width: 640, height: 480 });
console.log(track.getSettings(), track.getCapabilities());
await track.applyConstraints({ width: 640 });
console.log(track.applyConstraintsCalls, track.stopCalls);
track.stop();
console.log(track.readyState);

const fakeStream = new FakeMediaStream(track);
console.log(fakeStream.videoTrack, fakeStream.getTracks(), fakeStream.getVideoTracks());

const port = new FakeMediaDevicesPort();
port.setDevices([]);
port.enqueueStream();
const stream = await port.open({ video: true, audio: false });
console.log(await port.enumerateDevices());

const stopListening = port.subscribeDeviceChange(() => {
	console.log("fake devicechange");
});
port.emitDeviceChange();
stopListening();

port.enqueueOpen(async () => stream);
await port.open({ video: true, audio: false });

port.enqueueError(new Error("simulated media failure"));
try {
	await port.open({ video: true, audio: false });
} catch (error) {
	console.log("expected fake failure", error);
}

const fakeWebcam = new Webcam({ mediaDevices: port });
assertCommandAllowed("idle", "start");

const eventHub = new EventHub();
const unsubscribe = eventHub.subscribe((event) => console.log(event.type));
eventHub.emit({ type: "state-changed", state: fakeWebcam.getState() });
unsubscribe();
eventHub.clear();

// stopStream is for a temporary stream owned by the caller.
// Do not use it on a stream owned by Webcam.
stopStream(stream);

// BrowserMediaDevicesAdapter exposes the browser MediaDevicesPort directly.
const browserPort = new BrowserMediaDevicesAdapter();
const stopBrowserChanges = browserPort.subscribeDeviceChange(() => {
	console.log("browser device list changed");
});
try {
	const browserDevices = await browserPort.enumerateDevices();
	console.log(browserDevices);
	const browserStream = await browserPort.open({ video: true, audio: false });
	try {
		console.log(browserStream.getVideoTracks()[0]?.label);
	} finally {
		stopStream(browserStream);
	}
} finally {
	stopBrowserChanges();
}

const normalized = normalizeBrowserError(
	new DOMException("Permission denied", "NotAllowedError"),
	"start",
	"UNKNOWN",
);
console.log(normalized.code);
```

## Runtime contract

- Browser-focused, with SSR-safe package imports and Webcam construction. Browser
  operations need browser media APIs.
- One Webcam owns at most one active session and is the only service that stops
  its active stream.
- Preview, capture, device, permission, and control services remain separate.
- Error, state, and event values are typed.

The package does not export legacy compatibility aliases; use the public API
names listed above.
