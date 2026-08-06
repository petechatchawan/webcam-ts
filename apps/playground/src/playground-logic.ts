import type { CameraRequest } from "webcam-ts";
import type { CameraPermissionMap } from "webcam-ts/devices";
import type {
  CameraFailureLike,
  CameraSelection,
  CameraStatus,
  CommandAvailability,
  PlaygroundError,
  RequestedResolutionSnapshot,
  ResolutionOrientation,
  ResolutionPreset,
  UrlPort,
} from "./models.js";

function createResolution(
  id: string,
  width: number,
  height: number,
  orientation: ResolutionOrientation,
): ResolutionPreset {
  return Object.freeze({ id, label: id, width, height, orientation });
}

const RESOLUTION_PRESETS: readonly ResolutionPreset[] = Object.freeze([
  createResolution("PORTRAIT-360P", 360, 640, "portrait"),
  createResolution("PORTRAIT-480P", 480, 854, "portrait"),
  createResolution("PORTRAIT-720P", 720, 1280, "portrait"),
  createResolution("PORTRAIT-1080P", 1080, 1920, "portrait"),
  createResolution("PORTRAIT-2K", 1440, 2560, "portrait"),
  createResolution("PORTRAIT-4K", 2160, 3840, "portrait"),
  createResolution("LANDSCAPE-360P", 640, 360, "landscape"),
  createResolution("LANDSCAPE-480P", 854, 480, "landscape"),
  createResolution("LANDSCAPE-720P", 1280, 720, "landscape"),
  createResolution("LANDSCAPE-1080P", 1920, 1080, "landscape"),
  createResolution("LANDSCAPE-2K", 2560, 1440, "landscape"),
  createResolution("LANDSCAPE-4K", 3840, 2160, "landscape"),
  createResolution("SQUARE-360", 360, 360, "square"),
  createResolution("SQUARE-480", 480, 480, "square"),
  createResolution("SQUARE-720", 720, 720, "square"),
  createResolution("SQUARE-1080", 1080, 1080, "square"),
  createResolution("SQUARE-1920", 1920, 1920, "square"),
  createResolution("SQUARE-2K", 2048, 2048, "square"),
  createResolution("SQUARE-4K", 4096, 4096, "square"),
]);

export function getResolutionPresets(): readonly ResolutionPreset[] {
  return RESOLUTION_PRESETS;
}

export function findResolutionPreset(id: string): ResolutionPreset | null {
  return RESOLUTION_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function hasCameraPermission(state: CameraPermissionMap["camera"]): boolean {
  return state === "granted";
}

export function projectRequestedResolution(
  selection: CameraSelection,
): RequestedResolutionSnapshot {
  return Object.freeze({
    id: selection.resolutionId,
    label: selection.resolutionLabel,
    width: selection.width,
    height: selection.height,
  });
}

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
