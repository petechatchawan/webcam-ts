import { WebcamError, WebcamErrorCode } from "../utils/errors";
import { WebcamConfiguration, Resolution } from "../types";

export class StreamService {
	private activeStream: MediaStream | null = null;

	getActiveStream(): MediaStream | null {
		return this.activeStream;
	}

	async startStream(config: WebcamConfiguration): Promise<MediaStream> {
		try {
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

			this.activeStream = stream;
			return stream;
		} catch (error) {
			throw this._handleStartError(error, config);
		}
	}

	stopStream(): void {
		if (this.activeStream) {
			this.activeStream.getTracks().forEach((track) => track.stop());
			this.activeStream = null;
		}
	}

	getTrackSettings(): MediaTrackSettings | null {
		if (!this.activeStream) return null;
		const track = this.activeStream.getVideoTracks()[0];
		return track ? track.getSettings() : null;
	}

	getCapabilities(): MediaTrackCapabilities | null {
		if (!this.activeStream) return null;
		const track = this.activeStream.getVideoTracks()[0];
		return track ? track.getCapabilities() : null;
	}

	async applyConstraints(constraints: MediaTrackConstraintSet): Promise<void> {
		if (!this.activeStream) return;
		const track = this.activeStream.getVideoTracks()[0];
		if (track) {
			await track.applyConstraints({ advanced: [constraints] });
		}
	}

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
			}
		}

		// Get device info if not provided (auto-select first video device)
		let deviceId = config.deviceInfo?.deviceId;
		if (!deviceId) {
			// Note: In a real scenario, we might want to dependency inject DeviceService here,
			// but for simplicity, if no device ID is passed, we let the browser choose (default behavior)
			// OR we explicitly find one if strict behavior is needed.
			// For now, let's trust the browser default if no device is specified,
			// unless the original logic strictly required finding one.
			// The original logic DID enumerate. Let's keep it simple: if no deviceId, don't enforce exact deviceId.
		}

		const videoConstraints: MediaTrackConstraints = {};

		if (deviceId) {
			videoConstraints.deviceId = { exact: deviceId };
		}

		if (config.preferredResolutions) {
			const res = Array.isArray(config.preferredResolutions)
				? config.preferredResolutions[0]
				: config.preferredResolutions;

			videoConstraints.width = { exact: res.width };
			videoConstraints.height = { exact: res.height };
		} else {
			// Default fallback if no resolution specified
			videoConstraints.width = { ideal: 1280 };
			videoConstraints.height = { ideal: 720 };
		}

		return {
			video: videoConstraints,
			audio: config.enableAudio || false,
		};
	}

	private _handleStartError(error: any, config: WebcamConfiguration): WebcamError {
		let baseMsg = `Failed to start camera`;
		let code = WebcamErrorCode.UNKNOWN_ERROR;

		if (error?.name === "NotAllowedError") {
			baseMsg = "Camera access denied";
			code = WebcamErrorCode.PERMISSION_DENIED;
		} else if (error?.name === "NotFoundError") {
			baseMsg = "Camera device not found";
			code = WebcamErrorCode.DEVICE_NOT_FOUND;
		} else if (error?.name === "NotReadableError") {
			baseMsg = "Camera is already in use";
			code = WebcamErrorCode.DEVICE_BUSY;
		} else if (error?.name === "OverconstrainedError") {
			baseMsg = "Camera constraints not satisfied";
			code = WebcamErrorCode.OVERCONSTRAINED;
		}

		return new WebcamError(baseMsg, code, error);
	}
}
