import test from "node:test";
import assert from "node:assert/strict";

import { BrowserConformanceExecutor } from "../dist-test/conformance/browser-conformance-executor.js";
import { getConformanceScenario } from "../dist-test/conformance/scenarios.js";

function idleState() {
	return Object.freeze({
		status: "idle",
		sessionId: null,
		deviceId: null,
		trackLabel: null,
		settings: null,
		capabilities: null,
		startedAt: null,
		lastError: null,
	});
}

function activeState(deviceId) {
	return Object.freeze({
		status: "active",
		sessionId: "session-1",
		deviceId,
		trackLabel: "runtime camera label",
		settings: Object.freeze({ deviceId, width: 1280, height: 720, facingMode: "environment" }),
		capabilities: Object.freeze({}),
		startedAt: 1,
		lastError: null,
	});
}

function createFakes() {
	let cameraState = idleState();
	let nextSwitchError = null;
	const cameraListeners = new Set();
	const deviceListeners = new Set();
	const calls = {
		cameraDispose: 0,
		deviceDispose: 0,
		previewDispose: 0,
		permissionRequests: 0,
		startRequests: [],
		switchRequests: [],
	};

	function emitCamera(event) {
		for (const listener of [...cameraListeners]) listener(event);
	}

	const camera = {
		async start(request = {}) {
			calls.startRequests.push(request);
			cameraState = activeState(request.deviceId ?? "automatic");
			emitCamera({ type: "state-changed", state: cameraState });
		},
		async switch(request) {
			calls.switchRequests.push(request);
			if (nextSwitchError) {
				const error = nextSwitchError;
				nextSwitchError = null;
				throw error;
			}
			cameraState = activeState(request.deviceId);
			emitCamera({ type: "state-changed", state: cameraState });
		},
		getState() {
			return cameraState;
		},
		subscribe(listener) {
			cameraListeners.add(listener);
			return () => cameraListeners.delete(listener);
		},
		async dispose() {
			calls.cameraDispose += 1;
			cameraState = Object.freeze({ ...idleState(), status: "disposed" });
		},
		failNextSwitch(error) {
			nextSwitchError = error;
		},
		emitSessionEnded() {
			const error = Object.assign(new Error("Camera track ended"), {
				code: "TRACK_ENDED",
				operation: "session",
				recoverable: true,
			});
			cameraState = idleState();
			emitCamera({ type: "session-ended", error });
			emitCamera({ type: "state-changed", state: cameraState });
		},
	};

	const deviceList = Object.freeze([
		Object.freeze({ deviceId: "raw-primary-id", groupId: "raw-group-a", label: null }),
		Object.freeze({ deviceId: "raw-alternate-id", groupId: "raw-group-b", label: null }),
	]);

	const devices = {
		async list() {
			return deviceList;
		},
		subscribe(listener) {
			deviceListeners.add(listener);
			return () => deviceListeners.delete(listener);
		},
		dispose() {
			calls.deviceDispose += 1;
		},
		emitDeviceChange() {
			for (const listener of [...deviceListeners]) listener(deviceList);
		},
	};

	let permissionState = Object.freeze({ camera: "prompt", microphone: "unknown" });
	const permissions = {
		async query() {
			return permissionState;
		},
		async request() {
			calls.permissionRequests += 1;
			permissionState = Object.freeze({ camera: "granted", microphone: "unknown" });
			return permissionState;
		},
	};

	const preview = {
		dispose() {
			calls.previewDispose += 1;
		},
	};

	return { camera, devices, permissions, preview, calls };
}

function selectTwoCameras(executor) {
	executor.setPrimaryDeviceId("raw-primary-id");
	executor.setAlternateDeviceId("raw-alternate-id");
}

function serializedContainsRawIdentity(value) {
	const serialized = JSON.stringify(value);
	return ["raw-primary-id", "raw-alternate-id", "raw-group", "runtime camera label"].some((secret) =>
		serialized.includes(secret),
	);
}

test("browser conformance executor exposes neutral runtime device options", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);

	const options = await executor.refreshDeviceOptions();

	assert.deepEqual(
		options.map((option) => option.label),
		["Camera 1", "Camera 2"],
	);
	assert.deepEqual(
		options.map((option) => option.id),
		["raw-primary-id", "raw-alternate-id"],
	);

	await executor.dispose();
});

test("browser conformance executor disposal is idempotent", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);

	await executor.dispose();
	await executor.dispose();

	assert.equal(fakes.calls.cameraDispose, 1);
	assert.equal(fakes.calls.deviceDispose, 1);
	assert.equal(fakes.calls.previewDispose, 1);
});

test("browser conformance execution never exposes runtime device identity", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	selectTwoCameras(executor);

	const execution = await executor.execute(getConformanceScenario("runtime-secure-context"));
	assert.equal(serializedContainsRawIdentity(execution), false);

	await executor.dispose();
});

test("permission and device enumeration scenarios execute through browser ports", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);

	const before = await executor.execute(getConformanceScenario("device-enumeration-before-permission"));
	const permission = await executor.execute(getConformanceScenario("permission-request"));
	const after = await executor.execute(getConformanceScenario("device-enumeration-after-permission"));

	assert.equal(before.assertions[0]?.passed, true);
	assert.equal(permission.assertions[0]?.passed, true);
	assert.equal(after.assertions[0]?.passed, true);
	assert.equal(fakes.calls.permissionRequests, 1);
	assert.equal(serializedContainsRawIdentity([before, permission, after]), false);

	await executor.dispose();
});

test("camera start and switch use primary then alternate then primary without manual pre-stop", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	selectTwoCameras(executor);

	const started = await executor.execute(getConformanceScenario("camera-start"));
	const firstSwitch = await executor.execute(getConformanceScenario("camera-switch"));
	const secondSwitch = await executor.execute(getConformanceScenario("camera-switch"));

	assert.deepEqual(fakes.calls.startRequests, [{ deviceId: "raw-primary-id" }]);
	assert.deepEqual(fakes.calls.switchRequests, [
		{ deviceId: "raw-alternate-id" },
		{ deviceId: "raw-primary-id" },
	]);
	assert.equal(started.assertions.every((assertion) => assertion.passed), true);
	assert.equal(firstSwitch.observations.some((observation) => observation.value === "primary-to-alternate"), true);
	assert.equal(secondSwitch.observations.some((observation) => observation.value === "alternate-to-primary"), true);
	assert.equal(serializedContainsRawIdentity([started, firstSwitch, secondSwitch]), false);

	await executor.dispose();
});

test("failed candidate-first switch retains typed evidence without fabricating success", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	selectTwoCameras(executor);
	await executor.execute(getConformanceScenario("camera-start"));
	fakes.camera.failNextSwitch(
		Object.assign(new Error("Camera is busy"), {
			code: "DEVICE_BUSY",
			operation: "switch",
			recoverable: true,
		}),
	);

	const failed = await executor.execute(getConformanceScenario("camera-switch"));

	assert.equal(failed.assertions.every((assertion) => assertion.passed), false);
	assert.equal(failed.error?.code, "DEVICE_BUSY");
	assert.equal(fakes.camera.getState().status, "active");
	assert.equal(serializedContainsRawIdentity(failed), false);

	await executor.dispose();
});

test("rapid switch uses public switch path and returns to primary", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	selectTwoCameras(executor);
	await executor.execute(getConformanceScenario("camera-start"));

	const result = await executor.execute(getConformanceScenario("rapid-switch"));

	assert.deepEqual(fakes.calls.switchRequests, [
		{ deviceId: "raw-alternate-id" },
		{ deviceId: "raw-primary-id" },
	]);
	assert.equal(result.assertions.every((assertion) => assertion.passed), true);
	assert.equal(serializedContainsRawIdentity(result), false);

	await executor.dispose();
});

test("devicechange is advisory and never opens or switches a camera", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	fakes.devices.emitDeviceChange();

	const result = await executor.execute(getConformanceScenario("devicechange-advisory"));

	assert.equal(result.assertions[0]?.passed, true);
	assert.deepEqual(fakes.calls.startRequests, []);
	assert.deepEqual(fakes.calls.switchRequests, []);

	await executor.dispose();
});

test("session-ended is the authority for track-ended and external disconnect evidence", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	selectTwoCameras(executor);
	await executor.execute(getConformanceScenario("camera-start"));
	fakes.camera.emitSessionEnded();

	const ended = await executor.execute(getConformanceScenario("track-ended"));
	const disconnected = await executor.execute(getConformanceScenario("external-disconnect"));

	assert.equal(ended.assertions.find((assertion) => assertion.id === "session-ended")?.passed, true);
	assert.equal(disconnected.assertions.find((assertion) => assertion.id === "session-ended")?.passed, true);
	assert.equal(fakes.camera.getState().status, "idle");
	assert.equal(serializedContainsRawIdentity([ended, disconnected]), false);

	await executor.dispose();
});

test("reconnect stays idle until explicit restart scenario runs", async () => {
	const fakes = createFakes();
	const executor = new BrowserConformanceExecutor(fakes);
	selectTwoCameras(executor);
	await executor.execute(getConformanceScenario("camera-start"));
	fakes.camera.emitSessionEnded();
	fakes.devices.emitDeviceChange();
	assert.equal(fakes.camera.getState().status, "idle");
	assert.equal(fakes.calls.startRequests.length, 1);

	const restarted = await executor.execute(
		getConformanceScenario("external-reconnect-explicit-restart"),
	);

	assert.equal(fakes.calls.startRequests.length, 2);
	assert.deepEqual(fakes.calls.startRequests[1], { deviceId: "raw-primary-id" });
	assert.equal(restarted.assertions.every((assertion) => assertion.passed), true);
	assert.equal(serializedContainsRawIdentity(restarted), false);

	await executor.dispose();
});
