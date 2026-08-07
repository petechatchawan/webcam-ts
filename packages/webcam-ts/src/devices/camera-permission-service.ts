import { CameraError } from "../domain/camera-error.js";
import { BrowserMediaDevicesAdapter } from "../platform/browser-media-devices-adapter.js";
import type { MediaDevicesPort } from "../platform/media-devices-port.js";
import { stopStream } from "../session/stream-cleanup.js";

export type CameraPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export interface CameraPermissionMap {
  readonly camera: CameraPermissionState;
  readonly microphone: CameraPermissionState;
}

export interface CameraPermissionRequest {
  readonly video?: boolean;
  readonly audio?: boolean;
}

export interface CameraPermissionServiceOptions {
  readonly mediaDevices?: MediaDevicesPort;
  readonly permissions?: Permissions | null;
}

export class CameraPermissionService {
  private readonly mediaDevices: MediaDevicesPort;
  private readonly explicitPermissions: Permissions | null | undefined;

  constructor(options: CameraPermissionServiceOptions = {}) {
    this.mediaDevices = options.mediaDevices ?? new BrowserMediaDevicesAdapter();
    this.explicitPermissions = options.permissions;
  }

  async query(): Promise<CameraPermissionMap> {
    const permissions = this.resolvePermissions();
    if (!permissions) {
      return Object.freeze({ camera: "unsupported", microphone: "unsupported" });
    }

    const [camera, microphone] = await Promise.all([
      this.queryOne(permissions, "camera"),
      this.queryOne(permissions, "microphone"),
    ]);
    return Object.freeze({ camera, microphone });
  }

  async request(request: CameraPermissionRequest = {}): Promise<CameraPermissionMap> {
    const video = request.video ?? true;
    const audio = request.audio ?? false;
    if (!video && !audio) {
      throw new CameraError("At least one permission must be requested", {
        code: "INVALID_REQUEST",
        recoverable: true,
      });
    }

    const stream = await this.mediaDevices.open({ video, audio });
    stopStream(stream);
    const queried = await this.query();
    return Object.freeze({
      camera: video ? "granted" : queried.camera,
      microphone: audio ? "granted" : queried.microphone,
    });
  }

  private resolvePermissions(): Permissions | null {
    if (this.explicitPermissions !== undefined) return this.explicitPermissions;
    return globalThis.navigator?.permissions ?? null;
  }

  private async queryOne(permissions: Permissions, name: "camera" | "microphone"): Promise<CameraPermissionState> {
    try {
      const result = await permissions.query({ name: name as PermissionName });
      return result.state;
    } catch {
      return "unknown";
    }
  }
}
