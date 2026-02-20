import type {
	DeviceCapability,
	FocusMode,
	PermissionMap,
	PermissionRequestOptions,
} from "../types/index.js";
import { WebcamError, WebcamErrorCode } from "../utils/errors.js";

export class Device {
	private readonly CAPABILITY_CACHE_TTL_MS = 30_000;
	private capabilityCache = new Map<string, { value: DeviceCapability; expiresAt: number }>();

	/**
	 * Get a list of available video devices.
	 */
	async getVideoDevices(): Promise<MediaDeviceInfo[]> {
		try {
			const mediaDevices = this._getMediaDevicesOrThrow("enumerateDevices");
			const devices = await mediaDevices.enumerateDevices();
			const videoDevices = devices.filter((device) => device.kind === "videoinput");

			// Keep capability cache bounded to currently visible devices.
			const validDeviceIds = new Set(videoDevices.map((device) => device.deviceId));
			for (const cachedDeviceId of this.capabilityCache.keys()) {
				if (!validDeviceIds.has(cachedDeviceId)) {
					this.capabilityCache.delete(cachedDeviceId);
				}
			}

			return videoDevices;
		} catch (error) {
			if (error instanceof WebcamError) {
				throw error;
			}
			throw new WebcamError("Failed to enumerate devices", WebcamErrorCode.DEVICES_ERROR, error);
		}
	}

	/**
	 * Get the capabilities of a specific device.
	 */
	async getDeviceCapabilities(deviceId: string): Promise<DeviceCapability> {
		const cachedCapability = this.capabilityCache.get(deviceId);
		if (cachedCapability && cachedCapability.expiresAt > Date.now()) {
			return cachedCapability.value;
		}

		let testStream: MediaStream | null = null;
		try {
			const mediaDevices = this._getMediaDevicesOrThrow("getUserMedia");
			// Test stream to get capabilities
			testStream = await mediaDevices.getUserMedia({
				video: { deviceId: { exact: deviceId } },
			});
			const track = testStream.getVideoTracks()[0];
			if (!track) {
				throw new WebcamError(
					"No video track found for requested device",
					WebcamErrorCode.DEVICES_ERROR,
				);
			}

			const capabilities = track.getCapabilities();
			const settings = track.getSettings();

			const deviceCapability: DeviceCapability = {
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
				maxZoom: capabilities.zoom?.max,
				minZoom: capabilities.zoom?.min,
				supportedFocusModes: capabilities.focusMode as FocusMode[] | undefined,
			};

			this.capabilityCache.set(deviceId, {
				value: deviceCapability,
				expiresAt: Date.now() + this.CAPABILITY_CACHE_TTL_MS,
			});

			return deviceCapability;
		} catch (error) {
			if (error instanceof WebcamError) {
				throw error;
			}
			throw new WebcamError(
				`Failed to get device capabilities: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
				WebcamErrorCode.DEVICES_ERROR,
				error,
			);
		} finally {
			if (testStream) {
				testStream.getTracks().forEach((track) => track.stop());
			}
		}
	}

	/**
	 * Check current permissions
	 */
	async checkPermissions(): Promise<PermissionMap> {
		const permissions: PermissionMap = {
			camera: "prompt",
			microphone: "prompt",
		};

		if (typeof navigator === "undefined" || !navigator.permissions?.query) {
			return permissions;
		}

		try {
			const cameraPerm = await navigator.permissions.query({ name: "camera" as PermissionName });
			permissions["camera"] = cameraPerm.state;
		} catch {
			permissions["camera"] = "prompt";
		}

		try {
			const micPerm = await navigator.permissions.query({ name: "microphone" as PermissionName });
			permissions["microphone"] = micPerm.state;
		} catch {
			permissions["microphone"] = "prompt";
		}

		return permissions;
	}

	/**
	 * Request permissions
	 */
	async requestPermissions(
		options: PermissionRequestOptions = { video: true, audio: false },
	): Promise<PermissionMap> {
		const requestVideo = options.video ?? true;
		const requestAudio = options.audio ?? false;

		if (!requestVideo && !requestAudio) {
			throw new WebcamError(
				"Invalid permission request: at least one of video or audio must be true",
				WebcamErrorCode.INVALID_CONFIG,
			);
		}

		try {
			const mediaDevices = this._getMediaDevicesOrThrow("getUserMedia");
			const stream = await mediaDevices.getUserMedia({
				video: requestVideo,
				audio: requestAudio,
			});

			// Stop stream immediately
			stream.getTracks().forEach((track) => track.stop());

			return await this.checkPermissions();
		} catch (error) {
			if (error instanceof WebcamError) {
				throw error;
			}

			// Handle specific permission errors
			if (error instanceof Error) {
				switch (error.name) {
					case "NotAllowedError":
						throw new WebcamError(
							"Permission denied by user",
							WebcamErrorCode.PERMISSION_DENIED,
							error,
						);
					case "NotFoundError":
						throw new WebcamError(
							"No camera or microphone found",
							WebcamErrorCode.DEVICES_ERROR,
							error,
						);
					case "NotReadableError":
						throw new WebcamError(
							"Camera is already in use by another application",
							WebcamErrorCode.STREAM_ERROR,
							error,
						);
					case "OverconstrainedError":
						throw new WebcamError(
							"Requested constraints cannot be satisfied",
							WebcamErrorCode.CONSTRAINT_ERROR,
							error,
						);
					case "SecurityError":
						throw new WebcamError(
							"Permission request blocked by security policy",
							WebcamErrorCode.PERMISSION_DENIED,
							error,
						);
					case "TypeError":
						throw new WebcamError(
							"Permission request failed: invalid constraints",
							WebcamErrorCode.INVALID_CONFIG,
							error,
						);
					default:
						throw new WebcamError(
							`Failed to request permissions: ${error.message}`,
							WebcamErrorCode.PERMISSION_DENIED,
							error,
						);
				}
			}

			// Unknown error type
			throw new WebcamError(
				"Failed to request permissions",
				WebcamErrorCode.PERMISSION_DENIED,
				error,
			);
		}
	}

	private _getMediaDevicesOrThrow(method: "getUserMedia" | "enumerateDevices"): MediaDevices {
		if (typeof navigator === "undefined" || !navigator.mediaDevices) {
			throw new WebcamError(
				"MediaDevices API is not supported in this environment",
				WebcamErrorCode.DEVICES_ERROR,
			);
		}

		if (typeof navigator.mediaDevices[method] !== "function") {
			throw new WebcamError(
				`MediaDevices.${method} is not supported in this environment`,
				WebcamErrorCode.DEVICES_ERROR,
			);
		}

		return navigator.mediaDevices;
	}
}
