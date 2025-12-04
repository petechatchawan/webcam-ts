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

export interface CaptureOptions {
	imageType?: string; // Default: 'image/jpeg'
	quality?: number; // 0-1, Default: 0.92
	scale?: number; // 0.1-2, Default: 1.0
	mirror?: boolean; // Explicit mirror override for capture
}

export interface CaptureResult {
	blob: Blob; // For upload/download
	url: string; // Object URL for preview (remember to revoke when done)
	base64: string; // Always included
	width: number;
	height: number;
	mimeType: string;
	timestamp: number;
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
}

export type WebcamState = Readonly<WebcamStateInternal>;
