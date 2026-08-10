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
  assert.doesNotMatch(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(css, /color-scheme:\s*light/);
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
    "device-select",
    "resolution-select",
    "resolution-mode-select",
    "mirror-toggle",
    "audio-toggle",
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
  assert.doesNotMatch(html, /id=["']facing-select["']/);
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

test("page chrome does not cover scrolled camera content", async () => {
  const css = await readPlaygroundFile("src/styles.css");
  const header = css.match(/\.app-header\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.doesNotMatch(header, /position:\s*sticky/);
});

test("capture result stays out of the center shutter lane", async () => {
  const css = await readPlaygroundFile("src/styles.css");
  const pool = css.match(/\.capture-pool\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const metadata = css.match(/\.capture-metadata\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const resolutionOverlay =
    css.match(/\.preview-resolution-overlay\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(pool, /width:\s*min\(35%,\s*16rem\)/);
  assert.match(pool, /justify-items:\s*end/);
  assert.match(metadata, /max-width:\s*100%/);
  assert.match(metadata, /white-space:\s*normal/);
  assert.doesNotMatch(resolutionOverlay, /bottom:/);
  assert.match(resolutionOverlay, /top:\s*0\.5rem/);
  assert.match(resolutionOverlay, /right:\s*0\.5rem/);
});

test("resolution overlay is a two-line white debug block pinned to the video top-right", async () => {
  const css = await readPlaygroundFile("src/styles.css");
  const overlay =
    css.match(/\.preview-resolution-overlay\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const line = css.match(/\.resolution-line\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.doesNotMatch(overlay, /background:/);
  assert.doesNotMatch(overlay, /border:/);
  assert.match(line, /color:\s*#ffffff/);
  assert.doesNotMatch(line, /background:/);
  assert.doesNotMatch(line, /border:/);
});

test("lifecycle controls are statically defined inside the preview before errors and settings", async () => {
  const html = await readPlaygroundFile("index.html");
  const previewStart = html.indexOf('id="preview-shell"');
  const previewEnd = html.indexOf('id="error-panel"');
  const settings = html.indexOf('class="card settings-card"');

  assert.ok(previewStart >= 0, "preview-shell must exist");
  assert.ok(previewEnd > previewStart, "typed errors must follow the preview");
  assert.ok(settings > previewEnd, "settings must follow preview and errors");

  const previewMarkup = html.slice(previewStart, previewEnd);
  assert.match(previewMarkup, /id=["']start-camera["']/);
  assert.match(previewMarkup, /id=["']switch-camera["']/);
  assert.match(previewMarkup, /id=["']stop-camera["']/);
  assert.doesNotMatch(html, /class="card camera-action-panel"/);
  assert.doesNotMatch(html.slice(settings), /id=["'](?:start|switch|stop)-camera["']/);
});

test("inactive preview stays compact while lifecycle controls use a preview overlay", async () => {
  const [css, overlayCss, renderer] = await Promise.all([
    readPlaygroundFile("src/styles.css"),
    readPlaygroundFile("src/preview-centric-ui.css"),
    readPlaygroundFile("src/ui-renderer.ts"),
  ]);

  assert.match(css, /\.preview-shell\[data-active=["']false["']\][\s\S]*height:\s*clamp\(/);
  assert.match(overlayCss, /\.preview-session-controls\s*\{[\s\S]*position:\s*absolute/);
  assert.doesNotMatch(overlayCss, /position:\s*sticky/);
  assert.match(renderer, /this\.previewShell\.dataset\.active\s*=\s*String\(hasActual\)/);
});

test("physical conformance mode has one lean preview and two runtime-only camera roles", async () => {
  const html = await readPlaygroundFile("index.html");
  for (const id of [
    "conformance-preview",
    "conformance-primary-device",
    "conformance-alternate-device",
  ]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) ?? []).length, 1);
  }

  const conformanceMarkup = html.slice(html.indexOf('id="conformance-root"'));
  assert.doesNotMatch(conformanceMarkup, /id=["'](?:start|switch|stop)-camera["']/);
});

test("conformance renderer binds runtime camera roles without reusing the normal camera controller", async () => {
  const renderer = await readPlaygroundFile("src/conformance/conformance-renderer.ts");

  assert.match(renderer, /ConformanceDeviceRuntime/);
  assert.match(renderer, /conformance-primary-device/);
  assert.match(renderer, /conformance-alternate-device/);
  assert.match(renderer, /refreshDeviceOptions\(/);
  assert.match(renderer, /setPrimaryDeviceId\(/);
  assert.match(renderer, /setAlternateDeviceId\(/);
  assert.doesNotMatch(renderer, /CameraController|createBrowserCameraController/);
});

test("conformance preview stays light-theme lean and never crops physical evidence", async () => {
  const css = await readPlaygroundFile("src/conformance/conformance.css");

  assert.match(css, /\.conformance-preview-shell[\s\S]*var\(--border\)/);
  assert.match(css, /\.conformance-preview-shell\s+video[\s\S]*object-fit:\s*contain/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark|backdrop-filter|radial-gradient/i);
});

test("conformance bootstrap wires one real browser executor without reusing normal controller state", async () => {
  const main = await readPlaygroundFile("src/main.ts");
  const conformanceBootstrap = main.slice(main.indexOf("export function bootstrapConformance"));

  assert.match(main, /BrowserConformanceExecutor/);
  assert.match(main, /new Camera\(\)/);
  assert.match(main, /new VideoPreview\(video/);
  assert.match(conformanceBootstrap, /conformance-preview/);
  assert.match(conformanceBootstrap, /new BrowserConformanceExecutor\(/);
  assert.match(conformanceBootstrap, /executor,/);
  assert.match(conformanceBootstrap, /new ConformanceRenderer\(controller,\s*executor,\s*conformanceRoot\)/);
  assert.match(conformanceBootstrap, /prerequisiteChecker:\s*\(definition\)\s*=>\s*executor\.checkPrerequisite\(definition\)/);
  assert.doesNotMatch(main, /Scenario execution is added in a later stabilization PR\./);
  assert.doesNotMatch(conformanceBootstrap, /createBrowserCameraController/);
});

test("conformance device refresh is failure-safe and limited to discovery scenarios", async () => {
  const renderer = await readPlaygroundFile("src/conformance/conformance-renderer.ts");

  assert.match(renderer, /DEVICE_REFRESH_SCENARIOS/);
  assert.match(renderer, /"permission-request"/);
  assert.match(renderer, /"device-enumeration-before-permission"/);
  assert.match(renderer, /"device-enumeration-after-permission"/);
  assert.match(renderer, /void this\.refreshDeviceOptions\(\)\.catch\(\(\) => undefined\)/);
  assert.match(renderer, /DEVICE_REFRESH_SCENARIOS\.has\(scenarioId\)/);
});
