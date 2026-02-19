import test from "node:test";
import assert from "node:assert/strict";

import { Webcam, WebcamError, WebcamErrorCode } from "../dist/index.js";
import { Device } from "../dist/core/device.js";
import { Stream } from "../dist/core/stream.js";

function createDeferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createMockTrack() {
	return {
		stopCalls: 0,
		stop() {
			this.stopCalls += 1;
		},
		async applyConstraints() {},
		getSettings() {
			return {};
		},
		getCapabilities() {
			return {};
		},
	};
}

function createMockStream(track) {
	return {
		getTracks() {
			return [track];
		},
		getVideoTracks() {
			return [track];
		},
	};
}

function createCaptureService(overrides = {}) {
	return {
		clearInternalCache() {},
		dispose() {},
		async captureImageAsBase64() {
			return {};
		},
		captureImageData() {
			return {};
		},
		async captureImageBitmap() {
			return {};
		},
		...overrides,
	};
}

function createDeviceService(overrides = {}) {
	return {
		async getVideoDevices() {
			return [];
		},
		async getDeviceCapabilities() {
			return {};
		},
		async requestPermissions() {
			return { camera: "prompt", microphone: "prompt" };
		},
		async checkPermissions() {
			return { camera: "prompt", microphone: "prompt" };
		},
		...overrides,
	};
}

function createStreamService(overrides = {}) {
	return {
		getActiveStream() {
			return null;
		},
		async startStream() {
			throw new Error("startStream mock is required");
		},
		stopStream() {},
		getTrackSettings() {
			return null;
		},
		getCapabilities() {
			return null;
		},
		async applyConstraints() {},
		...overrides,
	};
}

function baseConfig(overrides = {}) {
	return {
		preferredResolutions: { label: "HD", width: 1280, height: 720 },
		...overrides,
	};
}

async function withMockNavigator(overrides, callback) {
	const originalDescriptors = new Map();

	for (const [key, value] of Object.entries(overrides)) {
		originalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis.navigator, key));
		Object.defineProperty(globalThis.navigator, key, {
			value,
			configurable: true,
		});
	}

	try {
		return await callback();
	} finally {
		for (const [key, descriptor] of originalDescriptors.entries()) {
			if (descriptor) {
				Object.defineProperty(globalThis.navigator, key, descriptor);
				continue;
			}
			delete globalThis.navigator[key];
		}
	}
}

test("start() stops existing stream before restart", async () => {
	let activeStream = null;
	let stopStreamCalls = 0;
	let startCalls = 0;
	let onStreamStopCalls = 0;

	const firstTrack = createMockTrack();
	const secondTrack = createMockTrack();
	const firstStream = createMockStream(firstTrack);
	const secondStream = createMockStream(secondTrack);

	const streamService = createStreamService({
		getActiveStream() {
			return activeStream;
		},
		async startStream() {
			startCalls += 1;
			if (startCalls === 1) {
				activeStream = firstStream;
				return { stream: firstStream, usedResolution: null };
			}
			activeStream = secondStream;
			return { stream: secondStream, usedResolution: null };
		},
		stopStream() {
			stopStreamCalls += 1;
			if (activeStream) {
				activeStream.getTracks().forEach((track) => track.stop());
				activeStream = null;
			}
		},
	});

	const webcam = new Webcam(
		baseConfig({
			onStreamStop() {
				onStreamStopCalls += 1;
			},
		}),
		{
			stream: streamService,
			device: createDeviceService(),
			capture: createCaptureService(),
		},
	);

	await webcam.start();
	await webcam.start();

	assert.equal(stopStreamCalls, 1);
	assert.equal(firstTrack.stopCalls, 1);
	assert.equal(onStreamStopCalls, 1);
	assert.equal(webcam.getState().status, "ready");
});

test("stop() cancels in-flight start and cleans stale stream", async () => {
	let activeStream = null;
	let onStreamStartCalls = 0;
	const deferred = createDeferred();

	const track = createMockTrack();
	const stream = createMockStream(track);

	const streamService = createStreamService({
		getActiveStream() {
			return activeStream;
		},
		async startStream() {
			const result = await deferred.promise;
			activeStream = result.stream;
			return result;
		},
		stopStream() {
			if (activeStream) {
				activeStream.getTracks().forEach((currentTrack) => currentTrack.stop());
				activeStream = null;
			}
		},
	});

	const webcam = new Webcam(
		baseConfig({
			onStreamStart() {
				onStreamStartCalls += 1;
			},
		}),
		{
			stream: streamService,
			device: createDeviceService(),
			capture: createCaptureService(),
		},
	);

	const startPromise = webcam.start();
	webcam.stop();

	deferred.resolve({ stream, usedResolution: null });
	await startPromise;

	assert.equal(track.stopCalls, 1);
	assert.equal(onStreamStartCalls, 0);
	assert.equal(webcam.getState().status, "idle");
	assert.equal(webcam.getState().activeStream, null);
});

test("requestPermissions() and checkPermissions() update permission state and callback", async () => {
	const permissionEvents = [];

	const webcam = new Webcam(
		baseConfig({
			onPermissionChange(permissions) {
				permissionEvents.push(permissions);
			},
		}),
		{
			stream: createStreamService(),
			capture: createCaptureService(),
			device: createDeviceService({
				async requestPermissions() {
					return { camera: "granted", microphone: "prompt" };
				},
				async checkPermissions() {
					return { camera: "denied", microphone: "prompt" };
				},
			}),
		},
	);

	const requestedPermissions = await webcam.requestPermissions({ video: true, audio: false });
	assert.deepEqual(requestedPermissions, { camera: "granted", microphone: "prompt" });
	assert.deepEqual(webcam.getState().permissions, { camera: "granted", microphone: "prompt" });

	const checkedPermissions = await webcam.checkPermissions();
	assert.deepEqual(checkedPermissions, { camera: "denied", microphone: "prompt" });
	assert.deepEqual(webcam.getState().permissions, { camera: "denied", microphone: "prompt" });

	assert.equal(permissionEvents.length, 2);
	assert.deepEqual(permissionEvents[0], { camera: "granted", microphone: "prompt" });
	assert.deepEqual(permissionEvents[1], { camera: "denied", microphone: "prompt" });
});

test("captureImage() is available as alias of captureImageAsBase64()", async () => {
	const videoElement = {
		srcObject: null,
		style: { transform: "" },
	};

	let captureCalls = 0;
	let captureVideoElement = null;
	const captureResult = {
		blob: new Blob(),
		url: "blob:test",
		base64: "data:image/png;base64,TEST",
		width: 1,
		height: 1,
		mimeType: "image/png",
		timestamp: Date.now(),
	};

	const webcam = new Webcam(
		baseConfig({
			videoElement,
		}),
		{
			stream: createStreamService(),
			device: createDeviceService(),
			capture: createCaptureService({
				async captureImageAsBase64(inputVideoElement) {
					captureCalls += 1;
					captureVideoElement = inputVideoElement;
					return captureResult;
				},
			}),
		},
	);

	const result = await webcam.captureImage();
	assert.deepEqual(result, captureResult);
	assert.equal(captureCalls, 1);
	assert.equal(captureVideoElement, videoElement);
});

test("dispose() releases capture resources", () => {
	let disposeCalls = 0;

	const webcam = new Webcam(baseConfig(), {
		stream: createStreamService(),
		device: createDeviceService(),
		capture: createCaptureService({
			dispose() {
				disposeCalls += 1;
			},
		}),
	});

	webcam.dispose();
	assert.equal(disposeCalls, 1);
});

test("getState() returns immutable permission snapshots", () => {
	const webcam = new Webcam(baseConfig(), {
		stream: createStreamService(),
		device: createDeviceService(),
		capture: createCaptureService(),
	});

	const state = webcam.getState();
	assert.throws(() => {
		state.permissions.camera = "denied";
	}, TypeError);
	assert.equal(webcam.getState().permissions.camera, "prompt");
});

test("start() keeps mirror state in sync with latest config", async () => {
	let activeStream = null;
	const track = createMockTrack();
	const stream = createMockStream(track);
	const videoElement = {
		srcObject: null,
		style: { transform: "" },
	};

	const streamService = createStreamService({
		getActiveStream() {
			return activeStream;
		},
		async startStream() {
			activeStream = stream;
			return { stream, usedResolution: null };
		},
		stopStream() {
			if (activeStream) {
				activeStream.getTracks().forEach((currentTrack) => currentTrack.stop());
				activeStream = null;
			}
		},
	});

	const webcam = new Webcam(
		baseConfig({
			enableMirror: true,
			videoElement,
		}),
		{
			stream: streamService,
			device: createDeviceService(),
			capture: createCaptureService(),
		},
	);

	await webcam.start();
	assert.equal(videoElement.style.transform, "scaleX(-1)");

	await webcam.start({
		enableMirror: false,
		videoElement,
	});
	assert.equal(videoElement.style.transform, "");
});

test("Device.requestPermissions() preserves WebcamError code from environment checks", async () => {
	const device = new Device();

	await withMockNavigator(
		{
			mediaDevices: undefined,
		},
		async () => {
			await assert.rejects(
				() => device.requestPermissions(),
				(error) =>
					error instanceof WebcamError && error.code === WebcamErrorCode.DEVICES_ERROR,
			);
		},
	);
});

test("Device.getDeviceCapabilities() uses cache to avoid duplicate getUserMedia calls", async () => {
	const device = new Device();
	let getUserMediaCalls = 0;

	const track = {
		stop() {},
		getCapabilities() {
			return {
				width: { min: 320, max: 1920 },
				height: { min: 240, max: 1080 },
				frameRate: { min: 15, max: 30 },
			};
		},
		getSettings() {
			return {
				width: 1920,
				height: 1080,
			};
		},
	};

	const testStream = {
		getVideoTracks() {
			return [track];
		},
		getTracks() {
			return [track];
		},
	};

	await withMockNavigator(
		{
			mediaDevices: {
				async enumerateDevices() {
					return [{ kind: "videoinput", deviceId: "cam-1", label: "Camera 1" }];
				},
				async getUserMedia() {
					getUserMediaCalls += 1;
					return testStream;
				},
			},
		},
		async () => {
			const first = await device.getDeviceCapabilities("cam-1");
			const second = await device.getDeviceCapabilities("cam-1");

			assert.equal(getUserMediaCalls, 1);
			assert.deepEqual(second, first);
		},
	);
});

test("Stream.startStream() preserves upstream WebcamError code", async () => {
	const stream = new Stream();

	await withMockNavigator(
		{
			mediaDevices: undefined,
		},
		async () => {
			await assert.rejects(
				() => stream.startStream(baseConfig()),
				(error) =>
					error instanceof WebcamError && error.code === WebcamErrorCode.STREAM_FAILED,
			);
		},
	);
});

test("Stream.applyConstraints() retries with advanced constraints on TypeError", async () => {
	const stream = new Stream();
	const applyCalls = [];
	let callCount = 0;

	const track = {
		async applyConstraints(constraints) {
			applyCalls.push(constraints);
			callCount += 1;
			if (callCount === 1) {
				throw new TypeError("Unsupported direct constraints format");
			}
		},
		getSettings() {
			return {};
		},
		getCapabilities() {
			return {};
		},
		stop() {},
	};

	stream.activeStream = {
		getVideoTracks() {
			return [track];
		},
		getTracks() {
			return [track];
		},
	};

	await stream.applyConstraints({ torch: true });

	assert.equal(applyCalls.length, 2);
	assert.deepEqual(applyCalls[0], { torch: true });
	assert.deepEqual(applyCalls[1], { advanced: [{ torch: true }] });
});
