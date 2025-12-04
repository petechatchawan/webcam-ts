# Changelog

All notable changes to the Webcam-TS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.1] - 2025-12-04

### ✨ New Features

- **Browser Support Detection**: Added `Webcam.isSupported()` static method to check if MediaDevices API is available
  ```typescript
  if (Webcam.isSupported()) {
  	// Browser supports webcam
  }
  ```

## [3.1.0] - 2025-12-04

### ✨ New Features

- **CaptureResult Enhancement**: Added `url` field to `CaptureResult` for immediate preview usage
  - `url`: Object URL created from blob for instant preview
  - `blob`: For upload/download operations
  - `base64`: Always included for embedding
  - Remember to revoke URL with `URL.revokeObjectURL()` when done

### 🛠️ Improvements

- **Comprehensive Error Handling**:
  - Added `STREAM_ERROR` and `CONSTRAINT_ERROR` error codes
  - All methods now throw `WebcamError` with specific error codes
  - Enhanced error messages for better debugging
  - Added `originalError` property for accessing underlying errors
- **Input Validation**:
  - `setZoom()` now validates zoom level (must be >= 1.0)
  - Throws `INVALID_CONFIG` error for invalid zoom values
- **Error Callbacks**:
  - Device change detection errors now use `onError` callback instead of `console.error`
  - Consistent error handling across all modules
- **Code Quality**:
  - Extracted default resolution to constant (1280x720)
  - Improved resource cleanup in capture operations
  - Better type safety in FileReader operations

### 🐛 Bug Fixes

- **Capture Module**: Fixed potential resource leaks by revoking object URLs on failure
- **Stream Module**: Added proper error handling to `applyConstraints()`
- **Device Module**: Enhanced permission request error handling with 6 specific error types

### 📚 Documentation

- Updated README.md with:
  - New `CaptureResult` structure with `url` field
  - Comprehensive error handling examples
  - Zoom validation documentation
  - Device change callback examples
  - All 12 error codes documented

### 🔧 Technical Details

**Error Codes Added:**

- `STREAM_ERROR`: Stream operation errors
- `CONSTRAINT_ERROR`: Constraint application failures

**Breaking Changes:** None - Fully backward compatible

**Migration Notes:**

- `CaptureResult` now includes `url` field (non-breaking addition)
- Remember to clean up URLs: `URL.revokeObjectURL(result.url)`

## [3.0.0] - 2025-12-03

### 🔥 Breaking Changes

- **Class Renaming**: `TsWebcam` is now `Webcam`.
- **Method Renaming**:
  - `startCamera(config)` -> `start(config)`
  - `stopCamera()` -> `stop()`
  - `captureImage(options)` -> `capture(options)`
- **Architecture**: Refactored into modular services (`DeviceService`, `StreamService`, `CaptureService`).

### ✨ New Features

- **Mirroring Support**: `capture()` now correctly mirrors the image if `enableMirror` is true.
- **Performance**: `capture()` reuses the canvas element to reduce garbage collection.
- **Type Safety**: Extended `MediaTrackConstraintSet` to natively support `torch`, `zoom`, and `focusMode` (removed `@ts-ignore`).
- **Helper Methods**: Restored and improved helper methods:
  - `getDevices()`
  - `getCapabilities(deviceId)`
  - `isTorchSupported()`, `isZoomSupported()`, `isFocusSupported()`
  - `getCurrentDevice()`, `getCurrentResolution()`

### 🛠️ Improvements

- **Clean API**: Simplified public API surface.
- **Documentation**: Updated README with comprehensive examples and new API usage.

## [2.0.9] - 2025-07-16

### ✨ Changed

- Updated `captureImage()` to return full data URL in `base64` field (including data URL prefix)
- Improved video element initialization and error handling

## [2.0.8] - 2025-07-16

### ✨ Added

- **Enhanced Image Capture**:
  - Added `CaptureResult` interface with `blob`, `base64`, `width`, `height`, `mimeType`, and `timestamp`
  - Improved `captureImage()` to return both blob and base64 formats
  - Added support for image scaling and quality adjustment
  - Added comprehensive error handling and input validation

### 🐛 Fixed

- Fixed potential memory leaks in image capture
- Improved error messages for better debugging
- Fixed TypeScript type definitions for better developer experience

### 🔄 Changed

- Updated `captureImage()` method signature to return `Promise<CaptureResult>`
- Improved documentation with usage examples
- Optimized image capture performance

## [2.0.7] - 2025-07-16

### ✨ New Features

- **Device and Resolution Tracking**: Added `getCurrentDevice()` and `getCurrentResolution()` methods to track active camera and resolution
- **Improved Debugging**: Introduced dedicated debug logging system with `enableDebug()`, `disableDebug()`, and `debugLog()` methods
- **Enhanced Resolution Handling**: Improved support for multiple preferred resolutions with automatic fallback mechanism

### 🛠️ Improvements

- **Resolution Validation**: Made resolution validation mandatory when specifying preferred resolutions
- **Cleaner Configuration**: Removed `validateResolution` and `debug` options from configuration, using dedicated methods instead
- **Better Error Messages**: Enhanced error messages with attempted resolutions and device information
- **Simplified Device Selection**: Made `deviceInfo` optional in configuration, automatically selecting first available device if not provided
- **Resolution Fallback**: Improved resolution fallback mechanism to try multiple resolutions until a working one is found

### 🐛 Bug Fixes

- **Stream Variable Initialization**: Fixed TypeScript error related to stream variable initialization
- **Error Code Consistency**: Fixed incorrect error code usage (NO_DEVICE_FOUND -> DEVICE_NOT_FOUND)

## [2.0.0] - 2025-07-02

### 🔥 Breaking Changes

- **Modular Architecture**: Complete refactor into separate modules (`types.ts`, `errors.ts`, `event-emitter.ts`, `webcam-ts-core.ts`)
- **Unified State Management**: Introduced `TsWebcamState` as single source of truth for all webcam state
- **Updated API**: Simplified and more consistent method signatures
- **Event System Overhaul**: New event naming convention (`state:change`, `stream:start`, etc.)
- **Permission API**: Replaced individual permission methods with unified `requestPermissions(options)`

### ✨ New Features

- **Flexible Permission Requests**: Granular control over camera and audio permissions with `PermissionRequestOptions`
- **State Observability**: Complete reactive state management with `TsWebcamState`
- **Device Capabilities Detection**: Advanced device feature detection with `getDeviceCapabilities()`
- **Torch/Flash Support**: Control camera flash/torch when available on devices
- **Enhanced Error Handling**: Comprehensive `WebcamError` types with detailed error information
- **Debug Mode**: Built-in debugging and logging capabilities
- **Resource Management**: Improved cleanup and resource disposal

### 🛠️ Improvements

- **TypeScript**: Full type safety with comprehensive type definitions
- **Performance**: Optimized resource management and memory usage
- **Reliability**: Better error handling and edge case coverage
- **Developer Experience**: Enhanced debugging, logging, and IntelliSense support
- **Cross-Platform**: Improved compatibility across desktop and mobile browsers
- **Documentation**: Comprehensive API documentation and examples

### 🐛 Bug Fixes

- **Memory Leaks**: Fixed potential memory leaks in event listeners and stream management
- **Permission Handling**: Improved permission state tracking and edge cases
- **Device Detection**: Better handling of device changes and hot-plugging
- **Stream Cleanup**: Enhanced stream disposal and cleanup procedures

### 📦 Dependencies

- **Updated TypeScript**: Support for latest TypeScript features
- **Modern ES Modules**: Full ES6+ module support
- **Browser Compatibility**: Maintained compatibility with modern browsers

### 🔄 Migration Guide

#### Updated Imports

```typescript
// Before (1.x)
import { TsWebcam } from "webcam-ts/dist/webcam-ts";

// After (2.0)
import { TsWebcam, TsWebcamState, WebcamError } from "webcam-ts";
```

#### State Management

```typescript
// Before (1.x)
webcam.on('statusChange', (status) => { ... });
webcam.on('errorChange', (error) => { ... });

// After (2.0)
webcam.on('state:change', (state: TsWebcamState) => {
  console.log('Status:', state.status);
  console.log('Error:', state.error);
  console.log('Permissions:', state.permissions);
});
```

#### Permission Handling

```typescript
// Before (1.x)
await webcam.requestCameraPermission();

// After (2.0)
await webcam.requestPermissions({ video: true, audio: false });
```

#### Configuration

```typescript
// Before (1.x)
await webcam.startCamera(device, resolution, videoElement);

// After (2.0)
await webcam.startCamera({
	deviceInfo: device,
	preferredResolutions: resolution,
	videoElement: videoElement,
	enableAudio: false,
	enableMirror: true,
});
```

### 🎯 Angular Integration

- **Modern Angular Support**: Full compatibility with Angular 17+ and signals
- **Service Integration**: Enhanced Angular service with reactive state management
- **Component Examples**: Complete Angular component examples with best practices

## [1.x.x] - Previous Versions

Previous versions focused on basic webcam functionality with limited API surface.
