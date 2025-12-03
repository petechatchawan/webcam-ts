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
import { TsWebcam } from "webcam-ts";

// Initialize
const webcam = new TsWebcam();

// Get available devices
const devices = await webcam.getVideoDevices();
console.log("Available cameras:", devices);

// Configure the webcam
const config = {
	deviceInfo: devices[0],
	preferredResolutions: { width: 1280, height: 720 },
	videoElement: document.getElementById("video") as HTMLVideoElement,

	// Optional callbacks
	onStateChange: (state) => console.log("State changed:", state.status),
	onError: (error) => console.error("Error:", error.message),
	onStreamStart: (stream) => console.log("Stream started"),
	onStreamStop: () => console.log("Stream stopped"),
};

// Start the camera
await webcam.startCamera(config);

// Take a photo with default settings
const result = await webcam.captureImage();
console.log("Base64 image:", result.base64);

// Or with custom options
const customCapture = await webcam.captureImage({
	imageType: "image/jpeg", // default: 'image/jpeg'
	quality: 0.8, // 0-1, default: 0.92
	scale: 0.5, // 0.1-2, default: 1.0
});

// Result contains both blob and base64 formats
const { blob, base64, width, height, mimeType, timestamp } = customCapture;

// Stop the camera when done
webcam.stopCamera();
```

## 📚 API Reference

### 🔧 Core Methods

| Method                            | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `new Webcam()`                    | Creates a new webcam instance                  |
| `startCamera(config)`             | Starts the camera with the given configuration |
| `stopCamera()`                    | Stops the camera and releases resources        |
| `captureImage(options?)`          | Captures a photo with advanced options         |
| `getVideoDevices()`               | Lists available video devices                  |
| `getDeviceCapabilities(deviceId)` | Gets capabilities of a specific device         |
| `requestPermissions(constraints)` | Requests camera permissions                    |
| `setTorch(enabled)`               | Toggles the camera's torch (if supported)      |
| `setZoom(factor)`                 | Sets the camera zoom level (if supported)      |
| `setFocusMode(mode)`              | Sets focus mode (if supported)                 |
| `dispose()`                       | Cleans up all resources                        |

### 📸 Capture Options

```typescript
interface CaptureOptions {
	/** Image type, e.g., 'image/jpeg' or 'image/png' (default: 'image/jpeg') */
	imageType?: string;
	/** Image quality from 0 to 1 (only applicable for image/jpeg) (default: 0.92) */
	quality?: number;
	/** Scale factor (0.1-2) to resize the captured image (default: 1.0) */
	scale?: number;
}

interface CaptureResult {
	/** The captured image as a Blob */
	blob: Blob;
	/** Base64 encoded image data */
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
interface WebcamConfig {
	deviceInfo?: MediaDeviceInfo; // Selected camera device
	videoElement?: HTMLVideoElement; // Video element to display the stream
	preferredResolutions?: {
		// Preferred resolution(s)
		width: number;
		height: number;
	}[];
	enableAudio?: boolean; // Enable audio capture
	enableMirror?: boolean; // Mirror the video (for user-facing cameras)
	debug?: boolean; // Enable debug logging

	// Callbacks
	onStateChange?: (state: WebcamState) => void;
	onError?: (error: WebcamError) => void;
	onStreamStart?: (stream: MediaStream) => void;
	onStreamStop?: () => void;
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
// Request permissions
const permissions = await webcam.requestPermissions({
	video: true,
	audio: false,
});

// Check current permissions
const currentPermissions = webcam.getState().permissions;
console.log("Camera permission:", currentPermissions.camera);

// Test what a specific camera can do
const deviceId = devices[0].deviceId;
const capabilities = await webcam.getDeviceCapabilities(deviceId);

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
	},
	onStreamStart: (stream) => {
		console.log("Stream started");
	},
	onStreamStop: () => {
		console.log("Stream stopped");
	},
};
```

### 4. Starting and Stopping the Camera

```typescript
try {
	await webcam.startCamera(config);
	console.log("Camera started successfully");
} catch (error) {
	console.error("Failed to start camera:", error.message);
}

// Stop the camera when done
webcam.stopCamera();
// Optional: Remove video element source
if (videoElement) {
	videoElement.srcObject = null;
}
```

### 5. Error Handling

```typescript
try {
	await webcam.startCamera(config);
} catch (error) {
	if (error.code === "PERMISSION_DENIED") {
		console.error("Please grant camera permissions");
	} else if (error.code === "DEVICE_NOT_FOUND") {
		console.error("No camera found");
	} else {
		console.error("Camera error:", error.message);
	}
}
```

### 6. Capturing Images

```typescript
// Basic capture
try {
	const blob = await webcam.capture();
	const imageUrl = URL.createObjectURL(blob);
	// Use the image URL
} catch (error) {
	console.error("Capture failed:", error.message);
}

// With image quality (0-1)
const highQualityImage = await webcam.capture({ quality: 0.92 });
```

### 7. Torch/Flash Control

```typescript
// Check if torch is supported
const capabilities = await webcam.getDeviceCapabilities(deviceId);
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
const capabilities = await webcam.getDeviceCapabilities(deviceId);
if (capabilities.maxZoom && capabilities.maxZoom > 1) {
	// Set zoom level (1.0 = no zoom)
	await webcam.setZoom(2.0); // 2x zoom
}
```

### 9. Focus Mode

```typescript
// Check supported focus modes
const capabilities = await webcam.getDeviceCapabilities(deviceId);
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

### 11. Checking Device Capabilities

```typescript
// Get all video devices
const devices = await webcam.getVideoDevices();

// Test each device
for (const device of devices) {
	const capabilities = await webcam.getDeviceCapabilities(device.deviceId);
	console.log(`Device: ${device.label || "Unknown"}`);
	console.log("Capabilities:", {
		hasTorch: capabilities.hasTorch,
		maxZoom: capabilities.maxZoom,
		focusModes: capabilities.supportedFocusModes,
		resolutions: capabilities.supportedResolutions,
	});
}
```

### 12. Switching Cameras

```typescript
let currentDeviceIndex = 0;

async function switchCamera() {
	// Stop current camera
	webcam.stopCamera();

	// Get updated device list
	const devices = await webcam.getVideoDevices();
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

	await webcam.startCamera(newConfig);
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
