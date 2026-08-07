import test from "node:test";
import assert from "node:assert/strict";

import {
	sanitizeCameraError,
	sanitizeEvidenceValue,
	sanitizePageUrl,
} from "../dist-test/conformance/privacy-sanitizer.js";
import {
	createEvidenceDocument,
	exportEvidenceJson,
} from "../dist-test/conformance/evidence-exporter.js";

const environment = Object.freeze({
	browser: Object.freeze({ family: "Chromium", version: "151.0.0.0" }),
	engine: "Blink",
	os: Object.freeze({ family: "macOS", version: "15" }),
	formFactor: "desktop",
	secureContext: true,
	packageVersion: "4.0.0-alpha.1",
	gitSha: "abc123",
	hardwareClass: "external",
});

test("privacy sanitizer keeps only approved camera evidence fields", () => {
	const sanitized = sanitizeEvidenceValue({
		width: 1920,
		height: 1080,
		frameRate: 30,
		facingMode: "environment",
		torch: true,
		zoom: { min: 1, max: 4, step: 0.1 },
		deviceId: "raw-device-secret",
		groupId: "raw-group-secret",
		label: "Logitech Serial 123",
		unknownPrivateField: "must-not-survive",
	});

	assert.deepEqual(sanitized, {
		width: 1920,
		height: 1080,
		frameRate: 30,
		facingMode: "environment",
		torch: true,
		zoom: { min: 1, max: 4, step: 0.1 },
	});
});

test("camera error sanitizer never serializes arbitrary causes or device identity", () => {
	const cause = Object.assign(new Error("native failure with secret-device"), {
		deviceId: "raw-device-secret",
		groupId: "raw-group-secret",
	});
	const error = Object.assign(new Error("Exact resolution failed"), {
		code: "CONSTRAINT_UNSATISFIED",
		operation: "start",
		recoverable: true,
		cause,
		context: {
			browserErrorName: "OverconstrainedError",
			constraint: "width",
			deviceId: "raw-device-secret",
			label: "Private Camera Label",
		},
	});

	assert.deepEqual(sanitizeCameraError(error), {
		code: "CONSTRAINT_UNSATISFIED",
		message: "Exact resolution failed",
		operation: "start",
		recoverable: true,
		context: {
			browserErrorName: "OverconstrainedError",
			constraint: "width",
		},
	});
});

test("page URL sanitizer drops query strings and fragments", () => {
	assert.equal(
		sanitizePageUrl("https://petechatchawan.github.io/webcam-ts/?token=secret#private"),
		"https://petechatchawan.github.io/webcam-ts/",
	);
});

test("evidence export is deterministic and strips forbidden values from observations", () => {
	const document = createEvidenceDocument({
		schemaVersion: 1,
		generatedAt: "2026-08-07T06:35:00.000Z",
		packageVersion: "4.0.0-alpha.1",
		gitSha: "abc123",
		environment,
		results: [
			{
				scenarioId: "camera-start",
				status: "pass",
				startedAt: "2026-08-07T06:34:59.000Z",
				completedAt: "2026-08-07T06:35:00.000Z",
				environment,
				observations: [
					{
						key: "track.settings",
						value: {
							width: 1280,
							height: 720,
							deviceId: "raw-device-secret",
							groupId: "raw-group-secret",
							label: "Private Camera Label",
						},
					},
				],
				assertions: [
					{ id: "active", passed: true, expected: "active", actual: "active", message: "camera is active" },
				],
			},
		],
	});

	const first = exportEvidenceJson(document);
	const second = exportEvidenceJson(document);
	assert.equal(first, second);
	assert.equal(first.includes("raw-device-secret"), false);
	assert.equal(first.includes("raw-group-secret"), false);
	assert.equal(first.includes("Private Camera Label"), false);
	assert.match(first, /"width": 1280/);
	assert.match(first, /"height": 720/);
});
