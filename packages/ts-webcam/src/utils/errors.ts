export enum WebcamErrorCode {
	PERMISSION_DENIED = "PERMISSION_DENIED",
	DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND",
	DEVICE_BUSY = "DEVICE_BUSY",
	OVERCONSTRAINED = "OVERCONSTRAINED",
	STREAM_FAILED = "STREAM_FAILED",
	CAPTURE_FAILED = "CAPTURE_FAILED",
	INVALID_CONFIG = "INVALID_CONFIG",
	VIDEO_ELEMENT_NOT_SET = "VIDEO_ELEMENT_NOT_SET",
	DEVICES_ERROR = "DEVICES_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class WebcamError extends Error {
	constructor(
		public message: string,
		public code: WebcamErrorCode = WebcamErrorCode.UNKNOWN_ERROR,
		public originalError?: any,
	) {
		super(message);
		this.name = "WebcamError";
		Object.setPrototypeOf(this, WebcamError.prototype);
	}
}
