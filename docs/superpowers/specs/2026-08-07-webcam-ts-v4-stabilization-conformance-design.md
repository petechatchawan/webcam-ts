# Webcam-TS v4 Stabilization & Conformance Design

**Status:** Proposed for approval  
**Date:** 2026-08-07  
**Baseline:** `master@c06638423956bda189c88ed7f09b185f360d711a`  
**Current package:** `webcam-ts@4.0.0-alpha.1`

## 1. Purpose

This milestone proves that the Webcam-TS v4 contracts already implemented on `master` behave correctly on real browsers and physical camera hardware before the package is promoted to stable `4.0.0`.

The milestone is evidence-first. It does not add unrelated product features. Production behavior changes are allowed only when automated or physical conformance evidence demonstrates a library defect, an invalid cross-browser assumption, or a platform limitation that must be represented explicitly in the public contract.

The milestone ends with a release candidate only after all Tier-1 conformance gates pass. Stable `4.0.0` is promoted only after the release candidate passes the final physical matrix without open P0/P1 defects.

## 2. Locked scope

### In scope

- Chromium, Firefox, WebKit/Safari conformance.
- iOS Safari and Android Chrome physical-device verification.
- Integrated and external USB cameras.
- Permission lifecycle and secure-context behavior.
- Device enumeration and `devicechange` behavior.
- Start, switch, stop, dispose, track-ended, and concurrent command behavior.
- Exact and ideal resolution semantics.
- Preview integrity for portrait, landscape, and square tracks.
- Still capture through native and fallback capture paths.
- Torch, zoom, and focus capability-driven controls.
- Browser error normalization and privacy-safe diagnostics.
- Automated browser tests where synthetic media is technically reliable.
- Manual physical conformance where hardware/browser behavior cannot be represented faithfully by synthetic media.
- Evidence export suitable for repository handoff and issue diagnosis.
- Node/SSR import and package conformance on supported Node runtimes.
- Release-candidate and stable-release gates.

### Out of scope

- Video recording.
- WebRTC signaling or remote streaming.
- OCR, face detection, document detection, liveness, or eKYC logic.
- Framework-specific wrappers.
- Automatic built-in/external camera classification.
- New camera effects, filters, virtual backgrounds, or editing features.
- Native sensor-mode discovery beyond what browser media APIs expose.

## 3. Tier-1 release matrix

All Tier-1 categories are release blockers for stable `4.0.0`.

| Platform | Required physical coverage | Release-blocking scenarios |
|---|---|---|
| macOS Chromium | Integrated camera and external USB camera | permission, enumerate, start, exact/ideal resolution, switch, stop, track ended/disconnect, capture, controls |
| macOS Firefox | Integrated camera | permission, enumerate, start, exact/ideal resolution, stop, capture, error normalization |
| macOS Safari | Integrated camera | permission, enumerate, start, exact/ideal resolution, switch where multiple cameras are available, stop, capture |
| iOS Safari | Front and rear cameras | permission, start, front/rear switch, exact/ideal resolution, stop, capture, interruption/recovery |
| Android Chrome | Front and rear cameras | permission, start, front/rear switch, exact/ideal resolution, stop, capture, torch/zoom where supported |
| External USB webcam | At least one desktop Chromium run | enumerate, select, exact/ideal resolution, disconnect/reconnect, track ended, recovery |

The external USB webcam run is mandatory for stable release. If the release environment does not have suitable hardware, the release remains blocked rather than silently downgrading this gate.

The conformance report records exact browser, OS, and device versions used for each run. The public support statement is based on evidence in the matrix rather than claiming untested browser versions.

## 4. Node / SSR support policy

The current alpha package declares `node >=18`, but Node 18 and Node 20 are end-of-life by this stabilization milestone. Stable v4 must not claim support for EOL runtimes that are not part of the release gate.

For `4.0.0-rc.1` and stable `4.0.0`:

- package engine floor becomes `node >=22`;
- CI verifies Node 22 and Node 24;
- SSR import and public package construction must succeed on both;
- browser-only operations must fail lazily with typed unsupported-runtime errors rather than top-level `ReferenceError`;
- no stable support claim is made for Node 18 or Node 20.

This is acceptable within the v4 major release and removes an unverifiable compatibility promise before stable publication.

## 5. Stabilization principles

1. **Evidence before workaround.** Browser-specific behavior must be reproduced and recorded before production code changes.
2. **Public contract over browser accident.** A browser quirk must not silently redefine a Webcam-TS contract.
3. **No false success.** If an operation claims an exact result, postconditions must verify the delivered track state where the browser exposes authoritative settings.
4. **No hidden downgrade.** Fallback behavior must be explicit in request mode, state, diagnostics, or documented platform semantics.
5. **No owned-resource leak.** Late, stale, failed, superseded, or abandoned media streams must never remain active.
6. **Physical limitations are first-class.** If hardware requires exclusive camera acquisition, the library must either support an explicit recovery strategy or document the limitation accurately.
7. **Capability-driven controls.** Torch, zoom, focus, and similar controls are asserted only when exposed by the active track capabilities.
8. **Privacy-safe evidence.** Reports must not export raw `deviceId`, `groupId`, or camera labels by default.

## 6. Conformance architecture

The milestone adds a conformance layer around the existing public package rather than introducing a second camera implementation.

```text
GitHub Pages Playground
        |
        +-- Normal playground mode
        |
        +-- Conformance mode
                |
                +-- Scenario Runner
                +-- Observation Collector
                +-- Assertion Projector
                +-- Privacy Sanitizer
                +-- Evidence Exporter

Webcam-TS public package
        |
        +-- Camera / CameraSession
        +-- Preview
        +-- Capture
        +-- Devices / Permissions
        +-- Controls
```

Conformance mode must consume only declared public package exports unless a test is explicitly validating a package-internal unit through the package test suite.

## 7. Conformance scenario model

Each scenario is deterministic at the orchestration level even though physical media negotiation is platform-dependent.

```ts
interface ConformanceScenarioResult {
  readonly scenarioId: string;
  readonly status: "pass" | "fail" | "blocked" | "skipped";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly environment: ConformanceEnvironment;
  readonly observations: readonly ConformanceObservation[];
  readonly assertions: readonly ConformanceAssertion[];
  readonly error?: SanitizedCameraError;
}
```

A scenario must never report `pass` only because no exception occurred. Pass/fail comes from explicit assertions over public state, events, track settings, capabilities, capture output, or user-confirmed physical observations.

### Required scenario families

- runtime / secure context
- permission query and request
- device enumeration
- start
- exact resolution success
- exact resolution rejection
- ideal resolution negotiation
- switch
- rapid switch / latest-command-wins
- stop during pending start
- dispose during pending switch
- active track ended
- external device disconnect/reconnect
- preview dimensions and non-cropping behavior
- JPEG capture
- PNG capture
- repeated capture cleanup
- zoom
- torch
- focus

## 8. Evidence contract

Evidence must be useful for debugging while safe to attach to GitHub issues and pull requests.

### Environment data

Allowed by default:

- browser family and full version
- browser engine where detectable without fingerprinting extensions
- OS family and version when supplied by the browser/runtime
- mobile/desktop classification
- secure-context state
- test timestamp
- package version and tested git SHA
- user-supplied hardware class: `integrated`, `external`, `front`, `rear`, `unknown`

Excluded by default:

- raw `deviceId`
- raw `groupId`
- raw camera labels
- full user agent string unless explicitly opted in for diagnostics
- page URLs containing tokens/query secrets
- image captures or video frames

### Camera observations

Allowed:

- requested constraint mode
- requested width/height/frame rate/facing mode category
- actual `MediaTrackSettings` values relevant to the scenario
- normalized capabilities required by the scenario
- normalized Webcam-TS errors
- event sequence and lifecycle state sequence
- elapsed timing information

The exporter must sanitize unknown error causes instead of serializing arbitrary browser objects recursively.

## 9. Automated browser conformance

Automated browser tests use synthetic media only where the assertions are meaningful and deterministic.

Required engines:

- Chromium
- Firefox
- WebKit

Automated coverage focuses on:

- public package loading in a real browser context
- permission-independent flows using configured synthetic media
- start/stop lifecycle
- state/event ordering
- preview attachment
- exact/ideal constraint request mapping where the browser test harness can control media behavior
- capture output shape
- stale operation cleanup
- browser error normalization fixtures

Automated WebKit is not treated as proof that physical iOS Safari behavior is equivalent. Physical iOS remains a separate Tier-1 gate.

## 10. Physical conformance workflow

Physical scenarios run from the canonical GitHub Pages playground over HTTPS.

Each run follows:

```text
select scenario
→ show prerequisites
→ execute browser-observable steps
→ request user confirmation only for physical facts the browser cannot infer
→ collect sanitized observations
→ evaluate assertions
→ export one report
```

Examples of user-confirmed facts:

- selected camera is physically the front or rear camera
- selected camera is an external USB camera
- preview visually corresponds to the intended camera
- device was physically disconnected during the disconnect scenario

The harness must avoid asking the tester to interpret technical state already available through APIs.

## 11. Lifecycle stabilization requirements

### Pending `getUserMedia()` and preemption

A permission prompt or hardware acquisition may remain pending for an unbounded time. `stop()` and `dispose()` therefore cannot depend on the browser media promise settling before the public lifecycle becomes stable.

Required contract:

- `stop()` and `dispose()` invalidate pending operations immediately.
- the public operation exposed to the caller must settle promptly after preemption according to the final implementation design.
- if the browser later resolves an invalidated media request, the returned stream is stopped before any public commit.
- late resolution must not emit a false successful operation.
- no candidate survives after stop/dispose.

Implementation details are deferred to the TDD plan; the conformance design requires the externally observable behavior above.

### Track-ended behavior

When the active video track ends unexpectedly:

- active stream ownership is released.
- public state leaves `active`.
- `TRACK_ENDED` is reported as recoverable.
- a later explicit `start()` may recover.
- no automatic reopening loop is introduced in this milestone.

## 12. Camera switching stabilization

The current preferred behavior remains candidate-first atomic switching because it preserves the active stream on candidate failure.

```text
active A
→ open candidate B
→ validate B
→ commit B
→ stop A
```

Physical iOS/Safari and other exclusive-camera platforms determine whether this contract is universally viable.

### Decision rule

- If Tier-1 evidence shows candidate-first switching works, retain the current contract.
- If evidence shows repeatable `DEVICE_BUSY` or equivalent failure caused by simultaneous acquisition, introduce an explicit exclusive-camera strategy in a separate stabilization PR.

An exclusive-camera strategy must not be added speculatively.

If required, its public semantics must distinguish between:

- atomic switch, where the previous stream can be preserved on failure; and
- break-before-make switch, where rollback is best-effort because the old camera must be released before the new camera can open.

Any relaxation of the current failed-switch-preserves-stream invariant requires an architecture decision update before stable release.

## 13. Resolution stabilization

### Exact mode

`exact` means the delivered `MediaStreamTrack` must satisfy the requested exact width and height according to authoritative track settings exposed by the browser. It does not mean the physical sensor natively operates in that mode.

Required postcondition when width and height settings are available:

```text
requested exact = 1920 x 1920
actual settings = 1920 x 1920
→ success

requested exact = 1920 x 1920
actual settings = 1760 x 1328
→ candidate rejected and stopped
→ CONSTRAINT_UNSATISFIED
```

If a browser omits an authoritative setting, the report must record the postcondition as unobservable rather than inventing a value.

### Ideal mode

`ideal` explicitly permits negotiation. Requested and actual values remain separate in state/evidence/UI.

### Preset matrix

The existing 19 portrait, landscape, and square presets remain test inputs. A physical camera is not required to support every preset. Correct rejection of unsupported exact presets is a pass condition.

## 14. Permission stabilization

Permissions API results remain advisory. `getUserMedia()` remains the request authority.

Required cases:

- prompt → allow
- prompt → deny
- previously granted
- previously denied
- Permissions API unavailable or unsupported
- browser/site setting blocks access
- insecure context

The public error taxonomy must avoid claiming a distinction the browser does not expose reliably. Browser-specific DOMException names are normalized once at the platform boundary.

## 15. Device and disconnect stabilization

Required behavior:

- enumeration itself does not acquire media.
- device labels may be empty before permission and must not be treated as stable identity.
- a selected external camera disappearing must not leave the camera state falsely active.
- `devicechange` is treated as advisory; active track `ended` remains authoritative for session loss.
- reconnect does not auto-resume the previous device in this milestone; recovery is explicit through `start()` or `switch()`.

## 16. Capture stabilization

Both capture backends are release-relevant:

1. native image capture path when available;
2. hidden video/canvas fallback.

Required assertions:

- JPEG output is non-empty and has the declared MIME type.
- PNG output is non-empty and has the declared MIME type.
- dimensions correspond to the captured frame path as defined by the public result contract.
- repeated capture does not leak library-owned temporary resources.
- capture after stop rejects with `INVALID_STATE`.
- capture after switch uses the newly committed stream.

No captured image bytes are included in default conformance evidence.

## 17. Controls stabilization

Torch, zoom, and focus are capability-driven.

A platform passes when:

- unsupported controls return `CONTROL_UNSUPPORTED` before `applyConstraints()` is attempted;
- supported controls validate requested values against capabilities;
- successful control application returns updated track settings when observable;
- browser failure during application returns `CONTROL_FAILED` without corrupting session ownership.

A device lacking torch, zoom, or focus is not a conformance failure.

## 18. Error taxonomy conformance

The current error taxonomy remains the baseline. The milestone verifies real browser mappings for at least:

- `PERMISSION_DENIED`
- `DEVICE_NOT_FOUND`
- `DEVICE_BUSY`
- `CONSTRAINT_UNSATISFIED`
- `SECURITY_RESTRICTION`
- `OPERATION_ABORTED`
- `TRACK_ENDED`
- `CONTROL_UNSUPPORTED`
- `CONTROL_FAILED`
- `CAPTURE_FAILED`
- fallback `STREAM_OPEN_FAILED` / `UNKNOWN`

New public error codes require an explicit specification amendment; browser-specific names should normally remain sanitized context rather than become public codes.

## 19. PR decomposition

### PR 1 — Conformance Harness & Evidence Contract

- scenario model
- privacy sanitizer
- evidence export
- conformance mode in playground
- manual run instructions
- no intended production behavior changes

### PR 2 — Automated Browser Conformance

- Chromium browser suite
- Firefox browser suite
- WebKit browser suite
- synthetic media fixtures
- CI integration
- deterministic browser evidence artifacts

### PR 3 — Lifecycle & Cancellation Hardening

- pending media acquisition preemption
- late-stream cleanup
- stop/dispose settlement behavior
- concurrency regression tests

### PR 4 — Resolution, Device & Switching Stabilization

- exact-resolution postcondition verification
- device/disconnect scenarios
- physical switch evidence
- exclusive-camera fallback only if evidence requires it

### PR 5 — Capture, Controls & Permission Conformance

- native/fallback capture coverage
- permission-state compatibility
- capability-driven control conformance
- error-normalization corrections supported by evidence

### PR 6 — Release Candidate Gate

- final support matrix
- known limitations
- verified README/API examples
- release notes
- package engine floor transition to Node `>=22`
- package/version transition to `4.0.0-rc.1`
- packed-package and GitHub Pages exact-SHA verification

Stable `4.0.0` is a promotion step after RC physical verification; it is not merged merely because PR 6 is green in synthetic CI.

## 20. Release gates

### Automated gate

- package typecheck PASS
- package unit tests PASS
- packed export contract PASS
- Chromium conformance PASS
- Firefox conformance PASS
- WebKit conformance PASS
- Node 22 SSR/package verification PASS
- Node 24 SSR/package verification PASS
- zero known owned-track leaks
- deterministic evidence generation PASS

### Physical Tier-1 gate

- macOS Chromium integrated camera PASS
- macOS Chromium external USB camera PASS
- macOS Firefox integrated camera PASS
- macOS Safari integrated camera PASS
- iOS Safari front/rear PASS
- Android Chrome front/rear PASS
- exact supported and unsupported resolution cases PASS
- permission allow/deny PASS
- disconnect/recovery PASS
- JPEG/PNG capture PASS

### Stable release gate

- open P0 defects: 0
- open P1 defects: 0
- unresolved architecture contradictions: 0
- support matrix published
- known limitations published
- public API frozen for 4.0.0
- README examples verified against packed package
- GitHub Pages deployment SHA matches release candidate/stable source SHA

## 21. Defect severity

### P0 — blocks all release work

Examples:

- camera remains active after dispose
- stale stream commits after stop/dispose
- permission or lifecycle operation can corrupt ownership
- stable public API produces materially unsafe privacy behavior

### P1 — blocks stable 4.0.0

Examples:

- Tier-1 browser cannot start a normal supported camera
- front/rear switch is unusable without documented strategy
- exact mode reports false success
- capture is broken on a Tier-1 browser
- external camera disconnect leaves false active state

### P2 — may ship only if documented and non-contract-breaking

Examples:

- cosmetic conformance UI issue
- nonessential diagnostic field unavailable on one browser
- optional capability behavior differs while returning the correct unsupported result

## 22. Version progression

Expected progression:

```text
4.0.0-alpha.1   current foundation
        ↓
4.0.0-alpha.2   stabilization changes if public behavior changes materially
        ↓
4.0.0-rc.1      automated + Tier-1 physical matrix complete
        ↓
4.0.0           RC passes final physical release verification
```

Additional alpha or RC increments are allowed only when evidence requires another externally testable iteration.

## 23. Completion definition

This milestone is complete when Webcam-TS has a reproducible conformance harness, browser automation, privacy-safe evidence, a completed Tier-1 physical matrix, no open P0/P1 defects, explicit known limitations, and an RC that can be promoted to `4.0.0` without changing the public API or core lifecycle semantics.

The milestone is not complete merely because the existing Node test suite remains green.
