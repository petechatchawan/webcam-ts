import {
  CameraError,
  type CameraErrorCode,
  type CameraOperation,
} from "./domain/camera-error.js";

export class OperationToken {
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
  private current: OperationToken | null = null;

  begin(operation: CameraOperation): OperationToken {
    this.current?.invalidate("OPERATION_SUPERSEDED");
    const token = new OperationToken(++this.nextId, operation);
    this.current = token;
    return token;
  }

  nextOperationId(): number {
    return ++this.nextId;
  }

  isCurrent(token: OperationToken): boolean {
    return this.current === token;
  }

  invalidate(code: CameraErrorCode = "OPERATION_SUPERSEDED"): void {
    this.current?.invalidate(code);
    this.current = null;
  }
}
