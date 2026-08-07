# Webcam-TS v4 Architecture Design

**Status:** Approved  
**Date:** 2026-08-06  
**Scope:** Clean replacement of Webcam-TS v3

## 1. Product decision

Webcam-TS v4 is a clean TypeScript redesign. It does not preserve the v3 API and does not include a compatibility facade.

The package is browser-focused and framework-agnostic. It may use standard Web Platform APIs, but it must not depend on Angular, React, Vue, RxJS, or another application framework. Importing and constructing public classes must be safe in SSR and Node.js environments. Browser globals are resolved only when a browser operation is invoked.

## 2. Locked decisions

- One `Camera` instance owns at most one active camera session.
- `CameraSession` is the sole owner of active and candidate `MediaStream` objects.
- `start()` and `switch()` are separate commands.
- `start()` is valid only from `idle`.
- `switch()` is valid only while a session is active.
- A failed operation rolls back automatically to its previous stable state.
- Concurrent `switch()` calls use latest-command-wins semantics.
- `stop()` preempts `start()` and `switch()`.
- `dispose()` preempts every operation and permanently terminates the instance.
- `VideoPreview` is a separate browser adapter.
- `CameraCapture` is a separate service and never owns or stops the camera stream.
- Device, permission, and track-control services are separate from the session facade.
- No legacy API is retained.

## 3. Core invariants

1. A `MediaStream` has exactly one lifecycle owner: `CameraSession`.
2. Platform adapters never retain active stream ownership.
3. A stale, aborted, failed, or superseded operation must stop every stream it created.
4. A candidate switch stream cannot replace the active stream until it has a live video track and the operation still owns the current generation token.
5. A failed switch leaves the previous active stream running.
6. Listener failures do not change operation outcomes or prevent other listeners from running.
7. Public state is immutable and does not expose mutable internal stores.
8. Module initialization never reads `window`, `document`, or `navigator`.
9. `dispose()` is idempotent and terminal.
10. No service other than `CameraSession` calls `stop()` on session-owned tracks.

## 4. Public package shape

The package remains a single npm package with explicit subpath exports:

```text
webcam-ts
webcam-ts/preview
webcam-ts/capture
webcam-ts/devices
webcam-ts/controls
webcam-ts/testing
```

The root export contains the camera facade, domain contracts, state, events, and errors. Browser-oriented optional services are available from explicit subpaths. Undeclared deep imports are unsupported.

## 5. Runtime scope

The runtime target is modern browsers supporting `MediaDevices.getUserMedia()`. The package must be safe to import and instantiate during SSR.

```ts
import { Camera } from "webcam-ts";

const camera = new Camera(); // valid in Node/SSR
await camera.start({});      // rejects with UNSUPPORTED_RUNTIME
```

The package must not throw a `ReferenceError` because a browser global is absent.

## 6. Lifecycle

```ts
type CameraStatus =
  | "idle"
  | "starting"
  | "active"
  | "switching"
  | "stopping"
  | "disposed";
```

There is no persistent error state. Failure is represented by typed errors, events, and `lastError`, while lifecycle returns to a stable state.

### `start(request)`

- Valid only from `idle`.
- Opens one candidate stream.
- Commits only when the operation is current and a live video track exists.
- Success transitions to `active`.
- Failure or cancellation stops the candidate and returns to `idle`.
- Calling from another state rejects with `INVALID_STATE`.

### `switch(request)`

- Valid only while the camera is active or another switch is in progress.
- The existing active stream remains live while a candidate is opened.
- A newer switch supersedes any older uncommitted switch.
- Only the newest operation may commit.
- On commit, the new stream becomes active, subscribers are notified, then the old stream is stopped.
- Failure leaves the old stream active.

### `stop()`

- Idempotent while idle.
- Invalidates all in-flight start/switch generations.
- Prevents stale results from committing.
- Stops active and candidate streams owned by the session.
- Ends in `idle`.

### `dispose()`

- Idempotent.
- Preempts every operation.
- Stops all owned streams and clears listeners/resources.
- Ends permanently in `disposed`.
- Later operations reject with `DISPOSED`.

## 7. Camera request

Public requests use stable primitive values rather than retaining `MediaDeviceInfo` objects.

```ts
interface CameraRequest {
  deviceId?: string;
  facingMode?: "user" | "environment" | ConstraintString;
  resolution?: {
    width?: ConstraintNumber;
    height?: ConstraintNumber;
  };
  frameRate?: ConstraintNumber;
  audio?: boolean | MediaTrackConstraints;
  signal?: AbortSignal;
}
```

Request validation rejects contradictory or invalid values before browser APIs are called. Constraint building is isolated from lifecycle orchestration.

## 8. State and events

`CameraState` is an immutable snapshot containing lifecycle status, session identity, selected device/track metadata, current settings/capabilities, timestamps, and `lastError`. It does not contain `MediaStream`, DOM elements, canvases, callbacks, or service instances.

Events use a discriminated union. Required events include:

- `state-changed`
- `stream-changed`
- `operation-started`
- `operation-completed`
- `operation-failed`

Subscriptions support multiple listeners. Unsubscribe is idempotent. Listener exceptions are isolated.

## 9. Error taxonomy

`CameraError` contains a stable code, optional operation, recoverability flag, cause, and privacy-safe context.

Required codes:

```text
UNSUPPORTED_RUNTIME
UNSUPPORTED_BROWSER
INVALID_REQUEST
INVALID_STATE
DISPOSED
PERMISSION_DENIED
DEVICE_NOT_FOUND
DEVICE_BUSY
CONSTRAINT_UNSATISFIED
SECURITY_RESTRICTION
OPERATION_ABORTED
OPERATION_SUPERSEDED
STREAM_OPEN_FAILED
STREAM_INVALID
TRACK_ENDED
CONTROL_UNSUPPORTED
CONTROL_FAILED
PREVIEW_FAILED
CAPTURE_FAILED
UNKNOWN
```

Browser-specific error names are normalized once at the platform boundary.

## 10. Component boundaries

### `Camera`

A thin public facade that delegates lifecycle work to `CameraSession`, publishes immutable state/events, and exposes borrowed active stream/track references.

### `CameraSession`

The sole owner of active and candidate streams, operation generations, and atomic commit/rollback behavior.

### `BrowserMediaDevicesAdapter`

A stateless `MediaDevicesPort` implementation. It opens streams and enumerates devices but stores no session state.

### `VideoPreview`

Binds a `Camera` to an `HTMLVideoElement`, manages `srcObject`, autoplay, muted, plays-inline, mirror, detach, and dispose. It does not stop camera tracks. Multiple previews may bind to one camera.

### `CameraCapture`

Reads a borrowed active stream/track and produces Blob, ImageData, or ImageBitmap outputs. It owns only internal frame/canvas resources. Object URLs and Base64 strings are not created implicitly.

### `CameraDeviceManager`

Lists devices and publishes `devicechange` updates. Listing does not open a temporary stream. Capability probing is explicit and never substitutes guessed capability values.

### `CameraPermissionService`

Uses the Permissions API as advisory information and `getUserMedia()` as request authority. Permission states include `granted`, `denied`, `prompt`, `unsupported`, and `unknown`.

### `CameraControls`

Applies validated track constraints for torch, zoom, and focus without owning the active track.

## 11. Capture behavior

Capture does not require a consumer-managed preview. The service may use `ImageCapture.grabFrame()` when available and a lazily-created hidden video/canvas fallback otherwise. Browser resources are created only when capture is invoked.

Capture results include output data, dimensions, MIME type where applicable, and timestamp. Consumers own returned Object URLs or ImageBitmap cleanup when they create/use them.

## 12. Source structure

```text
packages/webcam-ts/src/
  domain/
  session/
  platform/
  events/
  preview/
  capture/
  devices/
  controls/
  testing/
  camera.ts
  index.ts
```

Files are split by responsibility. Framework example code must consume only public package exports.

## 13. Verification strategy

Required test layers:

- Pure lifecycle and request validation unit tests.
- Concurrency tests for overlapping start/switch/stop/dispose operations.
- Leak assertions proving every non-active track is stopped.
- Event ordering and listener isolation tests.
- SSR import/construction tests.
- Public package export and packed-tarball smoke tests.
- Browser tests for Chromium, Firefox, and WebKit where synthetic media is available.
- Manual real-device verification matrix for mobile and external cameras.

## 14. Stability gates

v4 is not stable until all gates pass:

1. No owned track leaks in lifecycle/concurrency tests.
2. Every transition is covered.
3. A failed switch preserves the previous active stream.
4. Stop/dispose prevent stale commits.
5. Listener exceptions do not alter command outcomes.
6. Node/SSR import and construction succeed.
7. Every declared export works from a packed package.
8. Tests do not import undeclared `dist` internals.
9. Canonical examples use only public exports.
10. Public contracts and error codes match this specification.

## 15. Non-goals

The v4 foundation does not include recording, WebRTC signaling, server streaming, OCR, face/document detection, framework-specific packages, or automatic built-in/external camera classification. These may be built later on the stable session core.
