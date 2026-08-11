import { CameraError, type CameraOperation } from "../domain/camera-error.js";
import type { CameraRequest, ConstraintNumber } from "../domain/camera-request.js";

export type ExactResolutionPostconditionResult =
  | Readonly<{ status: "verified" }>
  | Readonly<{ status: "unobservable" }>;

export interface OrientationEquivalentExactRetry {
  readonly request: CameraRequest;
  readonly requestedWidth: number;
  readonly requestedHeight: number;
}

function exactValue(constraint: ConstraintNumber | undefined): number | undefined {
  if (constraint === undefined) return undefined;
  if (typeof constraint === "number") return constraint;
  return constraint.exact;
}

function authoritativeValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function createOrientationEquivalentExactRetry(
  request: CameraRequest,
): OrientationEquivalentExactRetry | null {
  const resolution = request.resolution;
  if (!resolution?.width || !resolution.height) return null;

  const requestedWidth = exactValue(resolution.width);
  const requestedHeight = exactValue(resolution.height);
  if (
    requestedWidth === undefined ||
    requestedHeight === undefined ||
    requestedWidth === requestedHeight
  ) {
    return null;
  }

  return {
    request: {
      ...request,
      resolution: {
        ...resolution,
        width: resolution.height,
        height: resolution.width,
      },
    },
    requestedWidth,
    requestedHeight,
  };
}

export function verifyExactResolutionPostcondition(
  request: CameraRequest,
  settings: MediaTrackSettings,
  operation: Extract<CameraOperation, "start" | "switch">,
): ExactResolutionPostconditionResult {
  const requestedWidth = exactValue(request.resolution?.width);
  const requestedHeight = exactValue(request.resolution?.height);

  if (requestedWidth === undefined && requestedHeight === undefined) {
    return { status: "unobservable" };
  }

  const actualWidth = authoritativeValue(settings.width);
  const actualHeight = authoritativeValue(settings.height);

  if (
    (requestedWidth !== undefined && actualWidth === undefined) ||
    (requestedHeight !== undefined && actualHeight === undefined)
  ) {
    return { status: "unobservable" };
  }

  if (
    requestedWidth !== undefined &&
    requestedHeight !== undefined &&
    actualWidth !== undefined &&
    actualHeight !== undefined
  ) {
    const directMatch = actualWidth === requestedWidth && actualHeight === requestedHeight;
    const rotatedMatch = actualWidth === requestedHeight && actualHeight === requestedWidth;
    if (directMatch || rotatedMatch) return { status: "verified" };
  }

  const widthMismatch = requestedWidth !== undefined && actualWidth !== requestedWidth;
  const heightMismatch = requestedHeight !== undefined && actualHeight !== requestedHeight;

  if (widthMismatch || heightMismatch) {
    throw new CameraError("Delivered camera resolution does not satisfy the exact request", {
      code: "CONSTRAINT_UNSATISFIED",
      operation,
      recoverable: true,
      context: {
        ...(requestedWidth !== undefined ? { requestedWidth } : {}),
        ...(requestedHeight !== undefined ? { requestedHeight } : {}),
        ...(actualWidth !== undefined ? { actualWidth } : {}),
        ...(actualHeight !== undefined ? { actualHeight } : {}),
        mismatchedDimensions: [
          ...(widthMismatch ? ["width"] : []),
          ...(heightMismatch ? ["height"] : []),
        ],
      },
    });
  }

  return { status: "verified" };
}