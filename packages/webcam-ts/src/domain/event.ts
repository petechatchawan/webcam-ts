import type { WebcamError, WebcamOperation } from "./error.js";
import type { WebcamState } from "./state.js";

export type WebcamEvent =
	| Readonly<{ type: "state-changed"; state: WebcamState }>
	| Readonly<{
			type: "stream-changed";
			stream: MediaStream | null;
			previousStream: MediaStream | null;
			reason: "started" | "stopped" | "disposed" | "ended";
	  }>
	| Readonly<{ type: "operation-started"; operation: WebcamOperation; operationId: number }>
	| Readonly<{ type: "operation-completed"; operation: WebcamOperation; operationId: number }>
	| Readonly<{ type: "session-ended"; error: WebcamError }>
	| Readonly<{
			type: "operation-failed";
			operation: WebcamOperation;
			operationId: number;
			error: WebcamError;
	  }>;

export type WebcamEventListener = (event: WebcamEvent) => void;
