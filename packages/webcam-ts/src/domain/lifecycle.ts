import { WebcamError, type WebcamOperation } from "./error.js";
import type { WebcamStatus } from "./state.js";

export function assertCommandAllowed(status: WebcamStatus, command: WebcamOperation): void {
	if (command === "dispose") return;
	if (status === "disposed") {
		throw new WebcamError("Webcam has been disposed", {
			code: "DISPOSED",
			operation: command,
			recoverable: false,
		});
	}

	const allowed =
		(command === "start" && (status === "idle" || status === "active")) || command === "stop";

	if (!allowed) {
		throw new WebcamError(`Cannot ${command} while camera is ${status}`, {
			code: "INVALID_STATE",
			operation: command,
			recoverable: true,
			context: { status },
		});
	}
}
