export type CameraOperation = "start" | "switch" | "stop" | "dispose";

export type CameraErrorCode =
  | "UNSUPPORTED_RUNTIME"
  | "UNSUPPORTED_BROWSER"
  | "INVALID_REQUEST"
  | "INVALID_STATE"
  | "DISPOSED"
  | "PERMISSION_DENIED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_BUSY"
  | "CONSTRAINT_UNSATISFIED"
  | "SECURITY_RESTRICTION"
  | "OPERATION_ABORTED"
  | "OPERATION_SUPERSEDED"
  | "STREAM_OPEN_FAILED"
  | "STREAM_INVALID"
  | "TRACK_ENDED"
  | "CONTROL_UNSUPPORTED"
  | "CONTROL_FAILED"
  | "PREVIEW_FAILED"
  | "CAPTURE_FAILED"
  | "UNKNOWN";

export interface CameraErrorOptions {
  code: CameraErrorCode;
  operation?: CameraOperation;
  recoverable?: boolean;
  cause?: unknown;
  context?: Readonly<Record<string, unknown>>;
}

export interface CameraErrorSnapshot {
  readonly name: "CameraError";
  readonly message: string;
  readonly code: CameraErrorCode;
  readonly operation?: CameraOperation;
  readonly recoverable: boolean;
  readonly context?: Readonly<Record<string, unknown>>;
}

export class CameraError extends Error {
  readonly code: CameraErrorCode;
  readonly operation?: CameraOperation;
  readonly recoverable: boolean;
  readonly context?: Readonly<Record<string, unknown>>;
  override readonly cause?: unknown;

  constructor(message: string, options: CameraErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CameraError";
    this.code = options.code;
    this.operation = options.operation;
    this.recoverable = options.recoverable ?? true;
    this.cause = options.cause;
    this.context = options.context ? Object.freeze({ ...options.context }) : undefined;
    Object.setPrototypeOf(this, CameraError.prototype);
  }

  toSnapshot(): CameraErrorSnapshot {
    return Object.freeze({
      name: "CameraError" as const,
      message: this.message,
      code: this.code,
      ...(this.operation ? { operation: this.operation } : {}),
      recoverable: this.recoverable,
      ...(this.context ? { context: this.context } : {}),
    });
  }
}
