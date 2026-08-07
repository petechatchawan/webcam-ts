import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const playgroundRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function readPlaygroundFile(path) {
	return readFile(join(playgroundRoot, path), "utf8");
}

async function readRepositoryFile(path) {
	return readFile(join(repositoryRoot, path), "utf8");
}

test("playground package declares Playwright browser conformance scripts", async () => {
	const packageJson = JSON.parse(await readPlaygroundFile("package.json"));
	assert.equal(typeof packageJson.devDependencies?.["@playwright/test"], "string");
	assert.equal(packageJson.scripts?.["test:browser"], "playwright test");
	assert.equal(packageJson.scripts?.["test:browser:chromium"], "playwright test --project=chromium");
	assert.equal(packageJson.scripts?.["test:browser:firefox"], "playwright test --project=firefox");
	assert.equal(packageJson.scripts?.["test:browser:webkit"], "playwright test --project=webkit");
});

test("Playwright config exposes Chromium Firefox and WebKit as separate projects", async () => {
	const config = await readPlaygroundFile("playwright.config.ts");
	for (const project of ["chromium", "firefox", "webkit"]) {
		assert.match(config, new RegExp(`name:\\s*["']${project}["']`));
	}
	assert.match(config, /testDir:\s*["']\.\/browser-test["']/);
	assert.match(config, /fullyParallel:\s*false/);
	assert.match(config, /trace:\s*["']retain-on-failure["']/);
});

test("browser fixture imports only declared public Webcam-TS entrypoints", async () => {
	const fixture = await readPlaygroundFile("browser-test/fixture-page.ts");
	const spec = await readPlaygroundFile("browser-test/public-package.spec.ts");
	const source = `${fixture}\n${spec}`;

	assert.match(source, /from ["']webcam-ts["']/);
	for (const subpath of ["preview", "capture", "devices", "controls"]) {
		assert.match(source, new RegExp(`from ["']webcam-ts/${subpath}["']`));
	}
	assert.doesNotMatch(source, /packages\/webcam-ts\/src/);
	assert.doesNotMatch(source, /webcam-ts\/dist/);
});

test("browser CI retains per-engine evidence and verifies all required artifacts", async () => {
	const workflow = await readRepositoryFile(".github/workflows/browser-conformance.yml");
	assert.match(workflow, /BROWSER_EVIDENCE_PATH/);
	assert.match(workflow, /actions\/upload-artifact@v4/);
	assert.match(workflow, /browser-conformance-\$\{\{ matrix\.browser \}\}/);
	assert.match(workflow, /name:\s*aggregate/i);
	assert.match(workflow, /actions\/download-artifact@v4/);
	assert.match(workflow, /verify-browser-conformance-artifact\.mjs/);
	assert.match(workflow, /chromium[\s\S]*firefox[\s\S]*webkit/);
});
