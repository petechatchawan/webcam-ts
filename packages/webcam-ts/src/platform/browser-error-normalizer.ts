import { WebcamError, type WebcamErrorCode, type WebcamOperation } from "../domain/error.js";

interface BrowserConstraintFailure extends Error {
	readonly constraint?: unknown;
}

export function normalizeBrowserError(
	error: unknown,
	operation?: WebcamOperation,
	fallbackCode: WebcamErrorCode = "STREAM_OPEN_FAILED",
): WebcamError {
	if (error instanceof WebcamError) return error;

	const name = error instanceof Error ? error.name : undefined;
	const mapping: Record<string, WebcamErrorCode> = {
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
	const code = name ? mapping[name] ?? fallbackCode : "UNKNOWN";
	const rawConstraint =
		error instanceof Error ? (error as BrowserConstraintFailure).constraint : undefined;
	const constraint =
		typeof rawConstraint === "string" && rawConstraint.length > 0 ? rawConstraint : undefined;
	const context = name
		? Object.freeze({
				browserErrorName: name,
				...(constraint ? { constraint } : {}),
		  })
		: undefined;

	return new WebcamError(error instanceof Error ? error.message : "Webcam operation failed", {
		code,
		operation,
		recoverable: !["UNSUPPORTED_RUNTIME", "UNSUPPORTED_BROWSER"].includes(code),
		cause: error,
		...(context ? { context } : {}),
	});
}
