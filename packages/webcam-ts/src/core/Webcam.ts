import { DeviceService } from "../services/DeviceService";
import { StreamService } from "../services/StreamService";
import { CaptureService } from "../services/CaptureService";
import {
	WebcamConfiguration,
	WebcamState,
	WebcamStateInternal,
	CaptureOptions,
	CaptureResult,
	DeviceCapability,
	Resolution,
	FocusMode,
	PermissionRequestOptions,
} from "../types";
import { WebcamError, WebcamErrorCode } from "../utils/errors";

export class Webcam {
	private deviceService: DeviceService;
	private streamService: StreamService;
	private captureService: CaptureService;

	private state: WebcamStateInternal = {
		status: "idle",
		activeStream: null,
		permissions: {},
		error: null,
	};

	private config?: WebcamConfiguration;
	private videoElement?: HTMLVideoElement;

	constructor(config?: WebcamConfiguration) {
		this.deviceService = new DeviceService();
		this.streamService = new StreamService();
		this.captureService = new CaptureService();

		if (config) {
			this.config = config;
			if (config.videoElement) {
				this.videoElement = config.videoElement;
			}
		}
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

			const stream = await this.streamService.startStream(this.config);
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
		this.streamService.stopStream();
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
	async capture(options: CaptureOptions = {}): Promise<CaptureResult> {
		if (!this.videoElement) {
			throw new WebcamError("No video element attached", WebcamErrorCode.VIDEO_ELEMENT_NOT_SET);
		}

		// Pass mirror state to capture service if not explicitly set in options
		const mirror = options.mirror !== undefined ? options.mirror : this.getMirror();

		return this.captureService.captureImage(this.videoElement, {
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
		return this.deviceService.requestPermissions(options);
	}

	/**
	 * Check permissions
	 */
	async checkPermissions(): Promise<Record<string, PermissionState>> {
		return this.deviceService.checkPermissions();
	}

	/**
	 * Get available devices
	 */
	async getDevices(): Promise<MediaDeviceInfo[]> {
		return this.deviceService.getVideoDevices();
	}

	/**
	 * Get device capabilities
	 */
	async getCapabilities(deviceId: string): Promise<DeviceCapability> {
		return this.deviceService.getDeviceCapabilities(deviceId);
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
		await this.streamService.applyConstraints({ torch: enabled });
		this.state.torch = enabled;
		this._notifyStateChange();
	}

	/**
	 * Zoom Control
	 */
	async setZoom(zoom: number): Promise<void> {
		await this.streamService.applyConstraints({ zoom });
		this.state.zoom = zoom;
		this._notifyStateChange();
	}

	/**
	 * Focus Mode Control
	 */
	async setFocusMode(mode: FocusMode): Promise<void> {
		await this.streamService.applyConstraints({ focusMode: mode });
		this.state.focusMode = mode;
		this._notifyStateChange();
	}

	/**
	 * Check if torch is supported
	 */
	isTorchSupported(): boolean {
		const capabilities = this.streamService.getCapabilities();
		return !!capabilities && "torch" in capabilities;
	}

	/**
	 * Check if zoom is supported
	 */
	isZoomSupported(): boolean {
		const capabilities = this.streamService.getCapabilities();
		return !!capabilities && "zoom" in capabilities;
	}

	/**
	 * Check if focus is supported
	 */
	isFocusSupported(): boolean {
		const capabilities = this.streamService.getCapabilities();
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
		this.captureService.dispose();
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
}
