export type WebcamOperation = "start" | "stop" | "dispose";

export type WebcamErrorCode =
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
	| "STREAM_OPEN_FAILED"
	| "STREAM_INVALID"
	| "TRACK_ENDED"
	| "CONTROL_UNSUPPORTED"
	| "CONTROL_FAILED"
	| "PREVIEW_FAILED"
	| "CAPTURE_FAILED"
	| "UNKNOWN";

export interface WebcamErrorOptions {
	code: WebcamErrorCode;
	operation?: WebcamOperation;
	recoverable?: boolean;
	cause?: unknown;
	context?: Readonly<Record<string, unknown>>;
}

export interface WebcamErrorSnapshot {
	readonly name: "WebcamError";
	readonly message: string;
	readonly code: WebcamErrorCode;
	readonly operation?: WebcamOperation;
	readonly recoverable: boolean;
	readonly context?: Readonly<Record<string, unknown>>;
}

function cloneAndFreeze<T>(value: T, clones = new WeakMap<object, unknown>()): T {
	if (!value || typeof value !== "object") return value;

	const existing = clones.get(value);
	if (existing) return existing as T;

	if (Array.isArray(value)) {
		const clone: unknown[] = [];
		clones.set(value, clone);
		for (const item of value) clone.push(cloneAndFreeze(item, clones));
		return Object.freeze(clone) as T;
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return value;

	const clone: Record<string, unknown> = {};
	clones.set(value, clone);
	for (const [key, nested] of Object.entries(value)) {
		clone[key] = cloneAndFreeze(nested, clones);
	}
	return Object.freeze(clone) as T;
}

export class WebcamError extends Error {
	public readonly code: WebcamErrorCode;
	public readonly operation?: WebcamOperation;
	public readonly recoverable: boolean;
	public readonly context?: Readonly<Record<string, unknown>>;
	public override readonly cause?: unknown;

	public constructor(message: string, options: WebcamErrorOptions) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "WebcamError";
		this.code = options.code;
		this.operation = options.operation;
		this.recoverable = options.recoverable ?? true;
		this.cause = options.cause;
		this.context = options.context ? Object.freeze({ ...options.context }) : undefined;
		Object.setPrototypeOf(this, WebcamError.prototype);
	}

	public toSnapshot(): WebcamErrorSnapshot {
		const context = this.context ? cloneAndFreeze(this.context) : undefined;
		return Object.freeze({
			name: "WebcamError" as const,
			message: this.message,
			code: this.code,
			...(this.operation ? { operation: this.operation } : {}),
			recoverable: this.recoverable,
			...(context ? { context } : {}),
		});
	}
}
