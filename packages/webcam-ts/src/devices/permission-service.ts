import { WebcamError } from "../domain/error.js";
import { BrowserMediaDevicesAdapter } from "../platform/browser-media-devices-adapter.js";
import { normalizeBrowserError } from "../platform/browser-error-normalizer.js";
import type { MediaDevicesPort } from "../platform/media-devices-port.js";
import { stopStream } from "../platform/stream-cleanup.js";

export type MediaPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export interface PermissionMap {
	readonly camera: MediaPermissionState;
	readonly microphone: MediaPermissionState;
}

export interface PermissionRequest {
	readonly video?: boolean;
	readonly audio?: boolean;
}

export interface PermissionServiceOptions {
	readonly mediaDevices?: MediaDevicesPort;
	readonly permissions?: Permissions | null;
}

export class PermissionService {
	private readonly mediaDevices: MediaDevicesPort;
	private readonly permissions: Permissions | null;

	public constructor(options: PermissionServiceOptions = {}) {
		this.mediaDevices = options.mediaDevices ?? new BrowserMediaDevicesAdapter();
		this.permissions =
			options.permissions !== undefined
				? options.permissions
				: globalThis.navigator?.permissions ?? null;
	}

	public async query(): Promise<PermissionMap> {
		if (!this.permissions) {
			return Object.freeze({ camera: "unsupported", microphone: "unsupported" });
		}

		const [camera, microphone] = await Promise.all([
			this.queryPermissionState(this.permissions, "camera"),
			this.queryPermissionState(this.permissions, "microphone"),
		]);
		return Object.freeze({ camera, microphone });
	}

	public async request(request: PermissionRequest = {}): Promise<PermissionMap> {
		const video = request.video ?? true;
		const audio = request.audio ?? false;
		if (!video && !audio) {
			throw new WebcamError("At least one permission must be requested", {
				code: "INVALID_REQUEST",
				recoverable: true,
			});
		}

		let stream: MediaStream | null = null;
		try {
			stream = await this.mediaDevices.open({ video, audio });
		} catch (error) {
			throw normalizeBrowserError(error);
		} finally {
			if (stream) {
				try {
					stopStream(stream);
				} catch (error) {
					throw normalizeBrowserError(error, undefined, "UNKNOWN");
				}
			}
		}

		const queried = await this.query();
		return Object.freeze({
			camera: video ? "granted" : queried.camera,
			microphone: audio ? "granted" : queried.microphone,
		});
	}

	private async queryPermissionState(
		permissions: Permissions,
		name: "camera" | "microphone",
	): Promise<MediaPermissionState> {
		try {
			const result = await permissions.query({ name: name as PermissionName });
			return result.state;
		} catch {
			return "unknown";
		}
	}
}
