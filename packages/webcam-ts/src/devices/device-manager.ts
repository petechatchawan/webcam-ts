import type { Webcam } from "../webcam.js";
import { WebcamError } from "../domain/error.js";
import { BrowserMediaDevicesAdapter } from "../platform/browser-media-devices-adapter.js";
import { normalizeBrowserError } from "../platform/browser-error-normalizer.js";
import type { MediaDevicesPort } from "../platform/media-devices-port.js";
import { stopStream } from "../platform/stream-cleanup.js";

export interface DeviceCapabilityInfo {
	readonly deviceId: string;
	readonly label: string | null;
	readonly settings: Readonly<MediaTrackSettings>;
	readonly capabilities: Readonly<MediaTrackCapabilities>;
}

export interface DeviceCapabilityInfoOptions {
	readonly webcam?: Webcam;
	readonly signal?: AbortSignal;
}

export interface DeviceManagerOptions {
	readonly mediaDevices?: MediaDevicesPort;
}

export type DeviceListChangeListener = (devices: readonly MediaDeviceInfo[]) => void;

function deepCloneAndFreeze<T>(value: T): T {
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return Object.freeze(value.map((item) => deepCloneAndFreeze(item))) as T;
	}
	const clone: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		clone[key] = deepCloneAndFreeze(nested);
	}
	return Object.freeze(clone) as T;
}

export class DeviceManager {
	private readonly mediaDevices: MediaDevicesPort;
	private readonly deviceListListeners = new Set<DeviceListChangeListener>();
	private unsubscribeDeviceChange: (() => void) | null = null;
	private isDisposed = false;

	public constructor(options: DeviceManagerOptions = {}) {
		this.mediaDevices = options.mediaDevices ?? new BrowserMediaDevicesAdapter();
	}

	public async listDevices(): Promise<readonly MediaDeviceInfo[]> {
		try {
			this.assertNotDisposed();
			const devices = await this.mediaDevices.enumerateDevices();
			return Object.freeze(devices.filter((device) => device.kind === "videoinput"));
		} catch (error) {
			throw normalizeBrowserError(error, undefined, "UNKNOWN");
		}
	}

	public async snapshotCapabilities(
		deviceId: string,
		options: DeviceCapabilityInfoOptions = {},
	): Promise<DeviceCapabilityInfo> {
		try {
			this.assertNotDisposed();
			if (!deviceId.trim()) {
				throw new WebcamError("A deviceId is required for capability probing", {
					code: "INVALID_REQUEST",
				});
			}

			this.throwIfAborted(options.signal);

			const activeTrack = options.webcam?.getActiveTrack() ?? null;
			if (activeTrack && activeTrack.readyState === "live") {
				const activeSettings = activeTrack.getSettings();
				if (activeSettings.deviceId === deviceId) {
					return this.createDeviceCapabilityInfo(deviceId, activeTrack);
				}
			}

			let tempStream: MediaStream | null = null;
			try {
				try {
					tempStream = await this.mediaDevices.open({
						video: { deviceId: { exact: deviceId } },
						audio: false,
					});
				} catch (error) {
					throw normalizeBrowserError(error);
				}
				this.throwIfAborted(options.signal);

				const track = tempStream.getVideoTracks()[0];
				if (!track || track.readyState !== "live") {
					throw new WebcamError("Capability snapshot did not produce a live video track", {
						code: "STREAM_INVALID",
						context: { deviceId },
					});
				}

				return this.createDeviceCapabilityInfo(deviceId, track);
			} finally {
				if (tempStream) stopStream(tempStream);
			}
		} catch (error) {
			throw normalizeBrowserError(error, undefined, "UNKNOWN");
		}
	}

	public subscribeToDeviceListChanges(listener: DeviceListChangeListener): () => void {
		this.assertNotDisposed();
		if (this.deviceListListeners.size === 0) {
			try {
				this.installDeviceChangeListener();
			} catch (error) {
				throw normalizeBrowserError(error, undefined, "UNKNOWN");
			}
		}
		this.deviceListListeners.add(listener);
		let active = true;

		return () => {
			if (!active) return;
			if (this.deviceListListeners.size === 1 && this.deviceListListeners.has(listener)) {
				this.uninstallDeviceChangeListener();
			}
			this.deviceListListeners.delete(listener);
			active = false;
		};
	}

	public dispose(): void {
		if (this.isDisposed) return;
		this.uninstallDeviceChangeListener();
		this.deviceListListeners.clear();
		this.isDisposed = true;
	}

	private createDeviceCapabilityInfo(
		deviceId: string,
		track: MediaStreamTrack,
	): DeviceCapabilityInfo {
		return Object.freeze({
			deviceId,
			label: track.label || null,
			settings: deepCloneAndFreeze(track.getSettings()),
			capabilities: deepCloneAndFreeze(track.getCapabilities()),
		});
	}

	private throwIfAborted(signal?: AbortSignal): void {
		if (!signal?.aborted) return;
		throw new WebcamError("Capability snapshot was aborted", {
			code: "OPERATION_ABORTED",
			cause: signal.reason,
		});
	}

	private installDeviceChangeListener(): void {
		if (this.unsubscribeDeviceChange || !this.mediaDevices.subscribeDeviceChange) return;
		this.unsubscribeDeviceChange = this.mediaDevices.subscribeDeviceChange(() => {
			void this.notifyDeviceListListeners();
		});
	}

	private uninstallDeviceChangeListener(): void {
		if (!this.unsubscribeDeviceChange) return;
		try {
			this.unsubscribeDeviceChange();
		} catch (error) {
			throw normalizeBrowserError(error, undefined, "UNKNOWN");
		}
		this.unsubscribeDeviceChange = null;
	}

	private async notifyDeviceListListeners(): Promise<void> {
		try {
			const devices = await this.listDevices();
			for (const listener of [...this.deviceListListeners]) {
				try {
					listener(devices);
				} catch {
					// Consumer listeners are isolated.
				}
			}
		} catch {
			// A devicechange notification is advisory; callers may explicitly retry listDevices().
		}
	}

	private assertNotDisposed(): void {
		if (!this.isDisposed) return;
		throw new WebcamError("DeviceManager has been disposed", {
			code: "DISPOSED",
			recoverable: false,
		});
	}
}
