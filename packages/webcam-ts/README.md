<div align="center">
  <h1>Webcam-TS</h1>
  <p>
    <strong>A modern, type-safe TypeScript library for webcam interactions in the browser</strong>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/webcam-ts">
      <img src="https://img.shields.io/npm/v/webcam-ts" alt="npm version" />
    </a>
    <a href="https://github.com/petechatchawan/webcam-ts/blob/main/LICENSE">
      <img src="https://img.shields.io/npm/l/webcam-ts" alt="license" />
    </a>
  </p>
</div>

## ✨ Features

- **TypeScript First** - Fully typed API with excellent IDE support
- **Multi-Device Support** - Work with multiple cameras and resolutions
- **Permission Management** - Granular control over camera and audio permissions
- **Cross-Platform** - Works across desktop and mobile browsers
- **Advanced Controls** - Torch, zoom, and focus mode support
- **Reactive State** - Built-in state management with callbacks
- **Modular Design** - Lightweight and tree-shakeable

## 🚀 Demo

Experience the live demo: [Webcam-TS Demo](https://webcam-ts-docs.vercel.app/)

## 📦 Installation

```bash
# npm
$ npm install webcam-ts

# yarn
$ yarn add webcam-ts

# pnpm
$ pnpm add webcam-ts
```

## 🚀 Getting Started

```typescript
import { Webcam } from "webcam-ts";

// Initialize
const webcam = new Webcam();

// Get available devices
const devices = await webcam.getDevices();
console.log("Available cameras:", devices);

// Configure the webcam
const config = {
	deviceInfo: devices[0],
	preferredResolutions: { width: 1280, height: 720 },
	videoElement: document.getElementById("video") as HTMLVideoElement,
	enableMirror: true, // Mirror the video (and capture)

	// Optional callbacks
	onStateChange: (state) => console.log("State changed:", state.status),
	onError: (error) => console.error("Error:", error.message),
	onStreamStart: (stream) => console.log("Stream started"),
	onStreamStop: () => console.log("Stream stopped"),
};

// Start the camera
await webcam.start(config);

// Take a photo
const result = await webcam.captureImage();

// Result contains blob, url, and base64
const { blob, url, base64, width, height, mimeType, timestamp } = result;

// Use the url for preview (remember to revoke when done)
imageElement.src = url;

// Or upload the blob
const formData = new FormData();
formData.append("image", blob);

// Clean up the URL when done
URL.revokeObjectURL(url);

// Custom capture options
const customCapture = await webcam.captureImage({
	imageType: "image/png", // default: 'image/jpeg'
	quality: 0.95, // 0-1, default: 0.92
	scale: 0.5, // 0.1-2, default: 1.0
	mirror: false, // Override mirror setting for this capture
});

// Stop the camera when done
webcam.stop();
```

## 📚 API Reference

### 🔧 Core Methods

| Method                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `new Webcam(config?)`       | Creates a new webcam instance                  |
| `start(config?)`            | Starts the camera with the given configuration |
| `stop()`                    | Stops the camera and releases resources        |
| `captureImage(options?)`    | Captures a photo with advanced options         |
| `getDevices()`              | Lists available video devices                  |
| `getCapabilities(deviceId)` | Gets capabilities of a specific device         |
| `checkPermissions()`        | Checks current camera/microphone permissions   |
| `requestPermissions(opts?)` | Requests camera/microphone permissions         |
| `setTorch(enabled)`         | Toggles the camera's torch (if supported)      |
| `setZoom(factor)`           | Sets the camera zoom level (if supported)      |
| `setFocusMode(mode)`        | Sets focus mode (if supported)                 |
| `dispose()`                 | Cleans up all resources                        |

### 📸 Capture Options

```typescript
interface CaptureOptions {
	/** Image type, e.g., 'image/jpeg' or 'image/png' (default: 'image/jpeg') */
	imageType?: string;
	/** Image quality from 0 to 1 (only applicable for image/jpeg) (default: 0.92) */
	quality?: number;
	/** Scale factor (0.1-2) to resize the captured image (default: 1.0) */
	scale?: number;
	/** Explicitly mirror the capture (overrides config.enableMirror) */
	mirror?: boolean;
}

interface CaptureResult {
	/** The captured image as a Blob (for upload/download) */
	blob: Blob;
	/** Object URL for preview (remember to revoke when done) */
	url: string;
	/** Base64 encoded image data (always included) */
	base64: string;
	/** Width of the captured image in pixels */
	width: number;
	/** Height of the captured image in pixels */
	height: number;
	/** MIME type of the captured image */
	mimeType: string;
	/** Timestamp when the capture was taken */
	timestamp: number;
}
```

### ⚙️ Configuration Options

```typescript
interface WebcamConfiguration {
	deviceInfo?: MediaDeviceInfo; // Selected camera device
	videoElement?: HTMLVideoElement; // Video element to display the stream
	preferredResolutions?:
		| {
				// Preferred resolution(s)
				width: number;
				height: number;
		  }
		| { width: number; height: number }[];
	enableAudio?: boolean; // Enable audio capture
	enableMirror?: boolean; // Mirror the video (for user-facing cameras)

	// Callbacks
	onStateChange?: (state: WebcamState) => void;
	onError?: (error: Error) => void;
	onStreamStart?: (stream: MediaStream) => void;
	onStreamStop?: () => void;
	onPermissionChange?: (permissions: Record<string, PermissionState>) => void;
	onDeviceChange?: (devices: MediaDeviceInfo[]) => void;
}
```

## 📝 Examples

### 1. State Management

```typescript
// Get current state
const state = webcam.getState();
console.log("Current status:", state.status);

// Listen for state changes
const config = {
	// ... other config
	onStateChange: (state) => {
		console.log("State changed to:", state.status);
		if (state.error) {
			console.error("Error:", state.error.message);
		}
	},
};
```

### 2. Permission Handling

```typescript
// Check current permissions
const currentPermissions = webcam.getState().permissions;
console.log("Camera permission:", currentPermissions.camera);

// Test what a specific camera can do
const deviceId = devices[0].deviceId;
const capabilities = await webcam.getCapabilities(deviceId);

console.log("Device capabilities:", {
	maxResolution: `${capabilities.maxWidth}x${capabilities.maxHeight}`,
	hasZoom: capabilities.hasZoom,
	hasTorch: capabilities.hasTorch,
	supportedFocusModes: capabilities.supportedFocusModes,
});
```

### 3. Configuration and Callbacks

```typescript
const config = {
	deviceInfo: devices[0],
	preferredResolutions: [
		{ width: 1920, height: 1080 },
		{ width: 1280, height: 720 },
	],
	enableAudio: false,
	enableMirror: true,

	// Event callbacks
	onStateChange: (state) => {
		console.log("State:", state.status);
	},
	onError: (error) => {
		console.error("Error:", error.message);
		// This callback also receives device change detection errors
	},
	onStreamStart: (stream) => {
		console.log("Stream started");
	},
	onStreamStop: () => {
		console.log("Stream stopped");
	},
	onDeviceChange: (devices) => {
		console.log("Devices changed:", devices.length);
		// Called when cameras are plugged/unplugged
	},
};
```

### 4. Starting and Stopping the Camera

```typescript
try {
	await webcam.start(config);
	console.log("Camera started successfully");
} catch (error) {
	console.error("Failed to start camera:", error.message);
}

// Stop the camera when done
webcam.stop();
// Optional: Remove video element source
if (videoElement) {
	videoElement.srcObject = null;
}
```

### 5. Error Handling

```typescript
import { WebcamError, WebcamErrorCode } from "webcam-ts";

try {
	await webcam.start(config);
} catch (error) {
	if (error instanceof WebcamError) {
		switch (error.code) {
			case WebcamErrorCode.PERMISSION_DENIED:
				console.error("Camera permission denied");
				break;
			case WebcamErrorCode.DEVICE_NOT_FOUND:
				console.error("No camera found");
				break;
			case WebcamErrorCode.DEVICE_BUSY:
				console.error("Camera is already in use");
				break;
			case WebcamErrorCode.STREAM_ERROR:
				console.error("Stream error:", error.message);
				break;
			default:
				console.error("Camera error:", error.message);
		}
		// Access original error for debugging
		console.debug("Original error:", error.originalError);
	}
}

// Available error codes:
// - PERMISSION_DENIED: User denied camera access
// - DEVICE_NOT_FOUND: No camera device found
// - DEVICE_BUSY: Camera is in use by another application
// - OVERCONSTRAINED: Requested constraints cannot be satisfied
// - CONSTRAINT_ERROR: Constraint application failed
// - STREAM_FAILED: Stream initialization failed
// - STREAM_ERROR: Stream operation error
// - CAPTURE_FAILED: Image capture failed
// - INVALID_CONFIG: Invalid configuration provided
// - VIDEO_ELEMENT_NOT_SET: Video element not attached
// - DEVICES_ERROR: Device enumeration failed
// - UNKNOWN_ERROR: Unknown error occurred
```

### 6. Capturing Images

```typescript
// Basic capture
try {
	const result = await webcam.captureImage();

	// Use the url for preview (already created)
	imageElement.src = result.url;

	// Or use blob for upload
	const formData = new FormData();
	formData.append("image", result.blob);

	// Or use base64 for embedding
	const img = document.createElement("img");
	img.src = result.base64;

	// Clean up when done
	URL.revokeObjectURL(result.url);
} catch (error) {
	console.error("Capture failed:", error.message);
}

// With custom options
const customImage = await webcam.captureImage({
	imageType: "image/png",
	quality: 0.95,
	scale: 0.5, // Resize to 50%
	mirror: true, // Mirror the capture
});
```

### 7. Torch/Flash Control

```typescript
// Check if torch is supported
const capabilities = await webcam.getCapabilities(deviceId);
if (capabilities.hasTorch) {
	// Turn on torch
	await webcam.setTorch(true);

	// Turn off torch
	await webcam.setTorch(false);
}
```

### 8. Zoom Control

```typescript
// Get zoom capabilities
const capabilities = await webcam.getCapabilities(deviceId);
if (capabilities.maxZoom && capabilities.maxZoom > 1) {
	try {
		// Set zoom level (must be >= 1.0, where 1.0 = no zoom)
		await webcam.setZoom(2.0); // 2x zoom

		// Invalid zoom will throw error
		// await webcam.setZoom(0.5); // ❌ Throws INVALID_CONFIG error
	} catch (error) {
		if (error.code === WebcamErrorCode.INVALID_CONFIG) {
			console.error("Invalid zoom level");
		}
	}
}
```

### 9. Focus Mode

```typescript
// Check supported focus modes
const capabilities = await webcam.getCapabilities(deviceId);
if (capabilities.supportedFocusModes?.includes("continuous")) {
	// Set continuous focus
	await webcam.setFocusMode("continuous");
}

// Manual focus
await webcam.setFocusMode("manual");
```

### 10. Cleanup

```typescript
// When you're done with the webcam
webcam.dispose();
```

### 11. Switching Cameras

```typescript
let currentDeviceIndex = 0;

async function switchCamera() {
	// Stop current camera
	webcam.stop();

	// Get updated device list
	const devices = await webcam.getDevices();
	if (devices.length === 0) {
		console.error("No cameras available");
		return;
	}

	// Switch to next device
	currentDeviceIndex = (currentDeviceIndex + 1) % devices.length;

	// Start with new device
	const newConfig = {
		...config,
		deviceInfo: devices[currentDeviceIndex],
	};

	await webcam.start(newConfig);
	console.log(`Switched to camera: ${devices[currentDeviceIndex].label || "Unknown"}`);
}
```

## 🌐 Browser Support

This library requires browser support for the [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

| Browser            | Version |
| ------------------ | ------- |
| Chrome             | 60+     |
| Firefox            | 55+     |
| Edge               | 79+     |
| Safari             | 11+     |
| Chrome for Android | 60+     |
| iOS Safari         | 11+     |

For detailed compatibility information, see the [MDN compatibility table](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#browser_compatibility).

## ℹ️ Built With

This library is built on top of the following web standards and APIs:

- [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices) - For device enumeration and media capture
- [MediaStream API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream) - For handling media streams

## 🤝 Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## 📄 License

MIT © [petechatchawan](https://github.com/petechatchawan/webcam-ts)

---
