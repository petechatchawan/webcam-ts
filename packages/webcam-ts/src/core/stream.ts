import { Resolution, WebcamConfiguration } from "../types";
import { WebcamError, WebcamErrorCode } from "../utils/errors";

// Default resolution when no specific resolution is requested
const DEFAULT_RESOLUTION = {
	width: 1280,
	height: 720,
};

export class Stream {
	private activeStream: MediaStream | null = null;

	getActiveStream(): MediaStream | null {
		return this.activeStream;
	}

	async startStream(config: WebcamConfiguration): Promise<{
		stream: MediaStream;
		usedResolution: Resolution | null;
	}> {
		try {
			let stream: MediaStream | null = null;
			let usedResolution: Resolution | null = null;

			if (Array.isArray(config.preferredResolutions)) {
				let lastError: Error | undefined;
				for (const resolution of config.preferredResolutions) {
					try {
						const constraints = await this._buildConstraints({
							...config,
							preferredResolutions: resolution,
						});
						stream = await navigator.mediaDevices.getUserMedia(constraints);
						usedResolution = resolution; // Store the resolution that worked
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
				// Store the single resolution if provided
				usedResolution = config.preferredResolutions || null;
			}

			this.activeStream = stream;
			return { stream, usedResolution };
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
		if (!this.activeStream) {
			throw new WebcamError("No active stream to apply constraints", WebcamErrorCode.STREAM_ERROR);
		}

		const track = this.activeStream.getVideoTracks()[0];
		if (!track) {
			throw new WebcamError("No video track found in active stream", WebcamErrorCode.STREAM_ERROR);
		}

		try {
			await track.applyConstraints({ advanced: [constraints] });
		} catch (error) {
			if (error instanceof Error && error.name === "OverconstrainedError") {
				throw new WebcamError(
					"Cannot apply constraints: not supported by device",
					WebcamErrorCode.CONSTRAINT_ERROR,
					error,
				);
			}
			throw new WebcamError("Failed to apply constraints", WebcamErrorCode.STREAM_ERROR, error);
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

		// Use specified device or let browser choose default
		const deviceId = config.deviceInfo?.deviceId;

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
			videoConstraints.width = { ideal: DEFAULT_RESOLUTION.width };
			videoConstraints.height = { ideal: DEFAULT_RESOLUTION.height };
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
