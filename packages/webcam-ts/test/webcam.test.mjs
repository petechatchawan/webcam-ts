import test from "node:test";
import assert from "node:assert/strict";

import { Webcam } from "../dist/index.js";

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
