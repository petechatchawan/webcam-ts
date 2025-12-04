import {
	CaptureOptions,
	CaptureResult,
	DeviceCapability,
	FocusMode,
	PermissionRequestOptions,
	Resolution,
	WebcamConfiguration,
	WebcamState,
	WebcamStateInternal,
} from "../types";
import { WebcamError, WebcamErrorCode } from "../utils/errors";
import { Capture } from "./capture";
import { Device } from "./device";
import { Stream } from "./stream";

export class Webcam {
	private device: Device;
	private stream: Stream;
	private capture: Capture;

	private state: WebcamStateInternal = {
		status: "idle",
		activeStream: null,
		permissions: {},
		error: null,
	};

	private config?: WebcamConfiguration;
	private videoElement?: HTMLVideoElement;
	private deviceChangeListener?: () => void;

	/**
	 * Constructor with optional dependency injection for better testability
	 * @param config - Initial webcam configuration
	 * @param services - Optional service instances for dependency injection
	 */
	constructor(
		config?: WebcamConfiguration,
		services?: {
			device?: Device;
			stream?: Stream;
			capture?: Capture;
		},
	) {
		// Dependency Injection: use provided services or create new instances
		this.device = services?.device ?? new Device();
		this.stream = services?.stream ?? new Stream();
		this.capture = services?.capture ?? new Capture();

		if (config) {
			this.config = config;
			if (config.videoElement) {
				this.videoElement = config.videoElement;
			}
		}

		// Setup device change detection
		this.setupDeviceChangeListener();
	}

	/**
	 * Check if webcam is supported in the current browser
	 * @returns true if MediaDevices API is available
	 */
	isSupported(): boolean {
		return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
	}

	/**
	 * Start the camera
	 */
	async start(config?: WebcamConfiguration): Promise<void> {
		if (config) {
			this.config = { ...this.config, ...config };
			if (config.videoElement) {
				this.videoElement = config.videoElement;
			}
		}

		if (!this.config) {
			throw new WebcamError("Configuration is required", WebcamErrorCode.INVALID_CONFIG);
		}

		try {
			this._updateStatus("initializing");

			const stream = await this.stream.startStream(this.config);
			this.state.activeStream = stream;

			// Setup video element
			if (this.videoElement) {
				this.videoElement.srcObject = stream;

				// Handle Mirror (Preview only)
				if (this.config.enableMirror) {
					this.setMirror(true);
				}
			}

			this._updateStatus("ready");
			this.config.onStreamStart?.(stream);
		} catch (error) {
			const webcamError =
				error instanceof WebcamError
					? error
					: new WebcamError("Start failed", WebcamErrorCode.UNKNOWN_ERROR, error);
			this._setError(webcamError);
			throw webcamError;
		}
	}

	/**
	 * Stop the camera
	 */
	stop(): void {
		this.stream.stopStream();
		this.state.activeStream = null;

		if (this.videoElement) {
			this.videoElement.srcObject = null;
		}

		this._updateStatus("idle");
		this.config?.onStreamStop?.();
	}

	/**
	 * Capture an image
	 */
	async captureImage(options: CaptureOptions = {}): Promise<CaptureResult> {
		if (!this.videoElement) {
			throw new WebcamError("No video element attached", WebcamErrorCode.VIDEO_ELEMENT_NOT_SET);
		}

		// Pass mirror state to capture service if not explicitly set in options
		const mirror = options.mirror !== undefined ? options.mirror : this.getMirror();

		return this.capture.captureImage(this.videoElement, {
			...options,
			mirror,
		});
	}

	/**
	 * Request permissions
	 */
	async requestPermissions(
		options?: PermissionRequestOptions,
	): Promise<Record<string, PermissionState>> {
		return this.device.requestPermissions(options);
	}

	/**
	 * Check permissions
	 */
	async checkPermissions(): Promise<Record<string, PermissionState>> {
		return this.device.checkPermissions();
	}

	/**
	 * Get available devices
	 */
	async getDevices(): Promise<MediaDeviceInfo[]> {
		return this.device.getVideoDevices();
	}

	/**
	 * Get device capabilities
	 */
	async getCapabilities(deviceId: string): Promise<DeviceCapability> {
		return this.device.getDeviceCapabilities(deviceId);
	}

	/**
	 * Get current device info
	 */
	async getCurrentDevice(): Promise<MediaDeviceInfo | null> {
		if (!this.state.activeStream) return null;

		const tracks = this.state.activeStream.getVideoTracks();
		if (tracks.length === 0) return null;

		const track = tracks[0];
		const deviceId = track.getSettings().deviceId;

		if (!deviceId) return null;

		// Get device info from enumerateDevices
		const devices = await this.getDevices();
		return devices.find((d) => d.deviceId === deviceId) || null;
	}

	/**
	 * Get current resolution
	 */
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
		};
	}

	/**
	 * Get current stream quality metrics
	 * @returns Stream quality information including FPS and resolution, or null if no active stream
	 */
	getStreamQuality(): {
		fps: number;
		resolution: Resolution;
		bitrate?: number;
	} | null {
		const settings = this.stream.getTrackSettings();
		if (!settings) return null;

		return {
			fps: settings.frameRate || 0,
			resolution: {
				width: settings.width || 0,
				height: settings.height || 0,
				label: `${settings.width}x${settings.height}`,
			},
		};
	}

	/**
	 * Set Mirror (Preview)
	 */
	setMirror(mirror: boolean): void {
		if (this.videoElement) {
			this.videoElement.style.transform = mirror ? "scaleX(-1)" : "";
		}
	}

	getMirror(): boolean {
		return !!(this.videoElement && this.videoElement.style.transform === "scaleX(-1)");
	}

	/**
	 * Torch Control
	 */
	async setTorch(enabled: boolean): Promise<void> {
		try {
			await this.stream.applyConstraints({ torch: enabled });
			this.state.torchEnabled = enabled;
			this._notifyStateChange();
		} catch (error) {
			const webcamError =
				error instanceof WebcamError
					? error
					: new WebcamError("Failed to set torch", WebcamErrorCode.STREAM_ERROR, error);
			throw webcamError;
		}
	}

	/**
	 * Zoom Control
	 */
	async setZoom(zoom: number): Promise<void> {
		if (zoom < 1) {
			throw new WebcamError(
				"Zoom level must be greater than or equal to 1",
				WebcamErrorCode.INVALID_CONFIG,
			);
		}

		try {
			await this.stream.applyConstraints({ zoom });
			this.state.zoomLevel = zoom;
			this._notifyStateChange();
		} catch (error) {
			const webcamError =
				error instanceof WebcamError
					? error
					: new WebcamError("Failed to set zoom", WebcamErrorCode.STREAM_ERROR, error);
			throw webcamError;
		}
	}

	/**
	 * Focus Mode Control
	 */
	async setFocusMode(mode: FocusMode): Promise<void> {
		try {
			await this.stream.applyConstraints({ focusMode: mode });
			this.state.focusMode = mode;
			this._notifyStateChange();
		} catch (error) {
			const webcamError =
				error instanceof WebcamError
					? error
					: new WebcamError("Failed to set focus mode", WebcamErrorCode.STREAM_ERROR, error);
			throw webcamError;
		}
	}

	/**
	 * Check if torch is supported
	 */
	isTorchSupported(): boolean {
		const capabilities = this.stream.getCapabilities();
		return !!capabilities && "torch" in capabilities;
	}

	/**
	 * Check if zoom is supported
	 */
	isZoomSupported(): boolean {
		const capabilities = this.stream.getCapabilities();
		return !!capabilities && "zoom" in capabilities;
	}

	/**
	 * Check if focus is supported
	 */
	isFocusSupported(): boolean {
		const capabilities = this.stream.getCapabilities();
		return !!capabilities && "focusMode" in capabilities;
	}

	/**
	 * Get current state
	 */
	getState(): WebcamState {
		return { ...this.state };
	}

	dispose(): void {
		this.stop();
		this.capture.dispose();
		this.removeDeviceChangeListener();
	}

	// --- Private Helpers ---

	private _updateStatus(status: WebcamStateInternal["status"]): void {
		this.state.status = status;
		this.state.error = null;
		this._notifyStateChange();
	}

	private _setError(error: WebcamError): void {
		this.state.error = error;
		this.state.status = "error";
		this.config?.onError?.(error);
		this._notifyStateChange();
	}

	private _notifyStateChange(): void {
		this.config?.onStateChange?.(this.getState());
	}

	/**
	 * Setup device change listener to detect when devices are added/removed
	 */
	private setupDeviceChangeListener(): void {
		if (!navigator.mediaDevices?.addEventListener) return;

		this.deviceChangeListener = async () => {
			try {
				const devices = await this.getDevices();
				this.config?.onDeviceChange?.(devices);
			} catch (error) {
				const webcamError =
					error instanceof WebcamError
						? error
						: new WebcamError(
								"Device change detection failed",
								WebcamErrorCode.DEVICES_ERROR,
								error,
						  );
				this.config?.onError?.(webcamError);
			}
		};

		navigator.mediaDevices.addEventListener("devicechange", this.deviceChangeListener);
	}

	/**
	 * Remove device change listener
	 */
	private removeDeviceChangeListener(): void {
		if (this.deviceChangeListener && navigator.mediaDevices?.removeEventListener) {
			navigator.mediaDevices.removeEventListener("devicechange", this.deviceChangeListener);
			this.deviceChangeListener = undefined;
		}
	}
}
