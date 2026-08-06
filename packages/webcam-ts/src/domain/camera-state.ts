import type { CameraErrorSnapshot } from "./camera-error.js";

export type CameraStatus = "idle" | "starting" | "active" | "switching" | "stopping" | "disposed";

export interface CameraState {
  readonly status: CameraStatus;
  readonly sessionId: string | null;
  readonly deviceId: string | null;
  readonly trackLabel: string | null;
  readonly settings: Readonly<MediaTrackSettings> | null;
  readonly capabilities: Readonly<MediaTrackCapabilities> | null;
  readonly startedAt: number | null;
  readonly lastError: CameraErrorSnapshot | null;
}
