import {
  CameraError,
  type CameraErrorCode,
  type CameraOperation,
} from "../domain/camera-error.js";

export class OperationLease {
  private valid = true;
  private invalidCode: CameraErrorCode = "OPERATION_SUPERSEDED";

  constructor(
    readonly id: number,
    readonly operation: CameraOperation,
  ) {}

  isCurrent(): boolean {
    return this.valid;
  }

  invalidate(code: CameraErrorCode): void {
    if (!this.valid) return;
    this.valid = false;
    this.invalidCode = code;
  }

  toInvalidError(): CameraError {
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

  throwIfInvalid(): void {
    if (this.valid) return;
    throw this.toInvalidError();
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
