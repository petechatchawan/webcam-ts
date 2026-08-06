# Webcam-TS v4 Playground and GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Angular demo with a Vite + Vanilla TypeScript playground that exercises only Webcam-TS v4 public exports and deploys from `master` to GitHub Pages.

**Architecture:** `CameraController` composes public Webcam-TS services and exposes playground view snapshots; `UiRenderer` owns DOM binding and presentation only. The Pages workflow builds a repository-path-aware Vite artifact and deploys it through GitHub’s official Pages actions.

**Tech Stack:** TypeScript 5.8, Vite 6, Vanilla DOM APIs, Node.js built-in test runner, pnpm workspaces, GitHub Actions, GitHub Pages.

## Global Constraints

- Delete `apps/docs`; do not keep Angular compatibility code.
- No Angular, React, Vue, RxJS, PrimeNG, or UI framework in `apps/playground`.
- Import only declared Webcam-TS v4 package entrypoints.
- Local Vite base is `/`; GitHub Actions build base is `/webcam-ts/`.
- Pull requests verify but never deploy.
- Pages deploys only from `master` or manual dispatch.
- Object URLs created for captures are revoked on replacement and disposal.
- Production code is added only after the corresponding failing test or build contract is observed.

---

## File map

```text
apps/playground/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/dom.ts
  src/models.ts
  src/playground-logic.ts
  src/camera-controller.ts
  src/ui-renderer.ts
  src/main.ts
  src/styles.css
  test/playground-logic.test.mjs
.github/workflows/ci.yml
.github/workflows/pages.yml
package.json
pnpm-lock.yaml
README.md
```

### Task 1: Playground workspace and pure view logic

**Files:**
- Delete: `apps/docs/**`
- Create: `apps/playground/package.json`
- Create: `apps/playground/tsconfig.json`
- Create: `apps/playground/vite.config.ts`
- Create: `apps/playground/src/models.ts`
- Create: `apps/playground/src/playground-logic.ts`
- Create: `apps/playground/test/playground-logic.test.mjs`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `buildCameraRequest(selection)`, `deriveCommandAvailability(status)`, `projectCameraError(error)`, `appendEventLog(entries, event, limit)`, `replaceObjectUrl(current, blob, urlPort)`.

- [ ] **Step 1: Write failing pure-logic tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  appendEventLog,
  buildCameraRequest,
  deriveCommandAvailability,
  replaceObjectUrl,
} from "../dist/playground-logic.js";

test("active status enables switch and stop but not start", () => {
  assert.deepEqual(deriveCommandAvailability("active"), {
    canStart: false,
    canSwitch: true,
    canStop: true,
    busy: false,
  });
});

test("request uses exact device and ideal resolution", () => {
  assert.deepEqual(
    buildCameraRequest({
      deviceId: "camera-2",
      facingMode: "",
      width: 1280,
      height: 720,
      audio: false,
    }),
    {
      deviceId: "camera-2",
      resolution: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
  );
});

test("event log keeps newest entries within limit", () => {
  assert.deepEqual(appendEventLog(["a", "b"], "c", 2), ["b", "c"]);
});

test("replacing a capture URL revokes the previous URL", () => {
  const revoked = [];
  const port = {
    createObjectURL: () => "blob:new",
    revokeObjectURL: (value) => revoked.push(value),
  };
  assert.equal(replaceObjectUrl("blob:old", new Blob(["x"]), port), "blob:new");
  assert.deepEqual(revoked, ["blob:old"]);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/playground test`

Expected: FAIL because `apps/playground` and compiled logic do not exist.

- [ ] **Step 3: Add the minimal Vite workspace and pure functions**

`apps/playground/package.json` must contain:

```json
{
  "name": "playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\"",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "vite build",
    "test": "npm run build:logic && node --test test/*.test.mjs",
    "build:logic": "tsc -p tsconfig.json --outDir dist --rootDir src"
  },
  "dependencies": {
    "webcam-ts": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.8.0",
    "vite": "^6.1.0"
  }
}
```

Implement the five pure functions with exact types declared in `models.ts`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm install --lockfile-only`
Run: `pnpm --dir apps/playground test`
Run: `pnpm --dir apps/playground typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps pnpm-lock.yaml
git commit -m "feat(playground): replace Angular demo with Vite workspace"
```

### Task 2: Public API camera controller

**Files:**
- Create: `apps/playground/src/camera-controller.ts`
- Create: `apps/playground/test/camera-controller.test.mjs`

**Interfaces:**
- Consumes: public classes from `webcam-ts`, `webcam-ts/preview`, `webcam-ts/capture`, `webcam-ts/devices`, and `webcam-ts/controls`.
- Produces: `CameraController.initialize()`, `start(selection)`, `switch(selection)`, `stop()`, `capture(options)`, `applyControls(values)`, `subscribe(listener)`, `dispose()`.

- [ ] **Step 1: Write failing controller contract tests**

Use injected service ports to verify:

```js
test("failed switch preserves active view state and reports typed error", async () => {
  const fixture = createControllerFixture({ switchErrorCode: "DEVICE_BUSY" });
  await fixture.controller.start(defaultSelection);
  await assert.rejects(() => fixture.controller.switch(otherSelection));
  assert.equal(fixture.controller.getSnapshot().camera.status, "active");
  assert.equal(fixture.controller.getSnapshot().error.code, "DEVICE_BUSY");
});

test("dispose revokes capture URL and disposes every service once", async () => {
  const fixture = createControllerFixture();
  fixture.controller.setCapturedBlob(new Blob(["photo"]));
  await fixture.controller.dispose();
  assert.deepEqual(fixture.disposeCalls, {
    preview: 1,
    capture: 1,
    devices: 1,
    camera: 1,
  });
  assert.equal(fixture.revokedUrls.length, 1);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/playground test`

Expected: FAIL because `CameraController` and its injected ports do not exist.

- [ ] **Step 3: Implement the controller through public package contracts only**

The production factory must instantiate:

```ts
new Camera();
new VideoPreview(videoElement, { autoplay: true, muted: true, playsInline: true });
new CameraCapture(camera);
new CameraDeviceManager();
new CameraPermissionService();
new CameraControls(camera);
```

Do not import any path containing `/src/`, `/dist/`, or `CameraSession`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --dir apps/playground test`
Run: `pnpm --dir apps/playground typecheck`
Run: `pnpm --dir packages/webcam-ts test`

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/camera-controller.ts apps/playground/test/camera-controller.test.mjs
git commit -m "feat(playground): add public API camera controller"
```

### Task 3: Responsive UI and browser composition

**Files:**
- Create: `apps/playground/index.html`
- Create: `apps/playground/src/dom.ts`
- Create: `apps/playground/src/ui-renderer.ts`
- Create: `apps/playground/src/main.ts`
- Create: `apps/playground/src/styles.css`

**Interfaces:**
- Consumes: `CameraController` snapshots and command methods.
- Produces: a single responsive and keyboard-accessible camera playground.

- [ ] **Step 1: Add a failing source contract test**

```js
test("playground source uses only public package imports", async () => {
  const source = await readAllTypeScriptFiles(new URL("../src/", import.meta.url));
  assert.doesNotMatch(source, /packages\/webcam-ts\/src|\/dist\/|CameraSession/);
  assert.doesNotMatch(source, /@angular|react|vue|rxjs|primeng/i);
  assert.match(source, /from "webcam-ts"/);
  assert.match(source, /from "webcam-ts\/preview"/);
  assert.match(source, /from "webcam-ts\/capture"/);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/playground test`

Expected: FAIL because browser composition files and public imports are missing.

- [ ] **Step 3: Implement the page**

Required visible controls:

```text
permission badge
device selector
facing mode selector
resolution selector
mirror toggle
start / switch / stop
JPEG / PNG capture settings
capture button and result preview
zoom / torch / focus controls when supported
camera state card
device/capability card
typed event log
clear log
```

Add `beforeunload` and `pagehide` teardown that calls the same idempotent controller disposal path.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --dir apps/playground test`
Run: `pnpm --dir apps/playground typecheck`
Run: `pnpm --dir apps/playground build`

- [ ] **Step 5: Commit**

```bash
git add apps/playground
git commit -m "feat(playground): build responsive camera demo"
```

### Task 4: GitHub Pages build and deployment

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Modify: `apps/playground/vite.config.ts`
- Create: `apps/playground/test/pages-build.test.mjs`

**Interfaces:**
- Produces: PR build verification and master-only GitHub Pages deployment.

- [ ] **Step 1: Write a failing Pages build contract**

```js
test("CI-mode build emits repository-relative asset paths", async () => {
  execFileSync("pnpm", ["build"], {
    cwd: playgroundRoot,
    env: { ...process.env, GITHUB_ACTIONS: "true" },
    stdio: "inherit",
  });
  const html = await readFile(join(playgroundRoot, "dist/index.html"), "utf8");
  assert.match(html, /\/webcam-ts\/assets\//);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/playground test`

Expected: FAIL until Vite uses `/webcam-ts/` when `GITHUB_ACTIONS=true`.

- [ ] **Step 3: Implement workflow and base-path behavior**

`pages.yml` must use:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 8.14.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --dir packages/webcam-ts test
      - run: pnpm --dir apps/playground test
      - uses: actions/configure-pages@v5
      - run: pnpm --dir apps/playground build
        env:
          GITHUB_ACTIONS: "true"
      - uses: actions/upload-pages-artifact@v4
        with:
          path: apps/playground/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Trigger only on `push` to `master` and `workflow_dispatch`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --dir apps/playground test`
Run: `GITHUB_ACTIONS=true pnpm --dir apps/playground build`
Run: `grep -R "apps/docs\|pnpm --filter docs" .github package.json pnpm-workspace.yaml turbo.json`
Expected: no obsolete build reference.

- [ ] **Step 5: Commit**

```bash
git add .github apps/playground/vite.config.ts apps/playground/test/pages-build.test.mjs
git commit -m "ci: deploy playground to GitHub Pages"
```

### Task 5: Repository cleanup, documentation, and final verification

**Files:**
- Modify: `README.md`
- Modify: `packages/webcam-ts/README.md`
- Modify: `package.json` when scripts still reference docs
- Modify: `turbo.json` when pipeline entries require new names
- Modify: `pnpm-lock.yaml`
- Delete: obsolete Angular/Vercel-only files and dependencies not used elsewhere.

**Interfaces:**
- Produces: one canonical GitHub Pages demo link and a clean framework-agnostic workspace.

- [ ] **Step 1: Add a failing repository hygiene test**

Create `scripts/verify-playground-clean-room.mjs` and assert:

```js
const banned = [
  "apps/docs",
  "@angular/",
  "primeng",
  "primeicons",
  "rxjs",
  "webcam-ts-docs.vercel.app",
];
```

The script walks tracked text files except historical design documents and fails on active configuration/source references.

- [ ] **Step 2: Verify RED**

Run: `node scripts/verify-playground-clean-room.mjs`

Expected: FAIL until remaining Angular/Vercel references and dependencies are removed.

- [ ] **Step 3: Complete cleanup and documentation**

Canonical demo URL:

```text
https://petechatchawan.github.io/webcam-ts/
```

The root README must explain that the playground is Vanilla TypeScript and consumes only public exports.

- [ ] **Step 4: Run the full gate**

```bash
pnpm install --frozen-lockfile
node scripts/verify-playground-clean-room.mjs
pnpm --dir packages/webcam-ts typecheck
pnpm --dir packages/webcam-ts test
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
GITHUB_ACTIONS=true pnpm --dir apps/playground build
cd packages/webcam-ts && npm pack --dry-run
```

Expected:

```text
clean-room verification PASS
package typecheck PASS
package tests 40/40 or greater PASS
playground typecheck PASS
playground tests PASS
Pages-path production build PASS
package tarball verification PASS
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "docs: make GitHub Pages playground canonical"
```
