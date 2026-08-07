# Webcam-TS v4 Physical Conformance Runbook

**Milestone:** Real Browser & Device Conformance / v4 Stabilization  
**Canonical runner:** https://petechatchawan.github.io/webcam-ts/?conformance=1

## Purpose

This runbook defines how physical Tier-1 browser and camera evidence is collected for Webcam-TS v4. Automated browser tests are useful engine evidence, but they do not replace the required real-device runs in this document.

The conformance runner is assertion-authoritative. A scenario does not PASS merely because no exception was thrown.

## Result semantics

- **PASS** — every required browser-observable assertion passed and every required physical confirmation was explicitly confirmed.
- **FAIL** — at least one required assertion or physical confirmation failed.
- **BLOCKED** — a required prerequisite or implementation is unavailable; BLOCKED never counts as PASS.
- **SKIPPED** — allowed only for explicitly optional capability scenarios such as torch, zoom, or focus when that capability is not exposed by the active camera.

A Tier-1 release row is complete only with retained PASS evidence for all scenarios required by that row.

## Privacy rules

Default exported evidence must not contain:

- raw `deviceId`;
- raw `groupId`;
- camera labels;
- captured image or video bytes;
- full page URLs containing query values or fragments;
- arbitrary browser error causes.

The tester classifies hardware using only `integrated`, `external`, `front`, `rear`, or `unknown`.

## Evidence naming

Store an accepted evidence export using:

```text
<date>-<platform>-<browser>-<hardware>-<sha>.json
```

Example:

```text
2026-08-07-macos-chromium-external-c066384.json
```

The SHA in the evidence must be the exact GitHub Pages source SHA stamped into the deployed playground.

## Preflight for every run

1. Open the canonical HTTPS conformance URL.
2. Confirm the page reports a secure browser context.
3. Confirm the deployed/tested git SHA is the intended release candidate or stabilization head.
4. Select only the hardware class; do not copy camera labels or device IDs into notes.
5. Reset browser/site camera permission when the scenario requires a fresh prompt.
6. Close unrelated applications that may hold the camera unless the scenario intentionally tests `DEVICE_BUSY`.
7. Run only scenarios required by the Tier-1 matrix row being recorded.
8. Export evidence after the row is complete.

## Mandatory physical environments

### macOS Chromium — integrated camera

Required: permission allow/deny, enumeration, start, exact supported and unsupported resolution behavior, ideal negotiation, stop, preview integrity, JPEG/PNG capture, and capability-driven controls where exposed.

### macOS Chromium — external USB camera

Required: enumerate/select, start, exact/ideal resolution, integrated ↔ external switching, physical disconnect/reconnect, active-track end, explicit recovery, and capture. The external USB run is mandatory for stable `4.0.0`; lack of suitable hardware keeps the release blocked.

### macOS Firefox — integrated camera

Required: permission, enumeration, start, exact/ideal behavior, stop, capture, and normalized error behavior.

### macOS Safari — integrated camera

Required: permission, enumeration, start, exact/ideal behavior, stop, capture, and camera switch where a second camera is available.

### iOS Safari — front and rear cameras

Required: permission, start, front → rear → front switching, exact/ideal behavior, stop, preview integrity, capture, and interruption/recovery observations.

### Android Chrome — front and rear cameras

Required: permission, start, front → rear → front switching, exact/ideal behavior, stop, capture, and torch/zoom only when capabilities expose them.

## Switching evidence rule

Candidate-first switching remains the Webcam-TS v4 authority until physical evidence proves an exclusive-camera limitation.

For iOS Safari, Android Chrome, macOS Safari with multiple cameras, and macOS Chromium integrated ↔ external USB:

1. Start camera A.
2. Switch to camera B without stopping A manually.
3. Confirm the physical preview changed to B.
4. Switch back to A.
5. Record normalized errors and lifecycle states if any acquisition fails.

Do not implement or assume break-before-make behavior from a single failure. A repeatable platform limitation must first be retained as evidence and reflected in an architecture amendment.

## Exact resolution evidence

For Exact mode, record requested width/height and authoritative delivered track settings when exposed.

- Matching delivered settings: the exact-resolution assertion may PASS.
- Different delivered settings: the scenario must FAIL with `CONSTRAINT_UNSATISFIED`; silent fallback is not allowed.
- Missing authoritative settings: record the postcondition as unobservable; do not invent dimensions.
- A camera is not required to support every preset. Correct rejection of an unsupported exact preset is PASS for the unsupported-resolution scenario.

## Disconnect/reconnect evidence

For the external USB row:

1. Start the selected external camera.
2. Physically disconnect it while active.
3. Confirm the active track ends and public state no longer reports an active session.
4. Reconnect the same physical camera.
5. Confirm Webcam-TS does not silently auto-resume it.
6. Recover through an explicit `start()` or `switch()` and verify a new active session.

`devicechange` is advisory; active-track `ended` is the session-loss authority.

## Controls evidence

Torch, zoom, and focus are capability-driven.

- Capability absent: direct use must return `CONTROL_UNSUPPORTED`; conformance scenario is SKIPPED rather than FAIL.
- Capability present: validate the requested value/mode and verify updated settings where observable.
- `applyConstraints()` failure: normalize as `CONTROL_FAILED` without stopping or corrupting the active session.

## Automation is not physical proof

Playwright WebKit does not satisfy the iOS Safari physical Tier-1 gate. Chromium/Firefox/WebKit automation proves deterministic engine-level behavior only; real mobile hardware and external-camera behavior must still be recorded through this runbook.

## Release handling

Any FAIL creates or references a defect before the row can be marked complete. Any BLOCKED condition remains a release blocker for a mandatory Tier-1 row. Stable promotion requires zero open P0 defects and zero open P1 defects, plus PASS evidence for every mandatory Tier-1 row.
