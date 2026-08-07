import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const playgroundRoot = fileURLToPath(new URL("../", import.meta.url));

async function readPlaygroundFile(path) {
	return readFile(join(playgroundRoot, path), "utf8");
}

function occurrences(source, pattern) {
	return source.match(pattern)?.length ?? 0;
}

test("conformance mode exposes the approved physical evidence controls", async () => {
	const html = await readPlaygroundFile("index.html");
	for (const id of [
		"normal-playground-root",
		"conformance-root",
		"conformance-hardware-class",
		"conformance-scenario-select",
		"conformance-run",
		"conformance-status",
		"conformance-confirmation",
		"conformance-confirm-pass",
		"conformance-confirm-fail",
		"conformance-export",
	]) {
		assert.match(html, new RegExp(`id=["']${id}["']`));
	}

	assert.match(html, /id=["']conformance-root["'][^>]*hidden/);
	assert.match(html, /option value=["']integrated["']/);
	assert.match(html, /option value=["']external["']/);
	assert.match(html, /option value=["']front["']/);
	assert.match(html, /option value=["']rear["']/);
});

test("normal playground keeps one lifecycle surface and conformance does not duplicate camera controls", async () => {
	const html = await readPlaygroundFile("index.html");
	for (const id of ["camera-preview", "start-camera", "switch-camera", "stop-camera", "capture-photo"]) {
		assert.equal(
			occurrences(html, new RegExp(`id=["']${id}["']`, "g")),
			1,
			`${id} must remain unique`,
		);
	}

	const conformanceStart = html.indexOf('id="conformance-root"');
	assert.ok(conformanceStart >= 0, "conformance-root must exist");
	const conformanceMarkup = html.slice(conformanceStart);
	assert.doesNotMatch(conformanceMarkup, /id=["'](?:start|switch|stop)-camera["']/);
});

test("main entrypoint selects exactly one mode from the conformance query parameter", async () => {
	const main = await readPlaygroundFile("src/main.ts");
	assert.match(main, /URLSearchParams\(window\.location\.search\)/);
	assert.match(main, /get\(["']conformance["']\)\s*===\s*["']1["']/);
	assert.match(main, /bootstrapConformance/);
	assert.match(main, /bootstrapPlayground/);
	assert.match(main, /normal-playground-root/);
	assert.match(main, /conformance-root/);
});

test("conformance renderer owns conformance bindings without extending the normal UiRenderer", async () => {
	const renderer = await readPlaygroundFile("src/conformance/conformance-renderer.ts");
	const normalRenderer = await readPlaygroundFile("src/ui-renderer.ts");

	assert.match(renderer, /class ConformanceRenderer/);
	assert.match(renderer, /conformance-scenario-select/);
	assert.match(renderer, /conformance-run/);
	assert.match(renderer, /conformance-confirm-pass/);
	assert.match(renderer, /conformance-confirm-fail/);
	assert.match(renderer, /conformance-export/);
	assert.doesNotMatch(normalRenderer, /conformance-(?:scenario|run|confirmation|export)/);
});

test("conformance layout keeps the existing light mobile-first design language", async () => {
	const css = await readPlaygroundFile("src/styles.css");
	assert.match(css, /\.conformance-shell/);
	assert.match(css, /\.conformance-actions/);
	assert.match(css, /\.conformance-result/);
	assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*\.conformance-actions/);
	assert.doesNotMatch(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
});
