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

test("normal playground defines preview-centric controls statically inside preview shell", async () => {
	const html = await readPlaygroundFile("index.html");
	const normal = sectionBetween(html, 'id="normal-playground-root"', 'id="conformance-root"');
	const preview = sectionBetween(normal, 'id="preview-shell"', 'id="error-panel"');

	for (const id of ["status-badge", "start-camera", "switch-camera", "stop-camera", "mirror-toggle"]) {
		assert.equal((normal.match(new RegExp(`id=["']${id}["']`, "g")) ?? []).length, 1);
		assert.match(preview, new RegExp(`id=["']${id}["']`));
	}
	assert.doesNotMatch(normal, /class="card camera-action-panel"/);
});

test("normal playground removes facing mode from both markup and renderer selection", async () => {
	const [html, renderer] = await Promise.all([
		readPlaygroundFile("index.html"),
		readPlaygroundFile("src/ui-renderer.ts"),
	]);
	const normal = sectionBetween(html, 'id="normal-playground-root"', 'id="conformance-root"');

	assert.doesNotMatch(normal, /id=["']facing-select["']/);
	assert.doesNotMatch(renderer, /facingSelect/);
	assert.doesNotMatch(renderer, /facing-select/);
	assert.match(renderer, /deviceId:\s*this\.deviceSelect\.value/);
});

test("preview-centric layout is source markup and CSS, not runtime DOM relocation", async () => {
	const [main, css] = await Promise.all([
		readPlaygroundFile("src/main.ts"),
		readPlaygroundFile("src/styles.css"),
	]);

	assert.doesNotMatch(main, /applyPreviewCentricLayout/);
	assert.doesNotMatch(main, /preview-centric-layout/);
	assert.match(css, /\.preview-status-overlay\s*\{/);
	assert.match(css, /\.preview-session-controls\s*\{/);
	assert.match(css, /\.preview-mirror-control\s*\{/);
	assert.doesNotMatch(css, /\.camera-action-panel\s*\{/);
});
