import { WebcamError, WebcamErrorCode } from "./errors";
import type { CaptureOptions, CaptureResult } from "./types";
import {
	DeviceCapability,
	PermissionRequestOptions,
	WebcamState,
	WebcamStateInternal,
	WebcamConfiguration,
	FocusMode,
	Resolution,
} from "./types";

export class Webcam {
	/**
	 * Initializes the webcam state
	 */
	private state: WebcamStateInternal = {
		status: "idle",
		activeStream: null,
		permissions: {},
		error: null,
	};

	/**
	 * Listener for device changes
	 */
	private _deviceChangeListener?: () => void;
	private _disposed = false;
	private _config?: WebcamConfiguration;
	private _debugEnabled = false;

	constructor() {
		// Simple callback-based approach
		// todo: set default config like debug mode
	}

	/**
	 * Enable debug logging
	 */
	enableDebug(): void {
		this._debugEnabled = true;
	}

	/**
	 * Disable debug logging
	 */
	disableDebug(): void {
		this._debugEnabled = false;
	}

	/**
	 * Check if debug logging is enabled
	 */
	isDebugEnabled(): boolean {
		return this._debugEnabled;
	}

	/**
	 * Log debug message if debug is enabled
	 * @param message The message to log
	 * @param args Additional arguments to log
	 */
	debugLog(message: string, ...args: any[]): void {
		if (this._debugEnabled) {
			console.log(`[Webcam Debug] ${message}`, ...args);
		}
	}

	/**
	 * Get the current state of the webcam.
	 * @returns WebcamState
	 */
	getState(): WebcamState {
		this._ensureNotDisposed();
		return { ...this.state };
	}

	/**
	 * Check the current permissions of the user.
	 * @returns Record<string, PermissionState>
	 */
	async getCurrentDevice(): Promise<MediaDeviceInfo | null> {
		if (!this.state.activeStream) return null;

		const tracks = this.state.activeStream.getVideoTracks();
		if (tracks.length === 0) return null;

		const track = tracks[0];
		const deviceId = track.getSettings().deviceId;

		// Get device info from enumerateDevices
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices.find((d) => d.deviceId === deviceId) || null;
	}

	getCurrentResolution(): Resolution | null {
		if (!this.state.activeStream) return null;

		const tracks = this.state.activeStream.getVideoTracks();
		if (tracks.length === 0) return null;

		const track = tracks[0];
		const settings = track.getSettings();
		const width = settings.width || 0;
		const height = settings.height || 0;

		return {
			width,
			height,
			label: `${width}x${height}`,
		} as Resolution;
	}

	async checkPermissions(): Promise<Record<string, PermissionState>> {
		this._ensureNotDisposed();
		const permissions: Record<string, PermissionState> = {};

		// Check camera permission
		try {
			const cameraPerm = await navigator.permissions.query({ name: "camera" as PermissionName });
			permissions["camera"] = cameraPerm.state;
			this._callPermissionChange(permissions);
		} catch {
			permissions["camera"] = "prompt";
		}

		// Check microphone permission
		try {
			const micPerm = await navigator.permissions.query({ name: "microphone" as PermissionName });
			permissions["microphone"] = micPerm.state;
			this._callPermissionChange(permissions);
		} catch {
			permissions["microphone"] = "prompt";
		}

		this.state.permissions = permissions;
		return permissions;
	}

	/**
	 * Request permissions from the user.
	 * @param options PermissionRequestOptions
	 * @returns Record<string, PermissionState>
	 */
	async requestPermissions(
		options: PermissionRequestOptions = { video: true, audio: false },
	): Promise<Record<string, PermissionState>> {
		this._ensureNotDisposed();

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: options.video || false,
				audio: options.audio || false,
			});

			// Stop stream immediately after getting permission
			stream.getTracks().forEach((track) => track.stop());

			const permissions = await this.checkPermissions();
			this._callPermissionChange(permissions);
			return permissions;
		} catch (error) {
			const permissions = await this.checkPermissions();
			this._callPermissionChange(permissions);
			return permissions;
		}
	}

	/**
	 * Get a list of available video devices.
	 * @returns Promise<MediaDeviceInfo[]>
	 */
	async getVideoDevices(): Promise<MediaDeviceInfo[]> {
		this._ensureNotDisposed();

		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const videoDevices = devices.filter((device) => device.kind === "videoinput");
			this._callDeviceChange(videoDevices);
			return videoDevices;
		} catch (error) {
			const webcamError = new WebcamError(
				"Failed to enumerate devices",
				WebcamErrorCode.DEVICES_ERROR,
			);
			this._setError(webcamError);
			this._callError(webcamError);
			throw webcamError;
		}
	}

	/**
	 * Start the camera with the provided configuration.
	 * @param config WebcamConfiguration
	 * @returns Promise<void>
	 */
	async startCamera(config: WebcamConfiguration): Promise<void> {
		this._ensureNotDisposed();
		this._config = config; // Store config for callbacks

		try {
			this._setStatus("initializing");
			this._callStateChange();

			let stream: MediaStream | null = null;
			if (Array.isArray(config.preferredResolutions)) {
				let lastError: Error | undefined;
				for (const resolution of config.preferredResolutions) {
					try {
						const constraints = await this._buildConstraints({
							...config,
							preferredResolutions: resolution,
						});
						stream = await navigator.mediaDevices.getUserMedia(constraints);
						break; // Found a working resolution
					} catch (error) {
						lastError = error instanceof Error ? error : new Error("Failed to get media stream");
						continue;
					}
				}
				if (!stream) {
					throw lastError || new Error("No resolution worked");
				}
			} else {
				const constraints = await this._buildConstraints(config);
				stream = await navigator.mediaDevices.getUserMedia(constraints);
			}

			// Configure video element if provided
			if (config.videoElement) {
				config.videoElement.srcObject = stream;
				this.state.videoElement = config.videoElement;
			}

			this.state.activeStream = stream;
			this.state.deviceInfo = config.deviceInfo;
			this._setStatus("ready");
			this._clearError();

			// Apply mirror setting if enabled in config
			if (config.enableMirror && config.videoElement) {
				this.setMirror(true);
			}

			this._callStreamStart(stream);
			this._callStateChange();
		} catch (error) {
			const webcamError = this._handleStartCameraError(error, config);
			this._setError(webcamError);
			this._callError(webcamError);
			this._callStateChange();
			throw webcamError;
		}
	}

	/**
	 * Stop the camera and release resources.
	 */
	public stopCamera(): void {
		this._ensureNotDisposed();

		if (this.state.activeStream) {
			this.state.activeStream.getTracks().forEach((track) => track.stop());
			this.state.activeStream = null;
			this._callStreamStop();
		}

		if (this.state.videoElement) {
			this.state.videoElement.srcObject = null;
			this.state.videoElement = undefined;
		}

		this.state.deviceInfo = undefined;
		this._setStatus("idle");
		this._clearError();
		this._callStateChange();
	}

	/**
	 * Capture an image from the webcam.
	 * @param options Capture options including image type, quality, and scale
	 * @returns A Promise that resolves with a CaptureResult object containing both blob and base64
	 * @example
	 * // Basic usage - returns { blob, base64, width, height, mimeType, timestamp }
	 * const result = await webcam.captureImage();
	 * console.log("Base64 image:", result.base64);
	 *
	 * // With options
	 * const result = await webcam.captureImage({
	 *   imageType: 'image/jpeg',
	 *   quality: 0.8,
	 *   scale: 0.5
	 * });
	 *
	 * // Or destructure what you need
	 * const { base64, blob } = await webcam.captureImage();
	 */
	async captureImage(options: CaptureOptions = {}): Promise<CaptureResult> {
		this._ensureNotDisposed();

		if (!this.state.activeStream || this.state.status !== "ready") {
			const error = new WebcamError(
				"Camera is not ready for capture",
				WebcamErrorCode.STREAM_FAILED,
			);
			this._callError(error);
			throw error;
		}

		if (!this.state.videoElement) {
			const error = new WebcamError(
				"No video element available for capture",
				WebcamErrorCode.VIDEO_ELEMENT_NOT_SET,
			);
			this._callError(error);
			throw error;
		}

		try {
			// Set default options
			const captureOptions: Required<Omit<CaptureOptions, "returnBase64">> = {
				imageType: options.imageType || "image/jpeg",
				quality: options.quality !== undefined ? Math.max(0, Math.min(1, options.quality)) : 0.92,
				scale: options.scale !== undefined ? Math.max(0.1, Math.min(2, options.scale)) : 1.0,
			};

			return await this._captureFromVideoElement(this.state.videoElement, captureOptions);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error during capture";
			const webcamError = new WebcamError(
				`Failed to capture image: ${errorMessage}`,
				WebcamErrorCode.CAPTURE_FAILED,
			);
			this._callError(webcamError);
			throw webcamError;
		}
	}

	/**
	 * Get the capabilities of a specific device.
	 * @param deviceId The ID of the device to get capabilities for.
	 * @returns A Promise that resolves with the device capabilities.
	 */
	async getDeviceCapabilities(deviceId: string): Promise<DeviceCapability> {
		this._ensureNotDisposed();

		try {
			// Test stream to get capabilities
			const testStream = await navigator.mediaDevices.getUserMedia({
				video: { deviceId: { exact: deviceId } },
			});
			const track = testStream.getVideoTracks()[0];
			const capabilities = track.getCapabilities();
			const settings = track.getSettings();

			// Stop test stream
			testStream.getTracks().forEach((t) => t.stop());

			return {
				deviceId,
				label: track.label,
				maxWidth: capabilities.width?.max || settings.width || 1920,
				maxHeight: capabilities.height?.max || settings.height || 1080,
				minWidth: capabilities.width?.min || 320,
				minHeight: capabilities.height?.min || 240,
				supportedFrameRates:
					capabilities.frameRate &&
					capabilities.frameRate.min !== undefined &&
					capabilities.frameRate.max !== undefined
						? [capabilities.frameRate.min, capabilities.frameRate.max]
						: undefined,
				hasZoom: "zoom" in capabilities,
				hasTorch: "torch" in capabilities,
				hasFocus: "focusMode" in capabilities,
				maxZoom: (capabilities as any).zoom?.max,
				minZoom: (capabilities as any).zoom?.min,
				supportedFocusModes: (capabilities as any).focusMode,
			};
		} catch (error) {
			const webcamError = new WebcamError(
				`Failed to get device capabilities: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
				WebcamErrorCode.DEVICES_ERROR,
			);
			this._callError(webcamError);
			throw webcamError;
		}
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}

		// Stop camera
		this.stopCamera();

		// Remove event listener
		if (this._deviceChangeListener) {
			navigator.mediaDevices.removeEventListener("devicechange", this._deviceChangeListener);
			this._deviceChangeListener = undefined;
		}

		this._disposed = true;
		this._config = undefined;
	}

	// --- Private Helper Methods ---
	private _ensureNotDisposed(): void {
		if (this._disposed) {
			throw new WebcamError("TsWebcam instance has been disposed", WebcamErrorCode.UNKNOWN_ERROR);
		}
	}

	/**
	 * Set the status of the webcam.
	 * @param status The new status of the webcam.
	 */
	private _setStatus(status: WebcamStateInternal["status"]): void {
		this.state.status = status;
	}

	/**
	 * Set the error state of the webcam.
	 * @param error The new error state of the webcam.
	 */
	private _setError(error: WebcamError): void {
		this.state.error = error;
		this._setStatus("error");
	}

	/**
	 * Clear the error state of the webcam.
	 */
	private _clearError(): void {
		this.state.error = null;
	}

	/**
	 * Call the onStateChange callback with the current state.
	 */
	private _callStateChange(): void {
		if (this._config?.onStateChange) {
			this._config.onStateChange(this.getState());
		}
	}

	/**
	 * Call the onDeviceChange callback with the current devices.
	 * @param devices The current devices.
	 */
	private _callDeviceChange(devices: MediaDeviceInfo[]): void {
		if (this._config?.onDeviceChange) {
			this._config.onDeviceChange(devices);
		}
	}

	/**
	 * Call the onStreamStart callback with the current stream.
	 * @param stream The MediaStream that has started.
	 */
	private _callStreamStart(stream: MediaStream): void {
		if (this._config?.onStreamStart) {
			this._config.onStreamStart(stream);
		}
	}

	/**
	 * Call the onStreamStop callback.
	 */
	private _callStreamStop(): void {
		if (this._config?.onStreamStop) {
			this._config.onStreamStop();
		}
	}

	/**
	 * Call the onError callback with the current error.
	 * @param error The WebcamError that has occurred.
	 */
	private _callError(error: WebcamError): void {
		if (this._config?.onError) {
			this._config.onError(error);
		}
	}

	/**
	 * Call the onPermissionChange callback with the current permissions.
	 * @param permissions The current permissions.
	 */
	private _callPermissionChange(permissions: Record<string, PermissionState>): void {
		if (this._config?.onPermissionChange) {
			this._config.onPermissionChange(permissions);
		}
	}

	/**
	 * Call the onDeviceChange callback with the current devices.
	 * @param devices The current devices.
	 */
	private async _buildConstraints(config: WebcamConfiguration): Promise<MediaStreamConstraints> {
		// Validate resolution if specified
		if (config.preferredResolutions) {
			const resolutions = Array.isArray(config.preferredResolutions)
				? config.preferredResolutions
				: [config.preferredResolutions];

			for (const res of resolutions) {
				if (!res.width || !res.height) {
					throw new WebcamError(
						`Invalid resolution: width and height must be specified`,
						WebcamErrorCode.INVALID_CONFIG,
					);
				}
				if (res.width <= 0 || res.height <= 0) {
					throw new WebcamError(
						`Invalid resolution: width and height must be positive numbers`,
						WebcamErrorCode.INVALID_CONFIG,
					);
				}
				if (res.width > 4096 || res.height > 4096) {
					throw new WebcamError(
						`Invalid resolution: maximum width/height is 4096 pixels`,
						WebcamErrorCode.INVALID_CONFIG,
					);
				}
			}
		}

		// Get device info if not provided
		if (!config.deviceInfo) {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const videoDevices = devices.filter((d) => d.kind === "videoinput");
				if (videoDevices.length === 0) {
					throw new WebcamError(`No video devices found`, WebcamErrorCode.DEVICE_NOT_FOUND);
				}
				config.deviceInfo = videoDevices[0];
			} catch (error) {
				throw new WebcamError(
					`Failed to get video devices: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
					WebcamErrorCode.DEVICES_ERROR,
				);
			}
		}

		// Build constraints
		const videoConstraints: MediaTrackConstraints = {
			deviceId: { exact: config.deviceInfo.deviceId },
			width: {
				exact: Array.isArray(config.preferredResolutions)
					? config.preferredResolutions[0].width
					: config.preferredResolutions?.width || 1280,
			},
			height: {
				exact: Array.isArray(config.preferredResolutions)
					? config.preferredResolutions[0].height
					: config.preferredResolutions?.height || 720,
			},
		};

		return {
			video: videoConstraints,
			audio: config.enableAudio || false,
		};
	}

	private _handleStartCameraError(error: any, config?: WebcamConfiguration): WebcamError {
		// Extract device and resolution info
		let deviceLabel = config?.deviceInfo?.label || config?.deviceInfo?.deviceId || "Unknown device";
		let resolution = Array.isArray(config?.preferredResolutions)
			? config?.preferredResolutions[0]
			: config?.preferredResolutions;
		let resolutionText = Array.isArray(config?.preferredResolutions)
			? config?.preferredResolutions.map((r) => `${r.width}x${r.height}`).join(", ")
			: resolution
			? `${resolution.width}x${resolution.height}`
			: "Unknown resolution";
		let context = "Start Camera";

		if (error instanceof WebcamError) {
			// Add context if not present
			error.message = `[${context}] ${error.message} (Device: ${deviceLabel}, Resolution: ${resolutionText})`;
			return error;
		}

		let baseMsg = `[${context}] `;
		if (error?.name === "NotAllowedError") {
			return new WebcamError(
				`${baseMsg}Camera access denied (Device: ${deviceLabel}, Resolution: ${resolutionText})`,
				WebcamErrorCode.PERMISSION_DENIED,
			);
		}

		if (error?.name === "NotFoundError") {
			return new WebcamError(
				`${baseMsg}Camera device not found (Device: ${deviceLabel}, Resolution: ${resolutionText})`,
				WebcamErrorCode.DEVICE_NOT_FOUND,
			);
		}

		if (error?.name === "NotReadableError") {
			return new WebcamError(
				`${baseMsg}Camera is already in use (Device: ${deviceLabel}, Resolution: ${resolutionText})`,
				WebcamErrorCode.DEVICE_BUSY,
			);
		}

		if (error?.name === "OverconstrainedError") {
			return new WebcamError(
				`${baseMsg}Camera constraints not satisfied (Device: ${deviceLabel}, Resolution: ${resolutionText})`,
				WebcamErrorCode.OVERCONSTRAINED,
			);
		}

		// เพิ่มรายละเอียด error message
		const details = [
			error?.message,
			error?.name,
			error?.code,
			error?.constraint,
			error?.toString && error.toString(),
		]
			.filter(Boolean)
			.join(" | ");

		return new WebcamError(
			`${baseMsg}Failed to start camera: ${
				details || "Unknown error"
			} (Device: ${deviceLabel}, Resolution: ${resolutionText})`,
			WebcamErrorCode.UNKNOWN_ERROR,
		);
	}

	private async _captureFromVideoElement(
		videoElement: HTMLVideoElement,
		options: Required<Omit<CaptureOptions, "returnBase64">>,
	): Promise<CaptureResult> {
		const { imageType, quality, scale } = options;
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");

		if (!context) {
			throw new Error("Could not get canvas context");
		}

		// Check video dimensions
		if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
			throw new Error("Video dimensions are zero - video may not be loaded");
		}

		// Calculate new dimensions based on scale
		const width = Math.floor(videoElement.videoWidth * scale);
		const height = Math.floor(videoElement.videoHeight * scale);

		canvas.width = width;
		canvas.height = height;

		try {
			// Draw video frame to canvas
			context.drawImage(
				videoElement,
				0,
				0,
				videoElement.videoWidth,
				videoElement.videoHeight, // source
				0,
				0,
				width,
				height, // destination
			);
		} catch (error) {
			throw new Error(
				`Failed to draw video to canvas: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Convert canvas to Blob
		const blob = await new Promise<Blob>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Capture timed out - could not convert to blob"));
			}, 5000);

			canvas.toBlob(
				(blob) => {
					clearTimeout(timeout);
					if (!blob) {
						reject(new Error("Failed to create blob from canvas"));
						return;
					}
					resolve(blob);
				},
				imageType,
				quality,
			);
		});

		// Convert Blob to base64 data URL
		const base64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const result = reader.result as string;
				resolve(result); // Return full data URL including prefix
			};
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});

		return {
			blob,
			base64,
			width,
			height,
			mimeType: imageType,
			timestamp: Date.now(),
		};
	}

	/**
	 * Mirror control (CSS only, always supported if video element present).
	 * @param mirror boolean
	 */
	public setMirror(mirror: boolean): void {
		if (this.state.videoElement) {
			this.state.videoElement.style.transform = mirror ? "scaleX(-1)" : "";
		}
	}

	/**
	 * Get the current mirror state.
	 * @returns boolean
	 */
	public getMirror(): boolean {
		return !!(this.state.videoElement && this.state.videoElement.style.transform === "scaleX(-1)");
	}

	/**
	 * Check if mirror is supported.
	 * @returns boolean
	 */
	public isMirrorSupported(): boolean {
		return !!this.state.videoElement;
	}

	/**
	 * Torch control (if supported).
	 * @param enabled boolean
	 */
	public async setTorch(enabled: boolean): Promise<void> {
		const track = this._getActiveVideoTrack();
		if (this.isTorchSupported()) {
			// @ts-ignore
			await track.applyConstraints({ advanced: [{ torch: enabled }] });
			this.state.torch = enabled; // Update internal state
			this._callStateChange();
		} else {
			throw new Error("Torch is not supported on this device");
		}
	}

	/**
	 * Get the current torch state.
	 * @returns boolean
	 */
	public getTorch(): boolean | undefined {
		const track = this._getActiveVideoTrack();
		if (this.isTorchSupported()) {
			// @ts-ignore
			return track.getSettings().torch;
		}
		return undefined;
	}

	/**
	 * Check if torch is supported.
	 * @returns boolean
	 */
	public isTorchSupported(): boolean {
		const track = this._getActiveVideoTrack();
		return !!(track && "torch" in track.getCapabilities());
	}

	/**
	 * Zoom control (if supported).
	 * @param zoom number
	 */
	public async setZoom(zoom: number): Promise<void> {
		const track = this._getActiveVideoTrack();
		if (this.isZoomSupported()) {
			// @ts-ignore
			await track.applyConstraints({ advanced: [{ zoom }] });
			this.state.zoom = zoom; // Update internal state
			this._callStateChange();
		} else {
			throw new Error("Zoom is not supported on this device");
		}
	}

	/**
	 * Get the current zoom level.
	 * @returns number
	 */
	public getZoom(): number | undefined {
		const track = this._getActiveVideoTrack();
		if (this.isZoomSupported()) {
			// @ts-ignore
			return track.getSettings().zoom;
		}
		return undefined;
	}

	/**
	 * Check if zoom is supported.
	 * @returns boolean
	 */
	public isZoomSupported(): boolean {
		const track = this._getActiveVideoTrack();
		return !!(track && "zoom" in track.getCapabilities());
	}

	/**
	 * Focus mode control (if supported).
	 * @param mode string
	 */
	public async setFocusMode(mode: string): Promise<void> {
		const track = this._getActiveVideoTrack();
		if (this.isFocusSupported()) {
			// @ts-ignore
			await track.applyConstraints({ advanced: [{ focusMode: mode }] });
			this.state.focusMode = mode as FocusMode; // Update internal state
			this._callStateChange();
		} else {
			throw new Error("Focus mode is not supported on this device");
		}
	}

	/**
	 * Get the current focus mode.
	 * @returns string
	 */
	public getFocusMode(): string | undefined {
		const track = this._getActiveVideoTrack();
		if (this.isFocusSupported()) {
			// @ts-ignore
			return track.getSettings().focusMode;
		}
		return undefined;
	}

	/**
	 * Check if focus mode is supported.
	 * @returns boolean
	 */
	public isFocusSupported(): boolean {
		const track = this._getActiveVideoTrack();
		return !!(track && "focusMode" in track.getCapabilities());
	}

	/**
	 * Helper: get the active video track
	 **/
	private _getActiveVideoTrack(): MediaStreamTrack | undefined {
		return this.state.activeStream?.getVideoTracks()[0];
	}
}
