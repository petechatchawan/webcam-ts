import test from "node:test";
import assert from "node:assert/strict";

import { collectConformanceEnvironment } from "../dist-test/conformance/environment.js";
import {
	CONFORMANCE_SCENARIOS,
	getConformanceScenario,
} from "../dist-test/conformance/scenarios.js";

const REQUIRED_SCENARIO_IDS = [
	"runtime-secure-context",
	"permission-request",
	"device-enumeration",
	"camera-start",
	"exact-resolution-supported",
	"exact-resolution-unsupported",
	"ideal-resolution",
	"camera-switch",
	"rapid-switch",
	"stop-pending-start",
	"dispose-pending-switch",
	"track-ended",
	"external-disconnect-reconnect",
	"preview-integrity",
	"capture-jpeg",
	"capture-png",
	"capture-repeated",
	"control-zoom",
	"control-torch",
	"control-focus",
];

test("environment collector projects Tier-1 browser metadata without retaining the raw user agent", () => {
	const environment = collectConformanceEnvironment({
		navigatorLike: {
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",
		},
		secureContext: true,
		packageVersion: "4.0.0-alpha.1",
		gitSha: "abc123",
		hardwareClass: "integrated",
	});

	assert.deepEqual(environment.browser, { family: "Chromium", version: "151.0.7922.76" });
	assert.equal(environment.engine, "Blink");
	assert.deepEqual(environment.os, { family: "macOS", version: "15.6" });
	assert.equal(environment.formFactor, "desktop");
	assert.equal(environment.secureContext, true);
	assert.equal(environment.hardwareClass, "integrated");
	assert.equal("userAgent" in environment, false);
});

test("environment collector recognizes iOS Safari without exporting the source UA", () => {
	const environment = collectConformanceEnvironment({
		navigatorLike: {
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
		},
		secureContext: true,
		packageVersion: "4.0.0-alpha.1",
		gitSha: "def456",
		hardwareClass: "front",
	});

	assert.deepEqual(environment.browser, { family: "Safari", version: "19.0" });
	assert.equal(environment.engine, "WebKit");
	assert.deepEqual(environment.os, { family: "iOS", version: "19.0" });
	assert.equal(environment.formFactor, "mobile");
});

test("scenario catalog exposes every approved scenario exactly once", () => {
	const ids = CONFORMANCE_SCENARIOS.map((scenario) => scenario.id);
	assert.deepEqual(ids, REQUIRED_SCENARIO_IDS);
	assert.equal(new Set(ids).size, ids.length);
	for (const scenario of CONFORMANCE_SCENARIOS) {
		assert.equal(Array.isArray(scenario.prerequisites), true);
		assert.equal(typeof scenario.title, "string");
		assert.notEqual(scenario.title.length, 0);
	}
});

test("physical scenarios declare confirmation metadata and optional controls declare capability semantics", () => {
	assert.equal(
		getConformanceScenario("external-disconnect-reconnect").physicalConfirmation?.required,
		true,
	);
	assert.equal(getConformanceScenario("camera-switch").physicalConfirmation?.required, true);
	assert.equal(getConformanceScenario("preview-integrity").physicalConfirmation?.required, true);

	for (const id of ["control-zoom", "control-torch", "control-focus"]) {
		const scenario = getConformanceScenario(id);
		assert.equal(scenario.optionalCapability, id.replace("control-", ""));
		assert.equal(scenario.unsupportedStatus, "skipped");
	}
});
