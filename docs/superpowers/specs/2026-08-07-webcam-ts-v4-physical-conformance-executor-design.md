# Webcam-TS v4 Physical Conformance Executor Design

**Status:** Approved design addendum for PR 4 / Task 4.3  
**Branch:** `agent/webcam-ts-v4-resolution-device-switching-stabilization`  
**Parent plan:** `docs/superpowers/plans/2026-08-07-webcam-ts-v4-stabilization-conformance.md`

## Problem

The dedicated `?conformance=1` runner currently executes only the secure-context scenario. Other scenarios are hard-blocked, so the existing UI cannot yet collect the physical switching and disconnect evidence required by Task 4.3.

The fix must stay small: add only the browser execution capability required to collect real Tier-1 evidence. Do not turn the conformance runner into a second general-purpose playground.

## Design goals

1. Keep the conformance implementation clean, lean, and isolated from the normal playground state model.
2. Execute the existing physical switching/device scenarios through public `webcam-ts` APIs only.
3. Preserve candidate-first switching semantics unless retained physical evidence proves an exclusive-camera limitation.
4. Preserve privacy: raw device identity is runtime-only and must never enter retained evidence.
5. Preserve explicit recovery: reconnect never auto-opens a camera.
6. Keep disposal deterministic and ownership boundaries unchanged.

## Non-goals

- No new public package API.
- No framework dependency.
- No reuse of the normal playground `CameraController`.
- No generic workflow engine for conformance scenarios.
- No automatic scenario chaining.
- No automatic reconnect.
- No break-before-make fallback or browser-specific switching workaround.
- No capture/control/permission edge-case expansion; those remain PR 5 scope.

## Architecture

Add one focused browser executor behind the existing `ConformanceScenarioExecutor` contract.

```text
ConformanceRenderer
      |
      v
ConformanceController
      |
      v
BrowserConformanceExecutor
      |-- Camera
      |-- VideoPreview
      |-- CameraDeviceManager
      `-- CameraPermissionService
```

`ConformanceController` remains evidence/state authority. `BrowserConformanceExecutor` owns only browser operations and ephemeral runtime selection state.

## Runtime state

The executor keeps only the minimum transient state required for physical runs:

- current camera session;
- preview binding;
- current enumerated devices;
- selected primary device role;
- selected alternate device role;
- current active role: `primary | alternate | unknown`;
- one-shot observation flags needed for `devicechange` / active-track `ended` scenarios.

No raw `deviceId`, `groupId`, or label may be copied into `ConformanceScenarioResult` observations, assertions, errors, or exported evidence.

## UI additions

Conformance mode gains only the controls needed for physical evidence:

- one live preview element;
- `Primary camera` selector;
- `Alternate camera` selector.

Selectors may show browser-provided labels locally after permission. If labels are unavailable, display neutral aliases such as `Camera 1`, `Camera 2`.

Raw identity remains in DOM/runtime selection values only and is never exported.

## Supported PR 4 scenario execution

The real executor must cover only scenarios required to reach Task 4.3:

- `runtime-secure-context`;
- device enumeration before permission;
- permission request needed to reveal/select devices;
- device enumeration after permission;
- camera start;
- camera switch;
- rapid switch;
- active track ended;
- advisory `devicechange`;
- physical external disconnect;
- explicit restart after reconnect.

Other catalog scenarios may remain blocked until their owning implementation PR.

## Switching behavior

Candidate-first switching remains authoritative.

```text
start primary
  -> switch(primary -> alternate)
  -> physical confirmation
  -> switch(alternate -> primary)
  -> physical confirmation
```

The executor uses the public `Camera.switch()` path; it does not manually stop the current stream before acquiring the candidate.

A failed switch records the normalized typed error and leaves the prior active session intact when the package contract preserves it.

No fallback behavior is introduced from a single hardware/browser failure.

## Disconnect and reconnect behavior

`devicechange` is advisory only. Active-track `ended` remains the authority for session loss.

```text
active external camera
  -> physical disconnect
  -> observe track ended
  -> public state becomes non-active
  -> physical confirmation

physical reconnect
  -> no automatic start/switch
  -> tester explicitly runs restart scenario
  -> new active session
  -> physical confirmation
```

The explicit restart scenario remains blocked until retained `external-disconnect` evidence has PASS status.

## Evidence projection

Allowed examples:

```text
direction: primary-to-alternate
activeRole: alternate
status: active
width: 1280
height: 720
facingMode: environment
errorCode: DEVICE_BUSY
```

Forbidden evidence fields/values include raw device identifiers, group identifiers, camera labels, captured media, full URLs with query/fragment data, or arbitrary browser error causes.

The existing evidence sanitizer remains defense-in-depth; the executor must avoid producing raw identity observations in the first place.

## Error handling

- Use existing package errors and the existing conformance sanitizer.
- Scenario failure is assertion-derived; no exception-free path may be treated as PASS automatically.
- Missing prerequisites produce BLOCKED evidence.
- Optional browser observations that are unavailable must be represented as unobservable/blocked where appropriate, not fabricated.
- Browser-specific workaround logic is prohibited in this addendum.

## Cleanup and ownership

`BrowserConformanceExecutor.dispose()` must be idempotent and release:

- preview binding;
- device listeners;
- temporary observation listeners;
- active camera session through the public camera disposal path.

The executor never owns or stops tracks outside the `Camera` lifecycle contract.

## TDD contract

Implementation must begin with RED tests proving:

1. physical PR 4 scenarios are no longer hard-coded BLOCKED;
2. primary/alternate selection can drive start and candidate-first switch;
3. primary -> alternate -> primary switching uses `Camera.switch()` without manual pre-stop;
4. switch failure retains typed evidence and does not fabricate success;
5. raw device identity never reaches retained/exported evidence;
6. active-track ended drives session-loss evidence;
7. `devicechange` alone never auto-reopens a camera;
8. reconnect remains idle until explicit restart is run;
9. disposal is idempotent and releases listeners/session resources exactly once.

GREEN requires package tests, playground tests, typecheck, Pages build, and Chromium/Firefox/WebKit automated conformance to remain green before any physical deployment.

## Physical gate

After automated GREEN, deploy the exact PR head SHA to the canonical GitHub Pages conformance URL and collect Task 4.3 evidence on:

- iOS Safari: front -> rear -> front;
- Android Chrome: front -> rear -> front;
- macOS Safari: camera A <-> camera B when available;
- macOS Chromium: integrated <-> external USB.

If candidate-first switching succeeds across the required evidence, the switching contract remains unchanged.

If repeatable simultaneous-acquisition `DEVICE_BUSY` is proven, stop before workaround implementation, amend architecture semantics, then write new RED tests from that retained evidence.

## Lean implementation rule

Prefer one focused executor and small pure helpers over additional service layers. Add an abstraction only when it removes duplicated behavior already present in this PR or creates a test seam that is directly required by the TDD contract. No speculative extensibility is allowed.
