import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const playgroundRoot = fileURLToPath(new URL("../", import.meta.url));

async function readPlaygroundFile(path) {
	return readFile(join(playgroundRoot, path), "utf8");
}

test("normal playground relocates existing lifecycle state and controls into the preview", async () => {
	const layout = await readPlaygroundFile("src/preview-centric-layout.ts");
	const main = await readPlaygroundFile("src/main.ts");

	assert.match(layout, /byId<HTMLElement>\("preview-shell"\)/);
	assert.match(layout, /byId<HTMLElement>\("status-badge"\)/);
	assert.match(layout, /document\.querySelector<HTMLElement>\("\.camera-action-panel"\)/);
	assert.match(layout, /statusBadge\.classList\.add\("preview-status-overlay"\)/);
	assert.match(layout, /actionPanel\.classList\.add\("preview-lifecycle-overlay"\)/);
	assert.match(layout, /previewShell\.append\(statusBadge, mirrorControl, actionPanel\)/);
	assert.match(main, /applyPreviewCentricLayout\(\)/);
});

test("normal playground relocates mirror and removes facing field after renderer binding", async () => {
	const layout = await readPlaygroundFile("src/preview-centric-layout.ts");
	const main = await readPlaygroundFile("src/main.ts");
	const bootstrap = main.slice(main.indexOf("export function bootstrapPlayground"), main.indexOf("export function bootstrapConformance"));

	assert.match(layout, /byId<HTMLInputElement>\("mirror-toggle"\)/);
	assert.match(layout, /mirrorControl\.classList\.add\("preview-mirror-control"\)/);
	assert.match(layout, /byId<HTMLSelectElement>\("facing-select"\)/);
	assert.match(layout, /facingField\.remove\(\)/);
	assert.ok(
		bootstrap.indexOf("new UiRenderer(controller)") < bootstrap.indexOf("applyPreviewCentricLayout()"),
		"UiRenderer must bind existing facing selection before presentation removes the redundant field",
	);
});

test("preview-centric controls have dedicated overlay styles and permission remains authoritative", async () => {
	const css = await readPlaygroundFile("src/preview-centric-layout.css");
	const baseCss = await readPlaygroundFile("src/styles.css");

	assert.match(css, /\.preview-status-overlay\s*\{/);
	assert.match(css, /\.preview-lifecycle-overlay\s*\{/);
	assert.match(css, /\.preview-mirror-control\s*\{/);
	assert.match(css, /\.preview-shell \.permission-gate[\s\S]*z-index:\s*10/);
	assert.match(css, /bottom:\s*max\(0\.75rem,\s*env\(safe-area-inset-bottom\)\)/);
	assert.doesNotMatch(css, /position:\s*sticky/);
	assert.match(baseCss, /\.preview-shell\[data-active="false"\][\s\S]*height:\s*clamp\(/);
});
