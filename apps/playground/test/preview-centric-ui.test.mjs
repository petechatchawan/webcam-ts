import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const playgroundRoot = fileURLToPath(new URL("../", import.meta.url));

async function readPlaygroundFile(path) {
	return readFile(join(playgroundRoot, path), "utf8");
}

function sectionBetween(source, startToken, endToken) {
	const start = source.indexOf(startToken);
	const end = source.indexOf(endToken, start + startToken.length);
	assert.ok(start >= 0, `missing start token: ${startToken}`);
	assert.ok(end > start, `missing end token: ${endToken}`);
	return source.slice(start, end);
}

test("normal playground keeps lifecycle state and controls inside the preview", async () => {
	const html = await readPlaygroundFile("index.html");
	const normal = sectionBetween(html, 'id="normal-playground-root"', 'id="conformance-root"');
	const preview = sectionBetween(normal, 'id="preview-shell"', 'id="error-panel"');

	assert.doesNotMatch(normal, /class="card camera-action-panel"/);
	for (const id of ["status-badge", "start-camera", "switch-camera", "stop-camera"]) {
		assert.equal((normal.match(new RegExp(`id=["']${id}["']`, "g")) ?? []).length, 1);
		assert.match(preview, new RegExp(`id=["']${id}["']`));
	}
});

test("mirror is preview-local and facing mode is removed from normal configuration", async () => {
	const html = await readPlaygroundFile("index.html");
	const normal = sectionBetween(html, 'id="normal-playground-root"', 'id="conformance-root"');
	const preview = sectionBetween(normal, 'id="preview-shell"', 'id="error-panel"');
	const settings = sectionBetween(normal, 'class="card settings-card"', 'class="sidebar-column"');

	assert.equal((normal.match(/id=["']mirror-toggle["']/g) ?? []).length, 1);
	assert.match(preview, /id=["']mirror-toggle["']/);
	assert.doesNotMatch(normal, /id=["']facing-select["']/);
	assert.match(settings, /id=["']audio-toggle["']/);
});

test("preview-centric controls have dedicated overlay styles and no sticky action card", async () => {
	const css = await readPlaygroundFile("src/styles.css");

	assert.match(css, /\.preview-status-overlay\s*\{/);
	assert.match(css, /\.preview-lifecycle-overlay\s*\{/);
	assert.match(css, /\.preview-mirror-control\s*\{/);
	assert.doesNotMatch(css, /\.camera-action-panel\s*\{/);
	assert.doesNotMatch(
		css,
		/@media\s*\(max-width:\s*720px\)[\s\S]*\.lifecycle-actions[\s\S]*position:\s*sticky/,
	);
});
