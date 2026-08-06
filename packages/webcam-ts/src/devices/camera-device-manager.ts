import type { Camera } from "../camera.js";
import { CameraError } from "../domain/camera-error.js";
import { BrowserMediaDevicesAdapter } from "../platform/browser-media-devices-adapter.js";
import type { MediaDevicesPort } from "../platform/media-devices-port.js";
import { stopStream } from "../session/stream-cleanup.js";

export interface CameraDevice {
  readonly deviceId: string;
  readonly groupId: string | null;
  readonly label: string | null;
}


export interface CameraDeviceCapabilities {
  readonly deviceId: string;
  readonly label: string | null;
  readonly settings: Readonly<MediaTrackSettings>;
  readonly capabilities: Readonly<MediaTrackCapabilities>;
}

export interface CameraCapabilityProbeOptions {
  readonly camera?: Camera;
  readonly signal?: AbortSignal;
}

export interface CameraDeviceManagerOptions {
  readonly mediaDevices?: MediaDevicesPort;
}

export type CameraDeviceListener = (devices: readonly CameraDevice[]) => void;


function cloneAndFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item))) as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = cloneAndFreeze(nested);
  }
  return Object.freeze(clone) as T;
}

export class CameraDeviceManager {
  private readonly mediaDevices: MediaDevicesPort;
  private readonly listeners = new Set<CameraDeviceListener>();
  private removeDeviceChange: (() => void) | null = null;
  private disposed = false;

  constructor(options: CameraDeviceManagerOptions = {}) {
    this.mediaDevices = options.mediaDevices ?? new BrowserMediaDevicesAdapter();
  }

  async list(): Promise<readonly CameraDevice[]> {
    this.assertUsable();
    const devices = await this.mediaDevices.enumerateDevices();
    return Object.freeze(
      devices
        .filter((device) => device.kind === "videoinput")
        .map((device) =>
          Object.freeze({
            deviceId: device.deviceId,
            groupId: device.groupId || null,
            label: device.label || null,
          }),
        ),
    );
  }


  async probe(
    deviceId: string,
    options: CameraCapabilityProbeOptions = {},
  ): Promise<CameraDeviceCapabilities> {
    this.assertUsable();
    if (!deviceId.trim()) {
      throw new CameraError("A deviceId is required for capability probing", {
        code: "INVALID_REQUEST",
      });
    }
    this.throwIfAborted(options.signal);

    const activeTrack = options.camera?.getActiveTrack() ?? null;
    if (activeTrack && activeTrack.readyState === "live") {
      const activeSettings = activeTrack.getSettings();
      if (activeSettings.deviceId === deviceId) {
        return this.createCapabilitySnapshot(deviceId, activeTrack);
      }
    }

    let probeStream: MediaStream | null = null;
    try {
      probeStream = await this.mediaDevices.open({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      this.throwIfAborted(options.signal);

      const track = probeStream.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        throw new CameraError("Capability probe did not produce a live video track", {
          code: "STREAM_INVALID",
          context: { deviceId },
        });
      }

      return this.createCapabilitySnapshot(deviceId, track);
    } finally {
      if (probeStream) stopStream(probeStream);
    }
  }

  subscribe(listener: CameraDeviceListener): () => void {
    this.assertUsable();
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.installDeviceChangeListener();
    let active = true;

    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.uninstallDeviceChangeListener();
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.uninstallDeviceChangeListener();
    this.listeners.clear();
    this.disposed = true;
  }


  private createCapabilitySnapshot(
    deviceId: string,
    track: MediaStreamTrack,
  ): CameraDeviceCapabilities {
    return Object.freeze({
      deviceId,
      label: track.label || null,
      settings: cloneAndFreeze(track.getSettings()),
      capabilities: cloneAndFreeze(track.getCapabilities()),
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw new CameraError("Capability probe was aborted", {
      code: "OPERATION_ABORTED",
      cause: signal.reason,
    });
  }

  private installDeviceChangeListener(): void {
    if (this.removeDeviceChange || !this.mediaDevices.subscribeDeviceChange) return;
    this.removeDeviceChange = this.mediaDevices.subscribeDeviceChange(() => {
      void this.publishCurrentDevices();
    });
  }

  private uninstallDeviceChangeListener(): void {
    this.removeDeviceChange?.();
    this.removeDeviceChange = null;
  }

  private async publishCurrentDevices(): Promise<void> {
    try {
      const devices = await this.list();
      for (const listener of [...this.listeners]) {
        try {
          listener(devices);
        } catch {
          // Consumer listeners are isolated.
        }
      }
    } catch {
      // A devicechange notification is advisory; callers may explicitly retry list().
    }
  }

  private assertUsable(): void {
    if (!this.disposed) return;
    throw new CameraError("CameraDeviceManager has been disposed", {
      code: "DISPOSED",
      recoverable: false,
    });
  }
}
