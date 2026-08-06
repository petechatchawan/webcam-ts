import type {
  CameraErrorSnapshot,
  CameraEvent,
  CameraState,
  CameraStatus,
} from "webcam-ts";
import type {
  CameraDevice,
  CameraPermissionMap,
} from "webcam-ts/devices";

export type FacingSelection = "" | "user" | "environment";
export type ResolutionOrientation = "portrait" | "landscape" | "square";
export type ResolutionConstraintMode = "exact" | "ideal";

export interface ResolutionPreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly orientation: ResolutionOrientation;
}

export interface RequestedResolutionSnapshot {
  readonly id: string;
  readonly label: string;
  readonly mode: ResolutionConstraintMode;
  readonly width: number;
  readonly height: number;
}

export interface CameraSelection {
  readonly deviceId: string;
  readonly facingMode: FacingSelection;
  readonly resolutionId: string;
  readonly resolutionLabel: string;
  readonly resolutionMode: ResolutionConstraintMode;
  readonly width: number;
  readonly height: number;
  readonly audio: boolean;
  readonly mirror: boolean;
}

export interface CommandAvailability {
  readonly canStart: boolean;
  readonly canSwitch: boolean;
  readonly canStop: boolean;
  readonly busy: boolean;
}

export interface PlaygroundError {
  readonly code: string;
  readonly message: string;
  readonly operation?: string;
  readonly recoverable: boolean;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface PlaygroundEventEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly type: CameraEvent["type"];
  readonly summary: string;
}

export interface CaptureSnapshot {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly type: string;
  readonly size: number;
  readonly timestamp: number;
}

export interface ZoomCapability {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
}

export interface ControlSnapshot {
  readonly torchSupported: boolean;
  readonly zoom: ZoomCapability | null;
  readonly focusModes: readonly string[];
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface PlaygroundSnapshot {
  readonly camera: CameraState;
  readonly permissions: CameraPermissionMap;
  readonly devices: readonly CameraDevice[];
  readonly availability: CommandAvailability;
  readonly controls: ControlSnapshot;
  readonly requestedResolution: RequestedResolutionSnapshot | null;
  readonly capture: CaptureSnapshot | null;
  readonly error: PlaygroundError | null;
  readonly events: readonly PlaygroundEventEntry[];
}

export interface UrlPort {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export type CameraFailureLike =
  | CameraErrorSnapshot
  | Readonly<{
      message?: unknown;
      code?: unknown;
      operation?: unknown;
      recoverable?: unknown;
      context?: unknown;
    }>;

export type { CameraEvent, CameraState, CameraStatus };
