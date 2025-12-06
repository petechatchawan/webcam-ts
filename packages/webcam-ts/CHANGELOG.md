# Changelog

All notable changes to the Webcam-TS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.2] - 2025-12-07

### 🐛 Bug Fixes

- **Resolution Label Tracking**: Fixed `getCurrentResolution()` to return the original user-defined label instead of generating a generic label
  - Previously: Opening camera with `{ label: 'S720', width: 720, height: 720 }` would return `label: "720x720"`
  - Now: Returns the original `label: "S720"` as specified in `preferredResolutions`
  - Added `activeResolution` field to `WebcamStateInternal` to store the resolution used when starting the camera
  - `Stream.startStream()` now returns both the stream and the resolution that was successfully used
  - Maintains backward compatibility with fallback to generated labels when no resolution is stored

### 🔧 Technical Details

**Changes:**

- Added `activeResolution?: Resolution` to `WebcamStateInternal` interface
- Modified `Stream.startStream()` to return `{ stream: MediaStream; usedResolution: Resolution | null }`
- Updated `Webcam.start()` to store the used resolution in state
- Enhanced `getCurrentResolution()` to prioritize stored resolution with original label
- Updated `Webcam.stop()` to clear `activeResolution` on cleanup

**Use Cases:**

- Display user-friendly resolution labels in UI (e.g., "HD", "4K", "Square HD")
- Track which resolution preset was actually used for analytics
- Verify that the camera opened with the correct resolution configuration
- Show current resolution status with meaningful labels

## [3.4.1] - 2025-12-06

### 🔧 Improvements

- **Refactored Type Definitions**: Introduced `BaseCaptureOptions` to eliminate Code duplication
  - `CaptureImageDataOptions`, `CaptureOptions`, and `CaptureImageBitmapOptions` now all extend `BaseCaptureOptions`
  - Ensures consistent option availability (scale, mirror, crop) across all methods
  - Cleaner and more maintainable type hierarchy

## [3.4.0] - 2025-12-06

### ✨ New Features

- **Universal Cropping Support**: Added `crop` option to all capture methods (`captureImageData`, `captureImage`, `captureImageBitmap`)
  - Allows capturing a specific region of interest from the video feed
  - Supports scaling and mirroring simultaneously with cropping
  - optimized implementation using native canvas source-rect drawing

### ⚡ Performance

- **Refined Capture Logic**: Unified resizing and drawing logic across all methods for better maintainability and performance consistency

## [3.3.1] - 2025-12-06

### ⚡ Performance

- **Optimized ImageBitmap Capture**: Implemented lazy initialization and object pooling for `captureImageBitmap()` mirror operations
  - Eliminates Garbage Collection (GC) pressure during high-frequency loops (60+ FPS)
  - Reuses canvas resources instead of creating new ones for each frame
  - Significant stability improvement for long-running real-time applications

## [3.3.0] - 2025-12-05

### ✨ New Features

- **Ultra-Fast ImageBitmap Capture**: Added `captureImageBitmap()` method (~0.5-1ms per frame)
  - Ideal for Web Workers (OffscreenCanvas), Tesseract.js, and other high-performance scenarios
  - Supports `mirror`, `scale`, and native `crop` options
  - Returns structured `CaptureImageBitmapResult`
  - Significantly faster than `captureImageData()` for certain use cases

### 📚 Documentation

- Added detailed usage examples for `captureImageBitmap()`
- Clarified memory management requirements (manual `.close()` call)
- Added performance comparison table for all capture methods

## [3.2.1] - 2025-12-05

### ✨ New Features

- **Separate Options Interface**: Created `CaptureImageDataOptions` interface for `captureImageData()` method
  - Contains only relevant options: `scale` and `mirror`
  - Improves type safety and developer experience
  - `CaptureOptions` now extends `CaptureImageDataOptions` for backward compatibility

### 🔧 Improvements

- **Consistent Naming**: Renamed `CaptureResult` to `CaptureImageResult` for consistency with `CaptureImageDataResult`
- **Better Type Safety**: TypeScript will now warn if incorrect options are used with `captureImageData()`
- **Enhanced IDE Support**: Autocomplete now shows only relevant options for each capture method

### 📚 Documentation

- Updated README with separate option interfaces documentation
- Added performance comparison between capture methods
- Improved API reference with clearer method descriptions

### 🔄 Migration Notes

**Non-breaking changes:**

- `CaptureResult` renamed to `CaptureImageResult` (update imports if using explicit type)
- `captureImageData()` now uses `CaptureImageDataOptions` (fully compatible with previous usage)

```typescript
// Before (still works)
import { CaptureResult } from "webcam-ts";

// After (recommended)
import { CaptureImageResult } from "webcam-ts";
```

## [3.2.0] - 2025-12-05

### ✨ New Features

- **Structured ImageData Result**: `captureImageData()` now returns `CaptureImageDataResult` instead of raw `ImageData`
  - Includes `imageData`, `width`, `height`, and `timestamp`
  - Maintains same performance (~2-3ms per frame)
  - Better developer experience with metadata access

### 📚 Documentation

- Added comprehensive usage examples for both capture methods
- Documented performance characteristics
- Added migration guide for existing users

## [3.1.2] - 2025-12-04

### 🔧 Fixed

- **isSupported Method**: Changed from static to instance method for consistent API usage
  ```typescript
  const webcam = new Webcam();
  if (webcam.isSupported()) {
  	// Browser supports webcam
  }
  ```

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
