import {
  CameraError,
  type CameraErrorCode,
  type CameraOperation,
} from "../domain/camera-error.js";

export class OperationLease {
  private valid = true;
  private invalidCode: CameraErrorCode = "OPERATION_SUPERSEDED";
  private invalidError: CameraError | null = null;
  private readonly invalidatedPromise: Promise<CameraError>;
  private readonly resolveInvalidated: (error: CameraError) => void;

  constructor(
    readonly id: number,
    readonly operation: CameraOperation,
  ) {
    let resolveInvalidated!: (error: CameraError) => void;
    this.invalidatedPromise = new Promise<CameraError>((resolve) => {
      resolveInvalidated = resolve;
    });
    this.resolveInvalidated = resolveInvalidated;
  }

  isCurrent(): boolean {
    return this.valid;
  }

  invalidate(code: CameraErrorCode): void {
    if (!this.valid) return;
    this.valid = false;
    this.invalidCode = code;
    this.invalidError = this.createInvalidError();
    this.resolveInvalidated(this.invalidError);
  }

  whenInvalidated(): Promise<CameraError> {
    return this.invalidatedPromise;
  }

  toInvalidError(): CameraError {
    return this.invalidError ?? this.createInvalidError();
  }

  throwIfInvalid(): void {
    if (this.valid) return;
    throw this.toInvalidError();
  }

  private createInvalidError(): CameraError {
    const message =
      this.invalidCode === "DISPOSED"
        ? "Camera was disposed while the operation was running"
        : this.invalidCode === "OPERATION_ABORTED"
          ? `${this.operation} operation was aborted`
          : `${this.operation} operation was superseded`;

    return new CameraError(message, {
      code: this.invalidCode,
      operation: this.operation,
      recoverable: this.invalidCode !== "DISPOSED",
      context: { operationId: this.id },
    });
  }
}

export class OperationController {
  private nextId = 0;
  private current: OperationLease | null = null;

  begin(operation: CameraOperation): OperationLease {
    this.current?.invalidate("OPERATION_SUPERSEDED");
    const lease = new OperationLease(++this.nextId, operation);
    this.current = lease;
    return lease;
  }

  invalidate(code: CameraErrorCode = "OPERATION_SUPERSEDED"): void {
    this.current?.invalidate(code);
    this.current = null;
  }
}
