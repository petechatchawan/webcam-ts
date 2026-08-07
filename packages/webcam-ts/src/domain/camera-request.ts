import { CameraError } from "./camera-error.js";

export type ConstraintNumber =
  | number
  | Readonly<{
      min?: number;
      max?: number;
      ideal?: number;
      exact?: number;
    }>;

export type ConstraintString = Readonly<{
  ideal?: string;
  exact?: string;
}>;

export interface CameraRequest {
  readonly deviceId?: string;
  readonly facingMode?: "user" | "environment" | ConstraintString;
  readonly resolution?: Readonly<{
    width?: ConstraintNumber;
    height?: ConstraintNumber;
  }>;
  readonly frameRate?: ConstraintNumber;
  readonly audio?: boolean | MediaTrackConstraints;
  readonly signal?: AbortSignal;
}

function validateConstraintNumber(value: ConstraintNumber, field: string): void {
  const values = typeof value === "number" ? [value] : [value.min, value.max, value.ideal, value.exact];
  for (const candidate of values) {
    if (candidate !== undefined && (!Number.isFinite(candidate) || candidate <= 0)) {
      throw new CameraError(`${field} must contain finite values greater than zero`, {
        code: "INVALID_REQUEST",
        recoverable: true,
        context: { field },
      });
    }
  }

  if (typeof value !== "number" && value.min !== undefined && value.max !== undefined && value.min > value.max) {
    throw new CameraError(`${field}.min cannot be greater than ${field}.max`, {
      code: "INVALID_REQUEST",
      recoverable: true,
      context: { field },
    });
  }
}

function copyNumberConstraint(value: ConstraintNumber): ConstrainULong | ConstrainDouble {
  return typeof value === "number" ? value : { ...value };
}

export function buildMediaStreamConstraints(request: CameraRequest = {}): MediaStreamConstraints {
  if (request.signal?.aborted) {
    throw new CameraError("Camera operation was aborted before it started", {
      code: "OPERATION_ABORTED",
      recoverable: true,
    });
  }

  if (request.deviceId !== undefined && request.deviceId.trim().length === 0) {
    throw new CameraError("deviceId cannot be empty", {
      code: "INVALID_REQUEST",
      recoverable: true,
      context: { field: "deviceId" },
    });
  }

  if (request.deviceId && typeof request.facingMode === "object" && request.facingMode.exact) {
    throw new CameraError("deviceId cannot be combined with an exact facingMode", {
      code: "INVALID_REQUEST",
      recoverable: true,
      context: { fields: ["deviceId", "facingMode"] },
    });
  }

  if (request.resolution?.width !== undefined) validateConstraintNumber(request.resolution.width, "resolution.width");
  if (request.resolution?.height !== undefined) validateConstraintNumber(request.resolution.height, "resolution.height");
  if (request.frameRate !== undefined) validateConstraintNumber(request.frameRate, "frameRate");

  const video: MediaTrackConstraints = {};
  if (request.deviceId) video.deviceId = { exact: request.deviceId };
  if (request.facingMode !== undefined) {
    video.facingMode = typeof request.facingMode === "string" ? request.facingMode : { ...request.facingMode };
  }
  if (request.resolution?.width !== undefined) video.width = copyNumberConstraint(request.resolution.width) as ConstrainULong;
  if (request.resolution?.height !== undefined) video.height = copyNumberConstraint(request.resolution.height) as ConstrainULong;
  if (request.frameRate !== undefined) video.frameRate = copyNumberConstraint(request.frameRate) as ConstrainDouble;

  return {
    video,
    audio: request.audio ?? false,
  };
}
