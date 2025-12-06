export type FocusMode = "manual" | "single-shot" | "continuous" | "auto" | "none";

declare global {
	interface MediaTrackConstraintSet {
		torch?: boolean;
		zoom?: number | ConstrainDouble;
		focusMode?: FocusMode | ConstrainDOMString;
	}

	interface MediaTrackCapabilities {
		torch?: boolean;
		zoom?: { min: number; max: number; step: number };
		focusMode?: FocusMode[];
	}

	interface MediaTrackSettings {
		torch?: boolean;
		zoom?: number;
		focusMode?: FocusMode;
	}
}

export interface Resolution {
	label: string;
	width: number;
	height: number;
}

export interface DeviceCapability {
	deviceId: string;
	label: string;
	maxWidth: number;
	maxHeight: number;
	minWidth: number;
	minHeight: number;
	supportedFrameRates?: number[];
	hasZoom?: boolean;
	hasTorch?: boolean;
	hasFocus?: boolean;
	maxZoom?: number;
	minZoom?: number;
	supportedFocusModes?: FocusMode[];
}

export interface PermissionRequestOptions {
	video?: boolean;
	audio?: boolean;
}

export interface WebcamConfiguration {
	deviceInfo?: MediaDeviceInfo;
	preferredResolutions?: Resolution | Resolution[];
	videoElement?: HTMLVideoElement;
	enableAudio?: boolean;
	enableMirror?: boolean;

	// Callbacks
	onStateChange?: (state: any) => void;
	onStreamStart?: (stream: MediaStream) => void;
	onStreamStop?: () => void;
	onError?: (error: Error) => void;
	onPermissionChange?: (permissions: Record<string, PermissionState>) => void;
	onDeviceChange?: (devices: MediaDeviceInfo[]) => void;
}

export type WebcamStatus = "idle" | "initializing" | "ready" | "error";

export interface WebcamStateInternal {
	status: WebcamStatus;
	activeStream: MediaStream | null;
	permissions: Record<string, PermissionState>;
	videoElement?: HTMLVideoElement;
	device?: MediaDeviceInfo;
	error?: Error | null;
	zoomLevel?: number;
	focusMode?: FocusMode;
	torchEnabled?: boolean;
	activeResolution?: Resolution; // Store the resolution that was used to start the stream
}

export type WebcamState = Readonly<WebcamStateInternal>;

/**
 * Crop region for capture operations
 * Defines a rectangular region of interest in the source video
 */
export interface CropRegion {
	x: number; // x coordinate in pixels
	y: number; // y coordinate in pixels
	width: number; // width in pixels
	height: number; // height in pixels
}

/**
 * Base options shared across all capture methods
 */
export interface BaseCaptureOptions {
	/**
	 * Scale factor for resizing (0.1-2.0)
	 * @default 1.0
	 */
	scale?: number;

	/**
	 * Mirror/flip image horizontally
	 * @default false
	 */
	mirror?: boolean;

	/**
	 * Native crop region (applied at source)
	 * Defines which part of the video frame to capture
	 */
	crop?: CropRegion;
}

/**
 * Options for captureImage() - Snapshot/Save/Upload
 * Full options including blob/base64 conversion
 */
export interface CaptureImageOptions extends BaseCaptureOptions {
	/**
	 * Image type for blob/base64 conversion
	 * @default "image/jpeg"
	 */
	imageType?: "image/jpeg" | "image/png" | "image/webp";

	/**
	 * Image quality (0-1) for lossy formats (JPEG, WebP)
	 * @default 0.92
	 */
	quality?: number;

	/**
	 * Include base64 string in result
	 * Set to false to skip base64 conversion and improve performance
	 * @default true
	 */
	includeBase64?: boolean;
}

/**
 * Options for captureImageData() - Real-time CV processing
 * Lightweight options for high-performance loops (60+ FPS)
 */
export interface CaptureImageDataOptions extends BaseCaptureOptions {
	// Inherits scale, mirror, crop
}

/**
 * Options for captureImageBitmap() - Ultra-fast capture
 * Perfect for Web Workers, Tesseract.js, OffscreenCanvas
 */
export interface CaptureImageBitmapOptions extends BaseCaptureOptions {
	// Inherits scale, mirror, crop
}

/**
 * Result from captureImage() method
 * Contains blob, URL, base64, and metadata
 */
export interface CaptureImageResult {
	/**
	 * Image as Blob (for uploading/saving)
	 */
	blob: Blob;

	/**
	 * Object URL for the blob (remember to revoke with URL.revokeObjectURL())
	 */
	url: string;

	/**
	 * Base64-encoded data URL (for <img> tags or API uploads)
	 * Format: "data:image/jpeg;base64,/9j/4AAQ..."
	 */
	base64?: string;

	/**
	 * Image width in pixels
	 */
	width: number;

	/**
	 * Image height in pixels
	 */
	height: number;

	/**
	 * MIME type of the image
	 */
	mimeType: string;

	/**
	 * Timestamp when captured (Date.now())
	 */
	timestamp: number;
}

/**
 * Result from captureImageData() method
 * Optimized for real-time CV processing - no blob/base64 conversion
 * Use this for 60+ FPS loops with face detection, MediaPipe, TensorFlow.js, etc.
 */
export interface CaptureImageDataResult {
	/**
	 * Raw pixel data for CV processing
	 * Can be passed directly to canvas.putImageData() or CV libraries
	 */
	imageData: ImageData;

	/**
	 * Image width in pixels
	 */
	width: number;

	/**
	 * Image height in pixels
	 */
	height: number;

	/**
	 * Timestamp when captured (Date.now())
	 */
	timestamp: number;
}

/**
 * Result from captureImageBitmap() method
 * Ultra-fast capture for Web Workers and OCR
 * ⚠️ IMPORTANT: Call imageBitmap.close() when done to prevent memory leaks!
 */
export interface CaptureImageBitmapResult {
	/**
	 * ImageBitmap for Web Workers, OffscreenCanvas, Tesseract.js
	 * ⚠️ MUST call .close() when done to free memory!
	 */
	imageBitmap: ImageBitmap;

	/**
	 * Image width in pixels
	 */
	width: number;

	/**
	 * Image height in pixels
	 */
	height: number;

	/**
	 * Timestamp when captured (Date.now())
	 */
	timestamp: number;
}
