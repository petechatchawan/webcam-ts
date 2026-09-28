import type { WebcamErrorSnapshot } from "./error.js";

export type WebcamStatus = "idle" | "starting" | "active" | "stopping" | "disposed";

export interface WebcamState {
	readonly status: WebcamStatus;
	readonly sessionId: string | null;
	readonly deviceId: string | null;
	readonly trackLabel: string | null;
	readonly settings: Readonly<MediaTrackSettings> | null;
	readonly capabilities: Readonly<MediaTrackCapabilities> | null;
	readonly startedAt: number | null;
	readonly lastError: WebcamErrorSnapshot | null;
}
