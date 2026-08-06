import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const textExtensions = new Set([".json", ".yaml", ".yml", ".ts", ".js", ".mjs", ".md", ".html", ".css"]);
const banned = [
  "apps/docs",
  "@angular/",
  "primeng",
  "primeicons",
  "webcam-ts-docs.vercel.app",
];
const scanRoots = [
  "apps",
  ".github",
  "package.json",
  "pnpm-lock.yaml",
  "turbo.json",
  "README.md",
  "packages/webcam-ts/README.md",
];

const failures = [];
if (existsSync(new URL("../apps/docs", import.meta.url))) failures.push("apps/docs still exists");

async function scan(path) {
  const url = new URL(path, root);
  const entries = await readdir(url, { withFileTypes: true }).catch(() => null);
  if (entries) {
    for (const entry of entries) await scan(`${path}/${entry.name}`);
    return;
  }
  if (!textExtensions.has(extname(path)) && !path.endsWith("package.json")) return;
  const content = await readFile(url, "utf8");
  for (const token of banned) {
    if (content.toLowerCase().includes(token.toLowerCase())) {
      failures.push(`${relative(".", path)} contains ${token}`);
    }
  }
}

for (const path of scanRoots) await scan(path);

if (failures.length) {
  console.error("Playground clean-room verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Playground clean-room verification PASS");
