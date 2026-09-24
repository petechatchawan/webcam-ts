import type { MediaDevicesPort } from "../platform/media-devices-port.js";

// ponytail: browser MediaStreamTrack มี surface ใหญ่กว่า fake; cast รวมที่เดียว
// ถ้าอนาคตต้องใช้ method อื่นเพิ่ม ให้ขยาย FakeMediaStreamTrack แทนการกระจาย cast
function asTrack(track: FakeMediaStreamTrack): MediaStreamTrack {
	return track as unknown as MediaStreamTrack;
}

export class FakeMediaStreamTrack {
	stopCalls = 0;
	applyConstraintsCalls: MediaTrackConstraints[] = [];
	readyState: MediaStreamTrackState = "live";

	constructor(
		readonly label = "Fake Camera",
		private settings: MediaTrackSettings = { deviceId: "fake-camera", width: 1280, height: 720 },
		private capabilities: MediaTrackCapabilities = {},
	) {}

	public stop(): void {
		this.stopCalls += 1;
		this.readyState = "ended";
	}

	public getSettings(): MediaTrackSettings {
		return { ...this.settings };
	}

	public setSettings(settings: MediaTrackSettings): void {
		this.settings = { ...settings };
	}

	public getCapabilities(): MediaTrackCapabilities {
		return { ...this.capabilities };
	}

	public async applyConstraints(constraints: MediaTrackConstraints = {}): Promise<void> {
		this.applyConstraintsCalls.push(constraints);
	}
}

export class FakeMediaStream {
	constructor(readonly videoTrack = new FakeMediaStreamTrack()) {}

	public getTracks(): MediaStreamTrack[] {
		return [asTrack(this.videoTrack)];
	}

	public getVideoTracks(): MediaStreamTrack[] {
		return [asTrack(this.videoTrack)];
	}
}

type OpenResult = MediaStream | Error | (() => Promise<MediaStream>);

export class FakeMediaDevicesPort implements MediaDevicesPort {
	readonly openCalls: MediaStreamConstraints[] = [];
	enumerateCalls = 0;
	private readonly openResults: OpenResult[] = [];
	private devices: MediaDeviceInfo[] = [];
	private readonly deviceListeners = new Set<() => void>();

	public enqueueStream(
		stream: MediaStream = new FakeMediaStream() as unknown as MediaStream,
	): void {
		this.openResults.push(stream);
	}

	public enqueueError(error: Error): void {
		this.openResults.push(error);
	}

	public enqueueOpen(factory: () => Promise<MediaStream>): void {
		this.openResults.push(factory);
	}

	public setDevices(devices: MediaDeviceInfo[]): void {
		this.devices = [...devices];
	}

	public async open(constraints: MediaStreamConstraints): Promise<MediaStream> {
		this.openCalls.push(constraints);
		const result = this.openResults.shift();
		if (!result) return new FakeMediaStream() as unknown as MediaStream;
		if (result instanceof Error) throw result;
		if (typeof result === "function") return result();
		return result;
	}

	public async enumerateDevices(): Promise<MediaDeviceInfo[]> {
		this.enumerateCalls += 1;
		return [...this.devices];
	}

	public subscribeDeviceChange(listener: () => void): () => void {
		this.deviceListeners.add(listener);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			this.deviceListeners.delete(listener);
		};
	}

	public emitDeviceChange(): void {
		for (const listener of [...this.deviceListeners]) listener();
	}
}
