# Changelog

## Unreleased

### Breaking

- Replaced `Camera.switch()` with `Camera.start()` for atomic stream replacement.
- Removed the `switching` status, `switched` stream reason, `switch` operation, and `OPERATION_SUPERSEDED` error.
- Removed the `OperationToken`/`OperationController` testing exports; cancellation now uses one serial pending start.
- A second `start()` while starting is rejected with `INVALID_STATE` instead of superseding.

## 4.0.0-alpha.1 — 2026-08-06

### Breaking

- Replaced the v3 `Webcam` API with the new `Camera` session facade.
- Removed callback-based configuration and all legacy compatibility surfaces.
- Moved preview, capture, devices, permissions, and controls into explicit subpath services.

### Changed

- `Camera` now owns the lifecycle directly; the internal `CameraSession` module was collapsed into it.
- `/testing` exports `OperationToken` instead of `OperationLease`.

### Added

- Single-owner `Camera` lifecycle with atomic `switch()` transactions.
- Latest-command-wins switching and stop/dispose preemption.
- Immutable state snapshots, isolated typed events, and stable error codes.
- SSR-safe package imports and construction.
- Explicit capability probing with active-track reuse and temporary-stream cleanup.
- Packed-tarball package contract tests for all declared entrypoints.

### Status

This is an architecture alpha. Automated synthetic tests pass, but the stable `4.0.0` release remains gated on the real-browser and real-device verification matrix documented in the architecture specification.
