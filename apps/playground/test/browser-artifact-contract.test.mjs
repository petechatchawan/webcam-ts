import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	verifyBrowserConformanceArtifacts,
} from "../../../scripts/verify-browser-conformance-artifact.mjs";

async function writeReport(directory, engine, overrides = {}) {
	const report = {
		config: {
			projects: [{ name: engine }],
		},
		errors: [],
		stats: {
			expected: 7,
			skipped: 0,
			unexpected: 0,
			flaky: 0,
		},
		...overrides,
	};
	await writeFile(
		join(directory, `browser-evidence-${engine}.json`),
		`${JSON.stringify(report)}\n`,
		"utf8",
	);
}

test("artifact verifier rejects a missing required engine report", async () => {
	const directory = await mkdtemp(join(tmpdir(), "webcam-ts-browser-evidence-"));
	await writeReport(directory, "chromium");
	await writeReport(directory, "firefox");

	await assert.rejects(
		() => verifyBrowserConformanceArtifacts(directory),
		/missing required browser evidence.*webkit/i,
	);
});

test("artifact verifier rejects a report with unexpected failures", async () => {
	const directory = await mkdtemp(join(tmpdir(), "webcam-ts-browser-evidence-"));
	for (const engine of ["chromium", "firefox", "webkit"]) await writeReport(directory, engine);
	await writeReport(directory, "firefox", {
		stats: { expected: 6, skipped: 0, unexpected: 1, flaky: 0 },
	});

	await assert.rejects(
		() => verifyBrowserConformanceArtifacts(directory),
		/firefox.*unexpected.*1/i,
	);
});

test("artifact verifier accepts complete successful Chromium Firefox and WebKit reports", async () => {
	const directory = await mkdtemp(join(tmpdir(), "webcam-ts-browser-evidence-"));
	for (const engine of ["chromium", "firefox", "webkit"]) await writeReport(directory, engine);

	const summary = await verifyBrowserConformanceArtifacts(directory);
	assert.deepEqual(summary.engines, ["chromium", "firefox", "webkit"]);
	assert.equal(summary.totalExpected, 21);
	assert.equal(summary.totalUnexpected, 0);
});
