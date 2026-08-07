import { Camera, CameraError } from "webcam-ts";
import { VideoPreview } from "webcam-ts/preview";
import { CameraCapture } from "webcam-ts/capture";
import {
	CameraDeviceManager,
	CameraPermissionService,
} from "webcam-ts/devices";
import { CameraControls } from "webcam-ts/controls";
import {
	FakeMediaDevicesPort,
	FakeMediaStream,
	FakeMediaStreamTrack,
} from "webcam-ts/testing";

export interface BrowserFixtureApi {
	readonly loadedEntrypoints: readonly string[];
	readonly constructors: Readonly<Record<string, string>>;
	runCameraSmoke(): Promise<{
		readonly started: string;
		readonly stopped: string;
		readonly events: readonly string[];
	}>;
}

declare global {
	interface Window {
		webcamTsBrowserFixture?: BrowserFixtureApi;
	}
}

const status = document.querySelector<HTMLOutputElement>("#fixture-status");

window.webcamTsBrowserFixture = Object.freeze({
	loadedEntrypoints: Object.freeze([
		"webcam-ts",
		"webcam-ts/preview",
		"webcam-ts/capture",
		"webcam-ts/devices",
		"webcam-ts/controls",
		"webcam-ts/testing",
	]),
	constructors: Object.freeze({
		Camera: Camera.name,
		CameraError: CameraError.name,
		VideoPreview: VideoPreview.name,
		CameraCapture: CameraCapture.name,
		CameraDeviceManager: CameraDeviceManager.name,
		CameraPermissionService: CameraPermissionService.name,
		CameraControls: CameraControls.name,
	}),
	async runCameraSmoke() {
		const track = new FakeMediaStreamTrack({
			label: "Synthetic browser fixture",
			settings: { width: 1280, height: 720, frameRate: 30 },
		});
		const stream = new FakeMediaStream([track]);
		const mediaDevices = new FakeMediaDevicesPort();
		mediaDevices.enqueueStream(stream);
		const camera = new Camera({
			mediaDevices,
			now: () => 1000,
			createSessionId: () => "browser-fixture-session",
		});
		const events: string[] = [];
		camera.subscribe((event) => events.push(event.type));

		await camera.start();
		const started = camera.getState().status;
		await camera.stop();
		const stopped = camera.getState().status;
		await camera.dispose();
		return Object.freeze({
			started,
			stopped,
			events: Object.freeze([...events]),
		});
	},
});

if (status) status.value = "ready";
