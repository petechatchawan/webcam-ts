import { DeviceCapability, FocusMode, PermissionRequestOptions } from "../types";
import { WebcamError, WebcamErrorCode } from "../utils/errors";

export class Device {
	/**
	 * Get a list of available video devices.
	 */
	async getVideoDevices(): Promise<MediaDeviceInfo[]> {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			return devices.filter((device) => device.kind === "videoinput");
		} catch (error) {
			throw new WebcamError("Failed to enumerate devices", WebcamErrorCode.DEVICES_ERROR, error);
		}
	}

	/**
	 * Get the capabilities of a specific device.
	 */
	async getDeviceCapabilities(deviceId: string): Promise<DeviceCapability> {
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
				maxZoom: (capabilities as any).zoom?.max, // Cast still needed if types not fully picked up globally yet, but we defined them
				minZoom: (capabilities as any).zoom?.min,
				supportedFocusModes: (capabilities as any).focusMode as FocusMode[],
			};
		} catch (error) {
			throw new WebcamError(
				`Failed to get device capabilities: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
				WebcamErrorCode.DEVICES_ERROR,
				error,
			);
		}
	}

	/**
	 * Check current permissions
	 */
	async checkPermissions(): Promise<Record<string, PermissionState>> {
		const permissions: Record<string, PermissionState> = {};

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
	): Promise<Record<string, PermissionState>> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: options.video || false,
				audio: options.audio || false,
			});

			// Stop stream immediately
			stream.getTracks().forEach((track) => track.stop());

			return await this.checkPermissions();
		} catch (error) {
			// Even if failed, return current state (likely denied)
			return await this.checkPermissions();
		}
	}
}
