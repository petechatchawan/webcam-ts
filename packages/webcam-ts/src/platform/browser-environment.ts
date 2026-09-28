import { WebcamError } from "../domain/error.js";

export function resolveMediaDevices(
	requiredMethod?: "getUserMedia" | "enumerateDevices",
): MediaDevices {
	const navigatorValue = globalThis.navigator;
	if (!navigatorValue || !navigatorValue.mediaDevices) {
		throw new WebcamError("Webcam APIs require a browser runtime", {
			code: "UNSUPPORTED_RUNTIME",
			recoverable: false,
		});
	}

	const mediaDevices = navigatorValue.mediaDevices;
	if (requiredMethod && typeof mediaDevices[requiredMethod] !== "function") {
		throw new WebcamError(`MediaDevices.${requiredMethod} is not supported`, {
			code: "UNSUPPORTED_BROWSER",
			recoverable: false,
			context: { method: requiredMethod },
		});
	}
	return mediaDevices;
}
