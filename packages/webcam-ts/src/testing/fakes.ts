import type { MediaDevicesPort } from "../platform/media-devices-port.js";

export class FakeMediaStreamTrack {
  stopCalls = 0;
  applyConstraintsCalls: MediaTrackConstraints[] = [];
  readyState: MediaStreamTrackState = "live";

  constructor(
    readonly label = "Fake Camera",
    private settings: MediaTrackSettings = { deviceId: "fake-camera", width: 1280, height: 720 },
    private capabilities: MediaTrackCapabilities = {},
  ) {}

  stop(): void {
    this.stopCalls += 1;
    this.readyState = "ended";
  }

  getSettings(): MediaTrackSettings {
    return { ...this.settings };
  }

  setSettings(settings: MediaTrackSettings): void {
    this.settings = { ...settings };
  }

  getCapabilities(): MediaTrackCapabilities {
    return { ...this.capabilities };
  }

  async applyConstraints(constraints: MediaTrackConstraints = {}): Promise<void> {
    this.applyConstraintsCalls.push(constraints);
  }
}

export class FakeMediaStream {
  constructor(readonly videoTrack = new FakeMediaStreamTrack()) {}

  getTracks(): MediaStreamTrack[] {
    return [this.videoTrack as unknown as MediaStreamTrack];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return [this.videoTrack as unknown as MediaStreamTrack];
  }
}

type OpenResult = MediaStream | Error | (() => Promise<MediaStream>);

export class FakeMediaDevicesPort implements MediaDevicesPort {
  readonly openCalls: MediaStreamConstraints[] = [];
  enumerateCalls = 0;
  private readonly openResults: OpenResult[] = [];
  private devices: MediaDeviceInfo[] = [];
  private readonly deviceListeners = new Set<() => void>();

  enqueueStream(stream: MediaStream = new FakeMediaStream() as unknown as MediaStream): void {
    this.openResults.push(stream);
  }

  enqueueError(error: Error): void {
    this.openResults.push(error);
  }

  enqueueOpen(factory: () => Promise<MediaStream>): void {
    this.openResults.push(factory);
  }

  setDevices(devices: MediaDeviceInfo[]): void {
    this.devices = [...devices];
  }

  async open(constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.openCalls.push(constraints);
    const result = this.openResults.shift();
    if (!result) return new FakeMediaStream() as unknown as MediaStream;
    if (result instanceof Error) throw result;
    if (typeof result === "function") return result();
    return result;
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    this.enumerateCalls += 1;
    return [...this.devices];
  }

  subscribeDeviceChange(listener: () => void): () => void {
    this.deviceListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.deviceListeners.delete(listener);
    };
  }

  emitDeviceChange(): void {
    for (const listener of [...this.deviceListeners]) listener();
  }
}
