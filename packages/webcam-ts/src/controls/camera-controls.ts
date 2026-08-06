import type { Camera } from "../camera.js";
import { CameraError } from "../domain/camera-error.js";

interface ExtendedCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
}

interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  zoom?: number;
  focusMode?: string;
}

export interface CameraControlUpdate {
  readonly torch?: boolean;
  readonly zoom?: number;
  readonly focusMode?: string;
}

export class CameraControls {
  constructor(private readonly camera: Camera) {}

  getCapabilities(): Readonly<ExtendedCapabilities> {
    const track = this.requireTrack();
    return Object.freeze({ ...(track.getCapabilities() as ExtendedCapabilities) });
  }

  async set(update: CameraControlUpdate): Promise<Readonly<MediaTrackSettings>> {
    const track = this.requireTrack();
    const capabilities = track.getCapabilities() as ExtendedCapabilities;
    const constraints: ExtendedConstraintSet = {};

    if (update.torch !== undefined) {
      if (!("torch" in capabilities)) this.unsupported("torch");
      constraints.torch = update.torch;
    }

    if (update.zoom !== undefined) {
      const range = capabilities.zoom;
      if (!range) this.unsupported("zoom");
      if (!Number.isFinite(update.zoom) || update.zoom < range.min || update.zoom > range.max) {
        throw new CameraError("Zoom is outside the supported range", {
          code: "INVALID_REQUEST",
          recoverable: true,
          context: { min: range.min, max: range.max },
        });
      }
      constraints.zoom = update.zoom;
    }

    if (update.focusMode !== undefined) {
      const modes = capabilities.focusMode;
      if (!modes?.includes(update.focusMode)) this.unsupported("focusMode");
      constraints.focusMode = update.focusMode;
    }

    if (Object.keys(constraints).length === 0) {
      throw new CameraError("At least one camera control must be supplied", {
        code: "INVALID_REQUEST",
        recoverable: true,
      });
    }

    try {
      await track.applyConstraints({ advanced: [constraints] });
      return Object.freeze({ ...track.getSettings() });
    } catch (error) {
      throw new CameraError("Failed to apply camera controls", {
        code: "CONTROL_FAILED",
        recoverable: true,
        cause: error,
      });
    }
  }

  private requireTrack(): MediaStreamTrack {
    const track = this.camera.getActiveTrack();
    if (!track) {
      throw new CameraError("Camera must be active before using controls", {
        code: "INVALID_STATE",
        recoverable: true,
      });
    }
    return track;
  }

  private unsupported(control: string): never {
    throw new CameraError(`${control} is not supported by the active camera`, {
      code: "CONTROL_UNSUPPORTED",
      recoverable: true,
      context: { control },
    });
  }
}
