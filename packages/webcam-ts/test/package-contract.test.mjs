import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);

function npmEnvironment() {
  const environment = { ...process.env };
  delete environment.npm_config_dry_run;
  return environment;
}

test("declared package subpaths import from a packed tarball", () => {
  const packOutput = execFileSync("npm", ["pack", "--ignore-scripts", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: npmEnvironment(),
  });
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(packageRoot, filename);
  const fixture = mkdtempSync(join(tmpdir(), "webcam-ts-contract-"));

  try {
    writeFileSync(join(fixture, "package.json"), JSON.stringify({ type: "module", private: true }));
    execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: fixture,
      stdio: "pipe",
      env: npmEnvironment(),
    });

    const script = `
      const root = await import("webcam-ts");
      const preview = await import("webcam-ts/preview");
      const capture = await import("webcam-ts/capture");
      const devices = await import("webcam-ts/devices");
      const controls = await import("webcam-ts/controls");
      const testing = await import("webcam-ts/testing");
      if (!root.Camera || !preview.VideoPreview || !capture.CameraCapture ||
          !devices.CameraDeviceManager || !controls.CameraControls ||
          !testing.FakeMediaDevicesPort) process.exit(2);
      for (const internal of [
        "CameraEventHub",
        "OperationController",
        "stopStream",
        "resolveMediaDevices",
        "normalizeBrowserError",
        "BrowserMediaDevicesAdapter",
      ]) {
        if (internal in root) process.exit(4);
      }
      try {
        await import("webcam-ts/session/camera-session");
        process.exit(3);
      } catch (error) {
        if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
      }
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(tarball, { force: true });
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("package metadata exposes ESM-only typed entrypoints", () => {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.sideEffects, false);
  assert.deepEqual(Object.keys(packageJson.exports), [
    ".",
    "./preview",
    "./capture",
    "./devices",
    "./controls",
    "./testing",
  ]);
});
