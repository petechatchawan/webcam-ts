import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const playgroundRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = join(playgroundRoot, "src");

async function readTypeScriptTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(await readTypeScriptTree(path));
    else if (entry.name.endsWith(".ts")) chunks.push(await readFile(path, "utf8"));
  }
  return chunks.join("\n");
}

async function readPlaygroundFile(path) {
  return readFile(join(playgroundRoot, path), "utf8");
}

test("playground source uses only public Webcam-TS entrypoints", async () => {
  const source = await readTypeScriptTree(sourceRoot);
  assert.doesNotMatch(source, /packages\/webcam-ts\/src|\/dist\/|CameraSession/);
  assert.doesNotMatch(source, /@angular|react|vue|rxjs|primeng/i);
  assert.match(source, /from "webcam-ts"/);
  assert.match(source, /from "webcam-ts\/preview"/);
  assert.match(source, /from "webcam-ts\/capture"/);
  assert.match(source, /from "webcam-ts\/devices"/);
  assert.match(source, /from "webcam-ts\/controls"/);
});

test("playground uses the approved neutral shadcn-inspired token system", async () => {
  const css = await readPlaygroundFile("src/styles.css");
  for (const token of [
    "--background",
    "--foreground",
    "--card",
    "--primary",
    "--secondary",
    "--muted",
    "--destructive",
    "--border",
    "--input",
    "--ring",
    "--radius",
  ]) {
    assert.match(css, new RegExp(token.replace("--", "\\-\\-")));
  }
  assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.doesNotMatch(css, /backdrop-filter|radial-gradient|#64d8ff|#00a8e8/i);
});

test("playground keeps required bindings and uses progressive diagnostics", async () => {
  const html = await readPlaygroundFile("index.html");
  for (const id of [
    "camera-preview",
    "preview-shell",
    "permission-gate",
    "permission-gate-action",
    "preview-requested-resolution",
    "preview-actual-resolution",
    "status-badge",
    "status-message",
    "device-select",
    "facing-select",
    "resolution-select",
    "resolution-mode-select",
    "mirror-toggle",
    "audio-toggle",
    "request-permission",
    "refresh-devices",
    "start-camera",
    "switch-camera",
    "stop-camera",
    "capture-photo",
    "controls-panel",
    "state-output",
    "devices-output",
    "event-list",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /<option value=["']exact["'] selected>Exact — fail if unavailable<\/option>/);
  assert.match(html, /<option value=["']ideal["']>Prefer closest — allow fallback<\/option>/);
  assert.match(html, /<details[^>]*class=["'][^"']*diagnostics-disclosure/);
  assert.match(html, /<summary[^>]*>[\s\S]*Diagnostics/i);
});

test("mobile-first preview preserves portrait and square frames without cropping", async () => {
  const css = await readPlaygroundFile("src/styles.css");
  assert.match(css, /\.preview-shell[\s\S]*aspect-ratio:\s*var\(--preview-aspect-ratio/);
  assert.match(css, /\.preview-shell video[\s\S]*object-fit:\s*contain/);
  assert.match(css, /padding-bottom:\s*max\([^;]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\s*\(min-width:\s*721px\)/);
});

test("lifecycle controls follow the preview and precede errors and settings", async () => {
  const html = await readPlaygroundFile("index.html");
  const preview = html.indexOf('id="preview-shell"');
  const actionPanel = html.indexOf('class="card camera-action-panel"');
  const errorPanel = html.indexOf('id="error-panel"');
  const settings = html.indexOf('class="card settings-card"');

  assert.ok(preview >= 0, "preview-shell must exist");
  assert.ok(actionPanel > preview, "camera-action-panel must follow the preview");
  assert.ok(errorPanel > actionPanel, "typed errors must follow the lifecycle controls");
  assert.ok(settings > errorPanel, "settings must follow preview actions and errors");

  const actionMarkup = html.slice(actionPanel, errorPanel);
  assert.match(actionMarkup, /id=["']start-camera["']/);
  assert.match(actionMarkup, /id=["']switch-camera["']/);
  assert.match(actionMarkup, /id=["']stop-camera["']/);
  assert.doesNotMatch(html.slice(settings), /id=["'](?:start|switch|stop)-camera["']/);
});

test("inactive preview is compact and lifecycle controls become a mobile sticky dock", async () => {
  const css = await readPlaygroundFile("src/styles.css");
  const renderer = await readPlaygroundFile("src/ui-renderer.ts");

  assert.match(css, /\.preview-shell\[data-active=["']false["']\][\s\S]*height:\s*clamp\(/);
  assert.match(css, /\.camera-action-panel[\s\S]*border/);
  assert.match(
    css,
    /@media\s*\(max-width:\s*720px\)[\s\S]*\.lifecycle-actions[\s\S]*position:\s*sticky/,
  );
  assert.match(renderer, /this\.previewShell\.dataset\.active\s*=\s*String\(hasActual\)/);
});
