import { CameraError } from "../domain/camera-error.js";

export function resolveMediaDevices(requiredMethod?: "getUserMedia" | "enumerateDevices"): MediaDevices {
  const navigatorValue = globalThis.navigator;
  if (!navigatorValue || !navigatorValue.mediaDevices) {
    throw new CameraError("Camera APIs require a browser runtime", {
      code: "UNSUPPORTED_RUNTIME",
      recoverable: false,
    });
  }

  const mediaDevices = navigatorValue.mediaDevices;
  if (requiredMethod && typeof mediaDevices[requiredMethod] !== "function") {
    throw new CameraError(`MediaDevices.${requiredMethod} is not supported`, {
      code: "UNSUPPORTED_BROWSER",
      recoverable: false,
      context: { method: requiredMethod },
    });
  }
  return mediaDevices;
}
