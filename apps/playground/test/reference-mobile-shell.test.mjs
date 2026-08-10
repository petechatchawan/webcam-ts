import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(join(root, path), "utf8");

function section(source, start, end) {
	const from = source.indexOf(start);
	assert.ok(from >= 0, `missing start marker: ${start}`);
	const to = source.indexOf(end, from);
	assert.ok(to > from, `missing end marker: ${end}`);
	return source.slice(from, to);
}

test("mobile shell keeps permission inside the camera media card", async () => {
	const html = await read("index.html");
	const preview = section(html, 'id="preview-shell"', 'id="error-panel"');
	assert.match(preview, /id="permission-gate"/);
	assert.match(preview, /id="permission-gate-action"/);
	assert.match(preview, /id="preview-device-label"/);
	assert.match(preview, /id="preview-device-resolution"/);
});

test("sticky footer owns Start Capture and Stop exactly once", async () => {
	const html = await read("index.html");
	const footer = section(html, 'class="mobile-camera-footer"', '</footer>');
	for (const id of ["start-camera", "capture-photo", "stop-camera"]) {
		assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) ?? []).length, 1);
		assert.match(footer, new RegExp(`id=["']${id}["']`));
	}
	assert.doesNotMatch(footer, /id=["']switch-camera["']/);
	assert.doesNotMatch(html, /preview-session-controls/);
});

test("Switch is colocated with Camera device inside Session configuration", async () => {
	const html = await read("index.html");
	const settings = section(html, 'class="card settings-card"', '</article>');
	const device = settings.indexOf('id="device-select"');
	const switchButton = settings.indexOf('id="switch-camera"');
	assert.ok(device >= 0);
	assert.ok(switchButton > device);
	assert.equal((html.match(/id=["']switch-camera["']/g) ?? []).length, 1);
});

test("reference shell stylesheet defines media strip and safe-area sticky actions", async () => {
	const css = await read("src/reference-mobile-shell.css");
	assert.match(css, /\.camera-media-strip/);
	assert.match(css, /\.mobile-camera-footer[\s\S]*(?:position:\s*(?:fixed|sticky))/);
	assert.match(css, /env\(safe-area-inset-bottom\)/);
	assert.match(css, /\.mobile-camera-actions[\s\S]*grid-template-columns:\s*repeat\(3/);
});
