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

function createExecutor() {
	let state = idleState();
	const listeners = new Set();
	const camera = {
		async start(request = {}) {
			state = Object.freeze({
				...idleState(),
				status: "active",
				sessionId: "session-1",
				deviceId: request.deviceId ?? null,
				settings: Object.freeze({ width: 1280, height: 720 }),
			});
			for (const listener of listeners) listener({ type: "state-changed", state });
		},
		async switch() {},
		getState() {
			return state;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async dispose() {},
	};
	return new BrowserConformanceExecutor({
		camera,
		devices: {
			async list() {
				return [];
			},
			subscribe() {
				return () => undefined;
			},
			dispose() {},
		},
		permissions: {
			async query() {
				return { camera: "prompt", microphone: "unknown" };
			},
			async request() {
				return { camera: "granted", microphone: "unknown" };
			},
		},
		preview: { dispose() {} },
	});
}

async function withSecureContext(value, run) {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext");
	Object.defineProperty(globalThis, "isSecureContext", {
		configurable: true,
		value,
	});
	try {
		await run();
	} finally {
		if (descriptor) Object.defineProperty(globalThis, "isSecureContext", descriptor);
		else delete globalThis.isSecureContext;
	}
}

test("physical prerequisites block insecure or incomplete camera-role state", async () => {
	const executor = createExecutor();
	const start = getConformanceScenario("camera-start");
	const switchScenario = getConformanceScenario("camera-switch");

	await withSecureContext(false, async () => {
		assert.equal(executor.checkPrerequisite(start).status, "blocked");
	});

	await withSecureContext(true, async () => {
		assert.equal(executor.checkPrerequisite(start).status, "blocked");
		executor.setPrimaryDeviceId("primary");
		assert.equal(executor.checkPrerequisite(start).status, "ready");
		assert.equal(executor.checkPrerequisite(switchScenario).status, "blocked");
		executor.setAlternateDeviceId("alternate");
		assert.equal(executor.checkPrerequisite(switchScenario).status, "blocked");
		await executor.execute(start);
		assert.equal(executor.checkPrerequisite(switchScenario).status, "ready");
	});

	await executor.dispose();
});
