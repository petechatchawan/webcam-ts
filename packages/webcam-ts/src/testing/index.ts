export * from "./fakes.js";
export { assertCommandAllowed } from "../session/lifecycle-machine.js";
export { CameraEventHub } from "../events/camera-event-hub.js";
export { OperationController, OperationLease } from "../session/operation-controller.js";
export { stopStream } from "../session/stream-cleanup.js";
export { BrowserMediaDevicesAdapter } from "../platform/browser-media-devices-adapter.js";
export { normalizeBrowserError } from "../platform/browser-error-normalizer.js";
