# Changelog

## 4.0.0-alpha.1 — 2026-08-06

### Breaking

- Replaced the v3 `Webcam` API with the new `Camera` session facade.
- Removed callback-based configuration and all legacy compatibility surfaces.
- Moved preview, capture, devices, permissions, and controls into explicit subpath services.

### Added

- Single-owner `CameraSession` lifecycle with atomic `switch()` transactions.
- Latest-command-wins switching and stop/dispose preemption.
- Immutable state snapshots, isolated typed events, and stable error codes.
- SSR-safe package imports and construction.
- Explicit capability probing with active-track reuse and temporary-stream cleanup.
- Packed-tarball package contract tests for all declared entrypoints.

### Status

This is an architecture alpha. Automated synthetic tests pass, but the stable `4.0.0` release remains gated on the real-browser and real-device verification matrix documented in the architecture specification.
