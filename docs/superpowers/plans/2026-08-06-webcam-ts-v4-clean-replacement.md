# Webcam-TS v4 Clean Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v3 implementation with a framework-agnostic, SSR-safe TypeScript v4 architecture whose session core has single stream ownership, atomic switching, deterministic cancellation, typed events, and typed errors.

**Architecture:** `Camera` is a thin facade over a `CameraSession` that exclusively owns active and candidate streams. Browser functionality is isolated behind stateless ports/adapters, while preview, capture, device, permission, and control services consume borrowed stream/track references without owning them.

**Tech Stack:** TypeScript 5.x, ESM, DOM/Web Platform types, Node.js built-in test runner, Playwright-ready browser boundaries, npm package exports.

## Global Constraints

- Browser-focused and SSR-safe import/construct behavior.
- No Angular, React, Vue, RxJS, or framework dependency.
- No v3 compatibility facade or legacy public API.
- One `CameraSession` is the sole owner of active/candidate streams.
- `start()` and `switch()` remain separate commands.
- Failed operations roll back automatically to a stable state.
- Concurrent switch operations use latest-command-wins.
- `stop()` and `dispose()` preempt in-flight operations.
- Production code is added only after a failing test is observed.
- Public tests import declared package exports, never undeclared `dist` internals.

---

## File map

```text
packages/webcam-ts/
  src/domain/camera-error.ts        typed error taxonomy and snapshots
  src/domain/camera-request.ts      request contracts, validation, constraints
  src/domain/camera-state.ts        immutable public state contracts
  src/domain/camera-event.ts        event discriminated union
  src/events/camera-event-hub.ts    isolated multi-listener delivery
  src/session/lifecycle-machine.ts  pure transition validation
  src/session/operation-controller.ts generation and cancellation ownership
  src/session/stream-cleanup.ts     idempotent stream cleanup helpers
  src/session/camera-session.ts     sole stream owner and atomic operations
  src/platform/media-devices-port.ts platform interface
  src/platform/browser-environment.ts lazy browser-global resolution
  src/platform/browser-error-normalizer.ts DOMException normalization
  src/platform/browser-media-devices-adapter.ts stateless browser adapter
  src/camera.ts                     thin public facade and state projection
  src/preview/video-preview.ts      HTMLVideoElement adapter
  src/capture/camera-capture.ts     public capture service
  src/capture/canvas-capture-backend.ts lazy fallback backend
  src/devices/camera-device-manager.ts device enumeration and devicechange
  src/devices/camera-permission-service.ts permission query/request semantics
  src/controls/camera-controls.ts   validated active-track controls
  src/testing/fakes.ts              public deterministic test helpers
  src/index.ts                      root public exports
  src/*/index.ts                    declared subpath exports
  test/*.test.mjs                   built-package behavior tests
```

### Task 1: Domain contracts and lifecycle machine

**Files:**
- Create: `packages/webcam-ts/src/domain/camera-error.ts`
- Create: `packages/webcam-ts/src/domain/camera-request.ts`
- Create: `packages/webcam-ts/src/domain/camera-state.ts`
- Create: `packages/webcam-ts/src/domain/camera-event.ts`
- Create: `packages/webcam-ts/src/session/lifecycle-machine.ts`
- Test: `packages/webcam-ts/test/domain-lifecycle.test.mjs`

**Interfaces:**
- Produces: `CameraError`, `CameraErrorCode`, `CameraRequest`, `CameraState`, `CameraEvent`, `CameraStatus`, `assertCommandAllowed()`, `buildMediaStreamConstraints()`.

- [ ] **Step 1: Write failing lifecycle and request tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  CameraError,
  assertCommandAllowed,
  buildMediaStreamConstraints,
} from "../dist/index.js";

test("start is rejected outside idle", () => {
  assert.throws(
    () => assertCommandAllowed("active", "start"),
    (error) => error instanceof CameraError && error.code === "INVALID_STATE",
  );
});

test("camera request rejects non-positive exact width", () => {
  assert.throws(
    () => buildMediaStreamConstraints({ resolution: { width: { exact: 0 } } }),
    (error) => error instanceof CameraError && error.code === "INVALID_REQUEST",
  );
});
```

- [ ] **Step 2: Build and run the test to verify RED**

Run: `npm --prefix packages/webcam-ts test -- domain-lifecycle.test.mjs`  
Expected: FAIL because v4 exports do not exist.

- [ ] **Step 3: Implement minimal contracts and pure transition validation**

Implement exact status values `idle | starting | active | switching | stopping | disposed`, stable error codes from the spec, request validation, and browser-native constraint conversion.

- [ ] **Step 4: Run focused and full tests to verify GREEN**

Run: `npm --prefix packages/webcam-ts test -- domain-lifecycle.test.mjs`  
Run: `npm --prefix packages/webcam-ts test`

- [ ] **Step 5: Commit**

```bash
git add packages/webcam-ts/src/domain packages/webcam-ts/src/session/lifecycle-machine.ts packages/webcam-ts/test/domain-lifecycle.test.mjs
git commit -m "feat(webcam-ts): define v4 domain and lifecycle contracts"
```

### Task 2: Event hub and operation controller

**Files:**
- Create: `packages/webcam-ts/src/events/camera-event-hub.ts`
- Create: `packages/webcam-ts/src/session/operation-controller.ts`
- Create: `packages/webcam-ts/src/session/stream-cleanup.ts`
- Test: `packages/webcam-ts/test/events-operations.test.mjs`

**Interfaces:**
- Produces: `CameraEventHub.subscribe(listener): () => void`, `CameraEventHub.emit(event)`, `OperationController.begin(kind)`, `OperationLease.isCurrent()`, `OperationLease.throwIfInvalid()`, `stopStream(stream)`.

- [ ] **Step 1: Write failing tests for listener isolation and generation invalidation**

```js
test("listener failures do not prevent later listeners", () => {
  const hub = new CameraEventHub();
  const received = [];
  hub.subscribe(() => { throw new Error("consumer failure"); });
  hub.subscribe((event) => received.push(event.type));
  hub.emit({ type: "operation-completed", operation: "start", operationId: 1 });
  assert.deepEqual(received, ["operation-completed"]);
});

test("a newer switch supersedes an older lease", () => {
  const controller = new OperationController();
  const first = controller.begin("switch");
  const second = controller.begin("switch");
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
});
```

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement minimal isolated event delivery and generation leases**
- [ ] **Step 4: Verify GREEN and no regression**
- [ ] **Step 5: Commit with `feat(webcam-ts): add deterministic event and operation primitives`**

### Task 3: Stateless media platform boundary and SSR safety

**Files:**
- Create: `packages/webcam-ts/src/platform/media-devices-port.ts`
- Create: `packages/webcam-ts/src/platform/browser-environment.ts`
- Create: `packages/webcam-ts/src/platform/browser-error-normalizer.ts`
- Create: `packages/webcam-ts/src/platform/browser-media-devices-adapter.ts`
- Test: `packages/webcam-ts/test/platform-ssr.test.mjs`

**Interfaces:**
- Produces: `MediaDevicesPort.open()`, `MediaDevicesPort.enumerateDevices()`, `BrowserMediaDevicesAdapter`, `normalizeBrowserError()`.

- [ ] **Step 1: Write failing Node/SSR tests**

```js
test("root package imports and Camera constructs without browser globals", async () => {
  const module = await import("../dist/index.js");
  assert.doesNotThrow(() => new module.Camera());
});

test("browser adapter reports unsupported runtime lazily", async () => {
  const adapter = new BrowserMediaDevicesAdapter();
  await assert.rejects(
    () => adapter.open({ video: true }),
    (error) => error.code === "UNSUPPORTED_RUNTIME",
  );
});
```

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement lazy browser resolution and one-point DOMException normalization**
- [ ] **Step 4: Verify GREEN**
- [ ] **Step 5: Commit with `feat(webcam-ts): add SSR-safe media platform adapter`**

### Task 4: CameraSession single ownership and concurrency

**Files:**
- Create: `packages/webcam-ts/src/session/camera-session.ts`
- Test: `packages/webcam-ts/test/camera-session.test.mjs`

**Interfaces:**
- Consumes: `MediaDevicesPort`, `OperationController`, `CameraEventHub`, request constraints, cleanup helpers.
- Produces: `start(request)`, `switch(request)`, `stop()`, `dispose()`, `getActiveStream()`, `getActiveTrack()`, `getStatus()`.

- [ ] **Step 1: Write failing ownership and rollback tests**

Required tests:

```text
start success owns exactly one stream
start failure returns idle and stops candidate
stop during start prevents stale commit
failed switch preserves old stream
newer switch supersedes older candidate
stale candidate is stopped after resolving
dispose during switch stops active and candidate streams
stop and dispose are idempotent
```

Each fake track exposes `stopCalls`; every test asserts exact cleanup counts.

- [ ] **Step 2: Verify RED for each behavior before implementation**
- [ ] **Step 3: Implement one behavior at a time using RED/GREEN cycles**
- [ ] **Step 4: Run the complete concurrency suite**
- [ ] **Step 5: Commit with `feat(webcam-ts): implement single-owner camera session`**

### Task 5: Camera facade, immutable state, and public events

**Files:**
- Create: `packages/webcam-ts/src/camera.ts`
- Create: `packages/webcam-ts/src/index.ts`
- Test: `packages/webcam-ts/test/camera-public-api.test.mjs`

**Interfaces:**
- Produces: `new Camera(options?)`, `start`, `switch`, `stop`, `dispose`, `getState`, `getActiveStream`, `getActiveTrack`, `subscribe`.

- [ ] **Step 1: Write failing public API tests**

Required assertions:

```text
state snapshots and nested settings are frozen
listener failure does not reject start
operation failure updates lastError then rolls back state
successful next operation clears lastError
public operations after dispose reject DISPOSED
consumer imports only ../dist/index.js
```

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement thin facade and immutable projections**
- [ ] **Step 4: Verify GREEN**
- [ ] **Step 5: Commit with `feat(webcam-ts): expose v4 camera facade`**

### Task 6: Preview and capture adapters

**Files:**
- Create: `packages/webcam-ts/src/preview/video-preview.ts`
- Create: `packages/webcam-ts/src/preview/index.ts`
- Create: `packages/webcam-ts/src/capture/camera-capture.ts`
- Create: `packages/webcam-ts/src/capture/canvas-capture-backend.ts`
- Create: `packages/webcam-ts/src/capture/index.ts`
- Test: `packages/webcam-ts/test/preview-capture.test.mjs`

**Interfaces:**
- Produces: `VideoPreview.bind/detach/dispose/setMirror/setElement`, `CameraCapture.toBlob/toImageData/toImageBitmap/dispose`.

- [ ] **Step 1: Write failing adapter tests**

Required assertions:

```text
preview updates srcObject only after stream-changed commit
failed switch leaves preview on old stream
preview dispose clears srcObject but does not stop tracks
multiple previews can bind to one camera
capture import is SSR-safe
capture without active stream rejects INVALID_STATE
capture dispose releases only internal resources
```

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement lazy browser resources and borrowed-stream behavior**
- [ ] **Step 4: Verify GREEN**
- [ ] **Step 5: Commit with `feat(webcam-ts): add preview and capture services`**

### Task 7: Devices, permissions, and controls

**Files:**
- Create: `packages/webcam-ts/src/devices/camera-device-manager.ts`
- Create: `packages/webcam-ts/src/devices/camera-permission-service.ts`
- Create: `packages/webcam-ts/src/devices/index.ts`
- Create: `packages/webcam-ts/src/controls/camera-controls.ts`
- Create: `packages/webcam-ts/src/controls/index.ts`
- Test: `packages/webcam-ts/test/devices-permissions-controls.test.mjs`

**Interfaces:**
- Produces: `CameraDeviceManager.list/subscribe/dispose`, `CameraPermissionService.query/request`, `CameraControls.getCapabilities/set`.

- [ ] **Step 1: Write failing behavior tests**

Required assertions:

```text
device list never calls getUserMedia
first device subscriber installs one devicechange listener
last unsubscribe removes the listener
unsupported Permissions API returns unsupported
successful permission request returns granted even when query is unsupported
controls reject unsupported values before applyConstraints
controls never stop the active track
```

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement minimal services through platform injection**
- [ ] **Step 4: Verify GREEN**
- [ ] **Step 5: Commit with `feat(webcam-ts): add device permission and control services`**

### Task 8: Package contract, documentation, and release gates

**Files:**
- Modify: `packages/webcam-ts/package.json`
- Modify: `packages/webcam-ts/tsconfig.json`
- Replace: `packages/webcam-ts/README.md`
- Create: `packages/webcam-ts/src/testing/fakes.ts`
- Create: `packages/webcam-ts/src/testing/index.ts`
- Create: `packages/webcam-ts/test/package-contract.test.mjs`
- Delete: obsolete v3 source and test files after v4 equivalents are green.

**Interfaces:**
- Produces declared root and subpath exports and public testing helpers.

- [ ] **Step 1: Write failing package-contract tests**

The test packs the package, installs the tarball into a temporary fixture, and verifies imports from:

```text
webcam-ts
webcam-ts/preview
webcam-ts/capture
webcam-ts/devices
webcam-ts/controls
webcam-ts/testing
```

It also verifies that an undeclared internal import is rejected.

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Update package exports, build scripts, README, and remove v3 implementation**
- [ ] **Step 4: Run complete verification**

```bash
npm --prefix packages/webcam-ts run clean
npm --prefix packages/webcam-ts run typecheck
npm --prefix packages/webcam-ts run build
npm --prefix packages/webcam-ts test
npm --prefix packages/webcam-ts pack --dry-run
```

Expected: every command exits 0; tests produce no unhandled rejection or warning.

- [ ] **Step 5: Commit with `feat(webcam-ts)!: replace v3 with clean v4 architecture`**

## Final self-review checklist

- [ ] Every specification invariant maps to a test.
- [ ] No `TODO`, `TBD`, placeholder contract, or guessed capability value remains.
- [ ] Production classes do not read browser globals at module scope.
- [ ] Only `CameraSession` stops session-owned streams.
- [ ] All stale candidates are stopped exactly once.
- [ ] Public exports and README examples use matching names.
- [ ] No test imports undeclared `dist` internals.
- [ ] Full typecheck, build, test, and package dry-run pass from a clean tree.
