# Changelog

## Unreleased

### Breaking

- Replaced `Camera.switch()` with `Camera.start()` for atomic stream replacement.
- Removed the `switching` status, `switched` stream reason, `switch` operation, and `OPERATION_SUPERSEDED` error.
- Removed the `OperationToken`/`OperationController` testing exports; cancellation now uses one serial pending start.
- A second `start()` while starting is rejected with `INVALID_STATE` instead of superseding.
- Renamed `VideoPreview` to `CameraPreview` (and `VideoPreviewOptions` to `CameraPreviewOptions`).
- Merged capture into one module: `FrameCaptureBackend` is now `FrameEncoder`, `CanvasCaptureBackend` is now `CanvasFrameEncoder`, and `CameraCaptureOptions.backend` is now `encoder`.
- Renamed `CameraDeviceManager.probe()` to `snapshotCapabilities()` (and `CameraCapabilityProbeOptions` to `SnapshotCapabilitiesOptions`).

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
