import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const WINDOWS = process.platform === "win32";
const NPM = WINDOWS ? "npm.cmd" : "npm";

function npmEnvironment() {
  const environment = { ...process.env };
  delete environment.npm_config_dry_run;
  return environment;
}

test("declared package subpaths import from a packed tarball", () => {
  const packOutput = execFileSync(NPM, ["pack", "--ignore-scripts", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: npmEnvironment(),
    shell: WINDOWS,
  });
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(packageRoot, filename);
  const fixture = mkdtempSync(join(tmpdir(), "webcam-ts-contract-"));

  try {
    writeFileSync(join(fixture, "package.json"), JSON.stringify({ type: "module", private: true }));
    execFileSync(NPM, ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: fixture,
      stdio: "pipe",
      env: npmEnvironment(),
      shell: WINDOWS,
    });

    const script = `
      const root = await import("webcam-ts");
      const preview = await import("webcam-ts/preview");
      const capture = await import("webcam-ts/capture");
      const devices = await import("webcam-ts/devices");
      const controls = await import("webcam-ts/controls");
      const testing = await import("webcam-ts/testing");
      if (!root.Webcam || !preview.Preview || !capture.Capture ||
          !devices.DeviceManager || !devices.PermissionService || !controls.Controls ||
          !testing.FakeMediaDevicesPort) process.exit(2);
      if (typeof root.Webcam.prototype.switch === "function") process.exit(5);
      for (const internal of [
        "assertCommandAllowed",
        "EventHub",
        "stopStream",
        "resolveMediaDevices",
        "normalizeBrowserError",
        "BrowserMediaDevicesAdapter",
      ]) {
        if (internal in root) process.exit(4);
      }
      try {
        await import("webcam-ts/camera");
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
