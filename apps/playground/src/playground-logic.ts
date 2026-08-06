import type { CameraRequest } from "webcam-ts";
import type {
  CameraFailureLike,
  CameraSelection,
  CameraStatus,
  CommandAvailability,
  PlaygroundError,
  UrlPort,
} from "./models.js";

export function buildCameraRequest(selection: CameraSelection): CameraRequest {
  const request: {
    deviceId?: string;
    facingMode?: "user" | "environment";
    resolution?: {
      width: { ideal: number };
      height: { ideal: number };
    };
    audio: boolean;
  } = { audio: selection.audio };

  const deviceId = selection.deviceId.trim();
  if (deviceId) {
    request.deviceId = deviceId;
  } else if (selection.facingMode) {
    request.facingMode = selection.facingMode;
  }

  if (selection.width > 0 && selection.height > 0) {
    request.resolution = {
      width: { ideal: selection.width },
      height: { ideal: selection.height },
    };
  }

  return request;
}

export function deriveCommandAvailability(status: CameraStatus): CommandAvailability {
  switch (status) {
    case "idle":
      return { canStart: true, canSwitch: false, canStop: false, busy: false };
    case "active":
      return { canStart: false, canSwitch: true, canStop: true, busy: false };
    case "starting":
    case "switching":
      return { canStart: false, canSwitch: false, canStop: true, busy: true };
    case "stopping":
      return { canStart: false, canSwitch: false, canStop: false, busy: true };
    case "disposed":
      return { canStart: false, canSwitch: false, canStop: false, busy: false };
  }
}

export function appendEventLog<T>(entries: readonly T[], entry: T, limit = 80): readonly T[] {
  if (!Number.isInteger(limit) || limit <= 0) return Object.freeze([]);
  return Object.freeze([...entries, entry].slice(-limit));
}

export function projectCameraError(error: unknown): PlaygroundError {
  const candidate = (error && typeof error === "object" ? error : {}) as CameraFailureLike;
  const message = typeof candidate.message === "string" ? candidate.message : String(error);
  const code = typeof candidate.code === "string" ? candidate.code : "UNKNOWN";
  const operation = typeof candidate.operation === "string" ? candidate.operation : undefined;
  const recoverable = typeof candidate.recoverable === "boolean" ? candidate.recoverable : true;
  const context =
    candidate.context && typeof candidate.context === "object"
      ? (candidate.context as Readonly<Record<string, unknown>>)
      : undefined;

  return Object.freeze({
    code,
    message,
    ...(operation ? { operation } : {}),
    recoverable,
    ...(context ? { context } : {}),
  });
}

export function replaceObjectUrl(
  currentUrl: string | null,
  blob: Blob | null,
  urlPort: UrlPort,
): string | null {
  if (currentUrl) urlPort.revokeObjectURL(currentUrl);
  return blob ? urlPort.createObjectURL(blob) : null;
}
