import test from "node:test";
import assert from "node:assert/strict";

import { ConformanceController } from "../dist-test/conformance/conformance-controller.js";

function createEnvironment(hardwareClass = "unknown") {
	return Object.freeze({
		browser: Object.freeze({ family: "test", version: "1" }),
		engine: "test",
		os: Object.freeze({ family: "test", version: "1" }),
		formFactor: "desktop",
		secureContext: true,
		packageVersion: "4.0.0-alpha.1",
		gitSha: "test-sha",
		hardwareClass,
	});
}

function createController(overrides = {}) {
	let disposed = 0;
	const executor = {
		async execute(definition) {
			return {
				observations: [{ key: "scenario.status", value: "executed" }],
				assertions: [{ id: "executed", passed: true, message: `${definition.id} executed` }],
			};
		},
		dispose() {
			disposed += 1;
		},
		...overrides.executor,
	};

	let tick = 0;
	const controller = new ConformanceController({
		executor,
		environmentFactory: (hardwareClass) => createEnvironment(hardwareClass),
		prerequisiteChecker: () => ({ status: "ready" }),
		now: () => new Date(1_786_087_000_000 + tick++ * 1000),
		packageVersion: "4.0.0-alpha.1",
		gitSha: "test-sha",
		...overrides,
	});

	return { controller, getDisposeCount: () => disposed };
}

test("controller runs one scenario and retains an immutable completed result", async () => {
	const { controller } = createController();
	assert.equal(controller.getState().status, "idle");

	const result = await controller.run("camera-start");

	assert.equal(result?.status, "pass");
	assert.equal(result?.scenarioId, "camera-start");
	assert.equal(controller.getState().status, "complete");
	assert.equal(controller.getResults().length, 1);
	assert.equal(Object.isFrozen(controller.getResults()), true);
});

test("controller reset clears completed evidence and returns to idle", async () => {
	const { controller } = createController();
	await controller.run("camera-start");
	controller.reset();

	assert.equal(controller.getState().status, "idle");
	assert.deepEqual(controller.getResults(), []);
});

test("physical scenario waits for explicit confirmation before becoming complete", async () => {
	const { controller } = createController();
	controller.setHardwareClass("front");

	const pending = await controller.run("camera-switch");
	assert.equal(pending, null);
	assert.equal(controller.getState().status, "awaiting-confirmation");
	assert.equal(controller.getResults().length, 0);

	const result = controller.confirmPhysicalObservation(true);
	assert.equal(result.status, "pass");
	assert.equal(result.environment.hardwareClass, "front");
	assert.equal(result.assertions.at(-1)?.id, "physical-confirmation");
	assert.equal(result.assertions.at(-1)?.passed, true);
	assert.equal(controller.getState().status, "complete");
});

test("unmet prerequisite produces blocked evidence without executing camera work", async () => {
	let executeCalls = 0;
	const { controller } = createController({
		executor: {
			async execute() {
				executeCalls += 1;
				return { observations: [], assertions: [] };
			},
		},
		prerequisiteChecker: (definition) =>
			definition.id === "camera-start"
				? { status: "blocked", reason: "camera permission is not granted" }
				: { status: "ready" },
	});

	const result = await controller.run("camera-start");
	assert.equal(result?.status, "blocked");
	assert.equal(executeCalls, 0);
	assert.equal(result?.observations[0]?.value, "camera permission is not granted");
});

test("evidence snapshot contains current hardware class and sanitized completed results", async () => {
	const { controller } = createController();
	controller.setHardwareClass("external");
	await controller.run("camera-start");

	const document = controller.getEvidenceDocument("2026-08-07T06:45:00.000Z");
	assert.equal(document.environment.hardwareClass, "external");
	assert.equal(document.results.length, 1);
	assert.equal(document.schemaVersion, 1);
});

test("dispose is idempotent and releases executor resources once", async () => {
	const { controller, getDisposeCount } = createController();
	await controller.dispose();
	await controller.dispose();
	assert.equal(getDisposeCount(), 1);
});
