import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function readRepositoryFile(path) {
	return readFile(join(repositoryRoot, path), "utf8");
}

test("manual runbook defines canonical Pages conformance entry and evidence semantics", async () => {
	const runbook = await readRepositoryFile(
		"docs/superpowers/conformance/webcam-ts-v4-manual-runbook.md",
	);

	assert.match(runbook, /https:\/\/petechatchawan\.github\.io\/webcam-ts\/\?conformance=1/);
	assert.match(runbook, /PASS/);
	assert.match(runbook, /FAIL/);
	assert.match(runbook, /BLOCKED/);
	assert.match(runbook, /BLOCKED[^\n]*never[^\n]*PASS/i);
	assert.match(runbook, /<date>-<platform>-<browser>-<hardware>-<sha>\.json/);
	assert.match(runbook, /Playwright WebKit[^\n]*does not[^\n]*iOS Safari/i);
	assert.match(runbook, /external USB[^\n]*mandatory/i);
});

test("Tier-1 matrix keeps every approved physical release blocker explicit", async () => {
	const matrix = await readRepositoryFile(
		"docs/superpowers/conformance/webcam-ts-v4-tier1-matrix.md",
	);

	for (const requirement of [
		"macOS Chromium — integrated camera",
		"macOS Chromium — external USB camera",
		"macOS Firefox — integrated camera",
		"macOS Safari — integrated camera",
		"iOS Safari — front camera",
		"iOS Safari — rear camera",
		"Android Chrome — front camera",
		"Android Chrome — rear camera",
	]) {
		assert.match(matrix, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	}
	assert.match(matrix, /BLOCKED[^\n]*release blocker/i);
	assert.match(matrix, /P0[^\n]*0/);
	assert.match(matrix, /P1[^\n]*0/);
});

test("root README links the normal playground and dedicated conformance mode", async () => {
	const readme = await readRepositoryFile("README.md");
	assert.match(readme, /https:\/\/petechatchawan\.github\.io\/webcam-ts\//);
	assert.match(readme, /\?conformance=1/);
	assert.match(readme, /Real Browser & Device Conformance/i);
});
