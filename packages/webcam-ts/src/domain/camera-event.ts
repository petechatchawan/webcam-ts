import type { CameraError, CameraOperation } from "./camera-error.js";
import type { CameraState } from "./camera-state.js";

export type CameraEvent =
  | Readonly<{ type: "state-changed"; state: CameraState }>
  | Readonly<{
      type: "stream-changed";
      stream: MediaStream | null;
      previousStream: MediaStream | null;
      reason: "started" | "switched" | "stopped" | "disposed" | "ended";
    }>
  | Readonly<{ type: "operation-started"; operation: CameraOperation; operationId: number }>
  | Readonly<{ type: "operation-completed"; operation: CameraOperation; operationId: number }>
  | Readonly<{ type: "session-ended"; error: CameraError }>
  | Readonly<{
      type: "operation-failed";
      operation: CameraOperation;
      operationId: number;
      error: CameraError;
    }>;

export type CameraEventListener = (event: CameraEvent) => void;
