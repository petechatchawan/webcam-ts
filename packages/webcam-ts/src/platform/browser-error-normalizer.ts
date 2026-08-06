import {
  CameraError,
  type CameraErrorCode,
  type CameraOperation,
} from "../domain/camera-error.js";

export function normalizeBrowserError(error: unknown, operation?: CameraOperation): CameraError {
  if (error instanceof CameraError) return error;

  const name = error instanceof Error ? error.name : undefined;
  const mapping: Record<string, CameraErrorCode> = {
    NotAllowedError: "PERMISSION_DENIED",
    PermissionDeniedError: "PERMISSION_DENIED",
    NotFoundError: "DEVICE_NOT_FOUND",
    DevicesNotFoundError: "DEVICE_NOT_FOUND",
    NotReadableError: "DEVICE_BUSY",
    TrackStartError: "DEVICE_BUSY",
    OverconstrainedError: "CONSTRAINT_UNSATISFIED",
    ConstraintNotSatisfiedError: "CONSTRAINT_UNSATISFIED",
    SecurityError: "SECURITY_RESTRICTION",
    AbortError: "OPERATION_ABORTED",
  };
  const code = name ? mapping[name] ?? "STREAM_OPEN_FAILED" : "UNKNOWN";

  return new CameraError(error instanceof Error ? error.message : "Camera operation failed", {
    code,
    operation,
    recoverable: !["UNSUPPORTED_RUNTIME", "UNSUPPORTED_BROWSER"].includes(code),
    cause: error,
    ...(name ? { context: { browserErrorName: name } } : {}),
  });
}
