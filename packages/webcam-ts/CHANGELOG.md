# Changelog

## 5.0.0 — 2026-09-28

### Breaking

- Renamed `WebcamPreview` and `WebcamPreviewOptions` to `Preview` and
  `PreviewOptions` in `webcam-ts/preview`.
- Renamed `WebcamCapture` and `WebcamCaptureOptions` to `Capture` and
  `CaptureOptions` in `webcam-ts/capture`.
- Renamed `WebcamControls` and `WebcamControlUpdate` to `Controls` and
  `ControlUpdate` in `webcam-ts/controls`.
- Renamed the `webcam-ts/testing` export `WebcamEventHub` to `EventHub`.
- Removed the old `Webcam`-prefixed subpath exports without compatibility
  aliases; root `Webcam` and its domain types retain their names.
- `WebcamRequest` takes a whole `MediaDeviceInfo` (`device?`) instead of a
  `deviceId` string; devices without a deviceId are rejected.
- `DeviceCapabilityInfo` stores the frozen `device` record instead of separate
  `deviceId`/`label` fields; `snapshotCapabilities()` takes the device object.

## 4.0.0 — 2026-09-25

### Breaking

- Renamed the public `Camera` facade and its `Camera*` API types to `Webcam` and `Webcam*`.
- Replaced `Webcam.switch()` with `Webcam.start()` for atomic stream replacement.
- Removed the `switching` status, `switched` stream reason, `switch` operation, and `OPERATION_SUPERSEDED` error.
- Removed the `OperationToken`/`OperationController` testing exports; cancellation now uses one serial pending start.
- A second `start()` while starting is rejected with `INVALID_STATE` instead of superseding.
- Renamed `VideoPreview` to `WebcamPreview` (and `VideoPreviewOptions` to `WebcamPreviewOptions`).
- Merged capture into one module: `FrameCaptureBackend` is now `FrameEncoder`, `CanvasCaptureBackend` is now `CanvasFrameEncoder`, and `WebcamCaptureOptions.backend` is now `encoder`.
- Renamed `CameraDeviceManager` to `DeviceManager`, `probe()` to `snapshotCapabilities()`, `list()` to `listDevices()`, and `subscribe()` to `subscribeToDeviceListChanges()`; device lists now use `MediaDeviceInfo`.
- Renamed the capability result and options to `DeviceCapabilityInfo` and `DeviceCapabilityInfoOptions`; `snapshotCapabilities()` remains the capability lookup method.
- Renamed `CameraPermissionService` and its camera-prefixed types to `PermissionService`, `PermissionServiceOptions`, `PermissionMap`, `PermissionRequest`, and `MediaPermissionState`.

## 4.0.0-alpha.1 — 2026-08-06

### Breaking

- Replaced the v3 `Webcam` API with the new `Camera` session facade.
- Removed callback-based configuration and all legacy compatibility surfaces.
- Moved preview, capture, devices, permissions, and controls into explicit subpath services.

### Changed

- `Camera` now owns the lifecycle directly; the internal `CameraSession` module was collapsed into it.
- `/testing` exports `OperationToken` instead of `OperationLease`.

### Added

- Single-owner `Camera` lifecycle with atomic stream replacement on `start()`.
- Serial `start()` with stop/dispose preemption.
- Immutable state snapshots, isolated typed events, and stable error codes.
- SSR-safe package imports and construction.
- Explicit capability probing with active-track reuse and temporary-stream cleanup.
- Packed-tarball package contract tests for all declared entrypoints.

### Status

This is an architecture alpha. Automated synthetic tests pass, but the stable `4.0.0` release remains gated on real-browser and real-device verification.
