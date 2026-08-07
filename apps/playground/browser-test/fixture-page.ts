import {
	Camera,
	CameraError,
	type CameraEvent,
} from "webcam-ts";
import { VideoPreview } from "webcam-ts/preview";
import {
	CameraCapture,
	type FrameCaptureBackend,
} from "webcam-ts/capture";
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

interface LifecycleConformanceResult {
	readonly states: readonly string[];
	readonly operations: readonly string[];
	readonly trackStopCalls: number;
}

interface FailedSwitchConformanceResult {
	readonly errorCode: string;
	readonly status: string;
	readonly sameActiveStream: boolean;
	readonly originalTrackStopCalls: number;
}

interface PreviewConformanceResult {
	readonly boundDuringActive: boolean;
	readonly clearedAfterStop: boolean;
	readonly autoplay: boolean;
	readonly muted: boolean;
	readonly playsInline: boolean;
	readonly mirrorTransform: string;
	readonly trackStopCallsAfterPreviewDispose: number;
}

interface CaptureConformanceResult {
	readonly type: string;
	readonly width: number;
	readonly height: number;
	readonly blobSizeGreaterThanZero: boolean;
	readonly backendDisposeCalls: number;
	readonly trackStopCallsBeforeCameraStop: number;
}

interface NormalizedErrorEvidence {
	readonly code: string;
	readonly operation?: string;
	readonly browserErrorName?: unknown;
	readonly constraint?: unknown;
}

interface ErrorNormalizationConformanceResult {
	readonly permissionDenied: NormalizedErrorEvidence;
	readonly overconstrained: NormalizedErrorEvidence;
}

export interface BrowserFixtureApi {
	readonly loadedEntrypoints: readonly string[];
	readonly constructors: Readonly<Record<string, string>>;
	runCameraSmoke(): Promise<{
		readonly started: string;
		readonly stopped: string;
		readonly events: readonly string[];
	}>;
	runLifecycleConformance(): Promise<LifecycleConformanceResult>;
	runFailedSwitchConformance(): Promise<FailedSwitchConformanceResult>;
	runPreviewConformance(): Promise<PreviewConformanceResult>;
	runCaptureConformance(): Promise<CaptureConformanceResult>;
	runErrorNormalizationConformance(): Promise<ErrorNormalizationConformanceResult>;
}

declare global {
	interface Window {
		webcamTsBrowserFixture?: BrowserFixtureApi;
	}
}

const status = document.querySelector<HTMLOutputElement>("#fixture-status");

function createFakeCamera(
	track: FakeMediaStreamTrack,
	mediaDevices = new FakeMediaDevicesPort(),
): { camera: Camera; mediaDevices: FakeMediaDevicesPort; stream: FakeMediaStream } {
	const stream = new FakeMediaStream(track);
	mediaDevices.enqueueStream(stream as unknown as MediaStream);
	const camera = new Camera({
		mediaDevices,
		now: () => 1000,
		createSessionId: () => "browser-fixture-session",
	});
	return { camera, mediaDevices, stream };
}

function createNamedBrowserError(name: string, message: string, constraint?: string): Error {
	const error = new Error(message);
	Object.defineProperty(error, "name", { value: name, configurable: true });
	if (constraint) {
		Object.defineProperty(error, "constraint", { value: constraint, configurable: true });
	}
	return error;
}

function toNormalizedEvidence(error: unknown): NormalizedErrorEvidence {
	if (!(error instanceof CameraError)) {
		return { code: "NOT_CAMERA_ERROR" };
	}
	return Object.freeze({
		code: error.code,
		...(error.operation ? { operation: error.operation } : {}),
		...(error.context?.browserErrorName !== undefined
			? { browserErrorName: error.context.browserErrorName }
			: {}),
		...(error.context?.constraint !== undefined
			? { constraint: error.context.constraint }
			: {}),
	});
}

function installSyntheticVideoPort(video: HTMLVideoElement): {
	readStream(): MediaStream | null;
} {
	let assignedStream: MediaStream | null = null;
	Object.defineProperty(video, "srcObject", {
		configurable: true,
		get: () => assignedStream,
		set: (value: MediaProvider | null) => {
			assignedStream = value as MediaStream | null;
		},
	});
	Object.defineProperty(video, "play", {
		configurable: true,
		value: async () => undefined,
	});
	return { readStream: () => assignedStream };
}

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
		const track = new FakeMediaStreamTrack(
			"Synthetic browser fixture",
			{ width: 1280, height: 720, frameRate: 30 },
		);
		const { camera } = createFakeCamera(track);
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
	async runLifecycleConformance() {
		const track = new FakeMediaStreamTrack(
			"Lifecycle fixture",
			{ width: 1280, height: 720 },
		);
		const { camera } = createFakeCamera(track);
		const states: string[] = [];
		const operations: string[] = [];
		camera.subscribe((event: CameraEvent) => {
			if (event.type === "state-changed") states.push(event.state.status);
			if (event.type === "operation-started" || event.type === "operation-completed") {
				operations.push(`${event.type}:${event.operation}`);
			}
		});

		await camera.start();
		await camera.stop();
		const result = Object.freeze({
			states: Object.freeze([...states]),
			operations: Object.freeze([...operations]),
			trackStopCalls: track.stopCalls,
		});
		await camera.dispose();
		return result;
	},
	async runFailedSwitchConformance() {
		const originalTrack = new FakeMediaStreamTrack(
			"Original camera",
			{ width: 1280, height: 720 },
		);
		const mediaDevices = new FakeMediaDevicesPort();
		const originalStream = new FakeMediaStream(originalTrack);
		mediaDevices.enqueueStream(originalStream as unknown as MediaStream);
		mediaDevices.enqueueError(createNamedBrowserError("NotReadableError", "camera is busy"));
		const camera = new Camera({ mediaDevices });

		await camera.start();
		const committedStream = camera.getActiveStream();
		let errorCode = "NO_ERROR";
		try {
			await camera.switch({});
		} catch (error) {
			errorCode = error instanceof CameraError ? error.code : "NOT_CAMERA_ERROR";
		}
		const result = Object.freeze({
			errorCode,
			status: camera.getState().status,
			sameActiveStream: camera.getActiveStream() === committedStream,
			originalTrackStopCalls: originalTrack.stopCalls,
		});
		await camera.dispose();
		return result;
	},
	async runPreviewConformance() {
		const video = document.querySelector<HTMLVideoElement>("#fixture-video");
		if (!video) throw new Error("Missing fixture video element");
		const videoPort = installSyntheticVideoPort(video);
		const track = new FakeMediaStreamTrack("Preview fixture", { width: 720, height: 1280 });
		const { camera, stream } = createFakeCamera(track);
		const preview = new VideoPreview(camera, video);
		await preview.bind({ autoplay: true, muted: true, playsInline: true, mirror: true });
		await camera.start();
		await Promise.resolve();
		const boundDuringActive = videoPort.readStream() === (stream as unknown as MediaStream);
		const autoplay = video.autoplay;
		const muted = video.muted;
		const playsInline = video.playsInline;
		const mirrorTransform = video.style.transform;
		await camera.stop();
		await Promise.resolve();
		const clearedAfterStop = videoPort.readStream() === null;
		preview.dispose();
		await camera.dispose();

		const ownershipVideo = document.createElement("video");
		installSyntheticVideoPort(ownershipVideo);
		const ownershipTrack = new FakeMediaStreamTrack("Preview ownership fixture");
		const ownershipCameraFixture = createFakeCamera(ownershipTrack);
		const ownershipPreview = new VideoPreview(ownershipCameraFixture.camera, ownershipVideo);
		await ownershipPreview.bind({ autoplay: false });
		await ownershipCameraFixture.camera.start();
		ownershipPreview.dispose();
		const trackStopCallsAfterPreviewDispose = ownershipTrack.stopCalls;
		await ownershipCameraFixture.camera.dispose();

		return Object.freeze({
			boundDuringActive,
			clearedAfterStop,
			autoplay,
			muted,
			playsInline,
			mirrorTransform,
			trackStopCallsAfterPreviewDispose,
		});
	},
	async runCaptureConformance() {
		const track = new FakeMediaStreamTrack("Capture fixture", { width: 640, height: 480 });
		const { camera } = createFakeCamera(track);
		await camera.start();

		let backendDisposeCalls = 0;
		const backend: FrameCaptureBackend = {
			async toBlob(_stream, options = {}) {
				const type = options.type ?? "image/png";
				return Object.freeze({
					blob: new Blob(["synthetic-frame"], { type }),
					width: 640,
					height: 480,
					type,
					timestamp: 1000,
				});
			},
			async toImageData() {
				throw new Error("not used by this fixture");
			},
			async toImageBitmap() {
				throw new Error("not used by this fixture");
			},
			dispose() {
				backendDisposeCalls += 1;
			},
		};
		const capture = new CameraCapture(camera, { backend });
		const captured = await capture.toBlob({ type: "image/png" });
		const trackStopCallsBeforeCameraStop = track.stopCalls;
		capture.dispose();
		const result = Object.freeze({
			type: captured.type,
			width: captured.width,
			height: captured.height,
			blobSizeGreaterThanZero: captured.blob.size > 0,
			backendDisposeCalls,
			trackStopCallsBeforeCameraStop,
		});
		await camera.dispose();
		return result;
	},
	async runErrorNormalizationConformance() {
		async function captureStartError(error: Error): Promise<NormalizedErrorEvidence> {
			const mediaDevices = new FakeMediaDevicesPort();
			mediaDevices.enqueueError(error);
			const camera = new Camera({ mediaDevices });
			try {
				await camera.start();
				return { code: "NO_ERROR" };
			} catch (caught) {
				return toNormalizedEvidence(caught);
			} finally {
				await camera.dispose();
			}
		}

		const permissionDenied = await captureStartError(
			createNamedBrowserError("NotAllowedError", "permission denied"),
		);
		const overconstrained = await captureStartError(
			createNamedBrowserError("OverconstrainedError", "width cannot be satisfied", "width"),
		);
		return Object.freeze({ permissionDenied, overconstrained });
	},
});

if (status) status.value = "ready";
