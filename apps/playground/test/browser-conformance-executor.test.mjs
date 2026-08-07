import test from "node:test";
import assert from "node:assert/strict";

import { BrowserConformanceExecutor } from "../dist-test/conformance/browser-conformance-executor.js";
import { getConformanceScenario } from "../dist-test/conformance/scenarios.js";

function createFakes() {
	let cameraState = Object.freeze({ status: "idle", stream: null, settings: null, capabilities: null, lastError: null });
	const cameraListeners = new Set();
	const deviceListeners = new Set();
	const calls = {
		cameraDispose: 0,
		deviceDispose: 0,
		previewDispose: 0,
	};

	const camera = {
		async start() {},
		async switch() {},
		getState() {
			return cameraState;
		},
		subscribe(listener) {
			cameraListeners.add(listener);
			return () => cameraListeners.delete(listener);
		},
		async dispose() {
			calls.cameraDispose += 1;
			cameraState = Object.freeze({ ...cameraState, status: "disposed" });
		},
	};

	const devices = {
		async list() {
			return Object.freeze([
				Object.freeze({ kind: "videoinput", deviceId: "raw-primary-id", groupId: "raw-group-a", label: "" }),
				Object.freeze({ kind: "videoinput", deviceId: "raw-alternate-id", groupId: "raw-group-b", label: "" }),
			]);
		},
		subscribe(listener) {
			deviceListeners.add(listener);
			return () => deviceListeners.delete(listener);
		},
		dispose() {
			calls.deviceDispose += 1;
		},
	};

	const permissions = {
		async query() {
			return Object.freeze({ camera: "prompt", microphone: "unknown" });
		},
		async request() {
			return Object.freeze({ camera: "granted", microphone: "unknown" });
		},
	};

	const preview = {
		dispose() {
			calls.previewDispose += 1;
		},
	};

	return { camera, devices, permissions, preview, calls };
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
	executor.setPrimaryDeviceId("raw-primary-id");
	executor.setAlternateDeviceId("raw-alternate-id");

	const execution = await executor.execute(getConformanceScenario("runtime-secure-context"));
	const serialized = JSON.stringify(execution);

	assert.equal(serialized.includes("raw-primary-id"), false);
	assert.equal(serialized.includes("raw-alternate-id"), false);
	assert.equal(serialized.includes("raw-group"), false);

	await executor.dispose();
});
