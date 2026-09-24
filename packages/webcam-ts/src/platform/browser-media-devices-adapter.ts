import type { MediaDevicesPort } from "./media-devices-port.js";
import { resolveMediaDevices } from "./browser-environment.js";
import { normalizeBrowserError } from "./browser-error-normalizer.js";

async function invokeMediaDevices<T>(
	requiredMethod: "getUserMedia" | "enumerateDevices",
	call: (mediaDevices: MediaDevices) => Promise<T>,
): Promise<T> {
	try {
		return await call(resolveMediaDevices(requiredMethod));
	} catch (error) {
		throw normalizeBrowserError(error);
	}
}

export class BrowserMediaDevicesAdapter implements MediaDevicesPort {
	public async open(constraints: MediaStreamConstraints): Promise<MediaStream> {
		return invokeMediaDevices("getUserMedia", (mediaDevices) =>
			mediaDevices.getUserMedia(constraints),
		);
	}

	public async enumerateDevices(): Promise<MediaDeviceInfo[]> {
		return invokeMediaDevices("enumerateDevices", (mediaDevices) =>
			mediaDevices.enumerateDevices(),
		);
	}

	public subscribeDeviceChange(listener: () => void): () => void {
		const mediaDevices = resolveMediaDevices();
		mediaDevices.addEventListener("devicechange", listener);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			mediaDevices.removeEventListener("devicechange", listener);
		};
	}
}
