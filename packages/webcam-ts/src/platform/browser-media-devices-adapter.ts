import type { MediaDevicesPort } from "./media-devices-port.js";
import { resolveMediaDevices } from "./browser-environment.js";
import { normalizeBrowserError } from "./browser-error-normalizer.js";

export class BrowserMediaDevicesAdapter implements MediaDevicesPort {
  async open(constraints: MediaStreamConstraints): Promise<MediaStream> {
    try {
      return await resolveMediaDevices("getUserMedia").getUserMedia(constraints);
    } catch (error) {
      throw normalizeBrowserError(error);
    }
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    try {
      return await resolveMediaDevices("enumerateDevices").enumerateDevices();
    } catch (error) {
      throw normalizeBrowserError(error);
    }
  }

  subscribeDeviceChange(listener: () => void): () => void {
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
