import type { SanitizedCameraError } from "./types.js";

const ALLOWED_EVIDENCE_KEYS = new Set([
	"actual",
	"aspectRatio",
	"browserErrorName",
	"code",
	"constraint",
	"count",
	"durationMs",
	"expected",
	"facingMode",
	"focusMode",
	"frameRate",
	"hardwareClass",
	"height",
	"max",
	"message",
	"mimeType",
	"min",
	"mode",
	"operation",
	"orientation",
	"passed",
	"presetId",
	"reason",
	"recoverable",
	"resizeMode",
	"secureContext",
	"state",
	"status",
	"step",
	"supported",
	"torch",
	"type",
	"width",
	"zoom",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function sanitizePrimitive(value: unknown): string | number | boolean | null | undefined {
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	return undefined;
}

export function sanitizeEvidenceValue(value: unknown): unknown {
	const primitive = sanitizePrimitive(value);
	if (primitive !== undefined || value === null) return primitive;

	if (Array.isArray(value)) {
		return value
			.map((item) => sanitizeEvidenceValue(item))
			.filter((item) => item !== undefined);
	}

	if (!isPlainRecord(value)) return undefined;

	const sanitized: Record<string, unknown> = {};
	for (const key of ALLOWED_EVIDENCE_KEYS) {
		if (!(key in value)) continue;
		const safeValue = sanitizeEvidenceValue(value[key]);
		if (safeValue !== undefined) sanitized[key] = safeValue;
	}
	return sanitized;
}

export function sanitizePageUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		return `${url.origin}${url.pathname}`;
	} catch {
		return undefined;
	}
}

function readRecordField(record: Record<string, unknown>, key: string): unknown {
	return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function sanitizeCameraError(error: unknown): SanitizedCameraError {
	const record =
		typeof error === "object" && error !== null
			? (error as Record<string, unknown>)
			: {};
	const rawCode = readRecordField(record, "code");
	const rawOperation = readRecordField(record, "operation");
	const rawRecoverable = readRecordField(record, "recoverable");
	const rawContext = readRecordField(record, "context");
	const context = sanitizeEvidenceValue(rawContext);
	const message = error instanceof Error ? error.message : readRecordField(record, "message");

	return Object.freeze({
		code: typeof rawCode === "string" ? rawCode : "UNKNOWN",
		message: typeof message === "string" ? message : "Camera operation failed",
		...(typeof rawOperation === "string" ? { operation: rawOperation } : {}),
		...(typeof rawRecoverable === "boolean" ? { recoverable: rawRecoverable } : {}),
		...(isPlainRecord(context) && Object.keys(context).length > 0
			? { context: Object.freeze({ ...context }) }
			: {}),
	});
}
