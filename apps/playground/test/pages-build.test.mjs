import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const playgroundRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const WINDOWS = process.platform === "win32";
const pnpm = WINDOWS ? "pnpm.cmd" : "pnpm";

test("CI-mode build emits repository-relative asset paths", async () => {
  execFileSync(pnpm, ["exec", "vite", "build"], {
    cwd: playgroundRoot,
    env: { ...process.env, GITHUB_ACTIONS: "true" },
    stdio: "inherit",
    shell: WINDOWS,
  });
  const html = await readFile(join(playgroundRoot, "dist/index.html"), "utf8");
  assert.match(html, /\/webcam-ts\/assets\//);
});
