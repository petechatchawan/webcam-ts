import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

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
