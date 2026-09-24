import { CameraError, type CameraOperation } from "../domain/camera-error.js";
import type { CameraStatus } from "../domain/camera-state.js";

export function assertCommandAllowed(status: CameraStatus, command: CameraOperation): void {
  if (command === "dispose") return;
  if (status === "disposed") {
    throw new CameraError("Camera has been disposed", {
      code: "DISPOSED",
      operation: command,
      recoverable: false,
    });
  }

  const allowed =
    (command === "start" && status === "idle") ||
    (command === "switch" && (status === "active" || status === "switching")) ||
    command === "stop";

  if (!allowed) {
    throw new CameraError(`Cannot ${command} while camera is ${status}`, {
      code: "INVALID_STATE",
      operation: command,
      recoverable: true,
      context: { status },
    });
  }
}
