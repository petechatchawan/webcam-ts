# Webcam-TS v4 Preview-Centric Mobile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move session state and immediate camera controls into the preview while removing redundant facing-mode UI, without changing Webcam-TS package behavior.

**Architecture:** Keep the existing normal-playground controller and renderer ownership intact. Reuse existing DOM IDs and move only their markup placement; remove the standalone facing selector/binding and add small preview-overlay CSS rules. No new state container or component abstraction is introduced.

**Tech Stack:** Vite, Vanilla TypeScript, HTML, CSS, Node-based source-contract tests.

## Global Constraints

- Preserve Webcam-TS public package API and lifecycle semantics.
- Preserve permission gate, requested/actual resolution overlay, exact/prefer behavior, capture behavior, and typed errors.
- Preserve light-theme and mobile-first direction.
- Reuse `start-camera`, `switch-camera`, `stop-camera`, `status-badge`, and `mirror-toggle` IDs.
- Remove normal-playground `facing-select` UI only; do not remove package-facing-mode capability.
- No new framework, component library, runtime dependency, or abstraction layer.
- Conformance mode is out of scope.

---

### Task 1: Lock preview-centric DOM contracts

**Files:**
- Modify: `apps/playground/test/source-contract.test.mjs`
- Test: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: current `apps/playground/index.html` and `src/styles.css` as text.
- Produces: source contracts that define the approved normal-playground layout.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that the normal playground satisfies these exact conditions:

```js
assert.doesNotMatch(indexHtml, /class="card camera-action-panel"/);
assert.match(previewShellHtml, /id="status-badge"/);
assert.match(previewShellHtml, /id="start-camera"/);
assert.match(previewShellHtml, /id="switch-camera"/);
assert.match(previewShellHtml, /id="stop-camera"/);
assert.match(previewShellHtml, /id="mirror-toggle"/);
assert.doesNotMatch(normalPlaygroundHtml, /id="facing-select"/);
assert.match(sessionConfigurationHtml, /id="audio-toggle"/);
assert.match(stylesCss, /\.preview-status-overlay/);
assert.match(stylesCss, /\.preview-lifecycle-overlay/);
assert.match(stylesCss, /\.preview-mirror-control/);
```

Use the existing helper/style of `source-contract.test.mjs` rather than adding another parser dependency.

- [ ] **Step 2: Run playground tests and verify RED**

Run:

```bash
pnpm --dir apps/playground test
```

Expected: new source-contract assertions fail because the action card/status/mirror/facing selector are still in their old locations.

- [ ] **Step 3: Commit RED tests**

```bash
git add apps/playground/test/source-contract.test.mjs
git commit -m "test(playground): define preview-centric mobile UI contracts"
```

### Task 2: Move existing controls into the preview markup

**Files:**
- Modify: `apps/playground/index.html`
- Test: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: existing controller/renderer bindings by stable IDs.
- Produces: same elements, new preview-local placement; no duplicate controls.

- [ ] **Step 1: Move status badge into `#preview-shell`**

Place:

```html
<span id="status-badge" class="badge status-badge preview-status-overlay" data-status="idle">idle</span>
```

inside `#preview-shell` and remove it from `.page-heading`.

- [ ] **Step 2: Move lifecycle controls into `#preview-shell`**

Remove the standalone `.camera-action-panel` section and place the existing three buttons in:

```html
<div class="preview-lifecycle-overlay" aria-label="Camera session controls">
  <button id="start-camera" class="button button-primary" disabled>Start camera</button>
  <div class="preview-lifecycle-secondary">
    <button id="switch-camera" class="button button-secondary" disabled>Switch</button>
    <button id="stop-camera" class="button button-destructive-outline" disabled>Stop</button>
  </div>
</div>
```

Do not change IDs or button semantics.

- [ ] **Step 3: Move mirror control into `#preview-shell`**

Remove the mirror row from `.toggle-grid` and add a compact overlay using the same checkbox:

```html
<label class="preview-mirror-control">
  <input id="mirror-toggle" type="checkbox" checked />
  <span class="switch-track" aria-hidden="true"><span></span></span>
  <span>Mirror</span>
</label>
```

Keep `audio-toggle` in Session configuration.

- [ ] **Step 4: Remove facing mode field from normal playground markup**

Delete only the `label.field` containing `#facing-select`.

- [ ] **Step 5: Run source-contract tests**

Run:

```bash
pnpm --dir apps/playground test
```

Expected: markup-placement tests pass or remaining failures point only to CSS/binding changes.

### Task 3: Remove redundant facing-mode binding while preserving request behavior

**Files:**
- Inspect/Modify as needed: `apps/playground/src/main.ts`
- Inspect/Modify as needed: `apps/playground/src/ui-renderer.ts`
- Inspect/Modify as needed: `apps/playground/src/camera-controller.ts`
- Test: existing playground tests

**Interfaces:**
- Consumes: camera device selection and current session configuration model.
- Produces: normal playground no longer reads a DOM `facing-select`; package request support remains unchanged.

- [ ] **Step 1: Locate all `facing-select` DOM lookups/listeners**

Remove only DOM requirements and UI event wiring for that selector.

- [ ] **Step 2: Keep automatic/device-driven request construction**

When a concrete device is selected, continue constructing requests from the device selection. When automatic selection is used, do not invent a facing mode from removed UI state.

- [ ] **Step 3: Run typecheck and tests**

Run:

```bash
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
```

Expected: both PASS; no missing element assertion for `facing-select`.

### Task 4: Add lean preview overlay styling

**Files:**
- Modify: `apps/playground/src/styles.css`
- Test: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: preview-local markup from Task 2.
- Produces: mobile-first overlays that stay readable without obscuring the center of the video.

- [ ] **Step 1: Add status overlay rule**

Implement `.preview-status-overlay` as an absolute top-left/top-right compact badge inside `.preview-shell` with readable light surface and existing status coloring semantics.

- [ ] **Step 2: Add lifecycle overlay rule**

Implement `.preview-lifecycle-overlay` at the bottom of the preview with mobile-safe spacing, one full-width primary Start button and two secondary buttons below/alongside as viewport allows.

- [ ] **Step 3: Add compact mirror overlay rule**

Implement `.preview-mirror-control` as an absolute compact control above the lifecycle area, retaining native checkbox accessibility and visible focus styling.

- [ ] **Step 4: Remove obsolete action-card/sticky lifecycle styles**

Delete rules that only style `.camera-action-panel` or mobile sticky lifecycle card behavior. Do not remove shared `.lifecycle-actions` styles if another mode still consumes them; verify references first.

- [ ] **Step 5: Ensure permission gate interaction authority**

CSS stacking must keep `.permission-gate` above lifecycle/mirror controls while permission is required, so users cannot trigger hidden controls through the gate.

- [ ] **Step 6: Run playground tests**

```bash
pnpm --dir apps/playground test
```

Expected: all source-contract tests PASS.

### Task 5: Full verification and PR closure evidence

**Files:**
- No production changes unless verification reveals a defect.

**Interfaces:**
- Produces: exact-head evidence suitable for merge.

- [ ] **Step 1: Run package and playground verification**

```bash
pnpm verify:playground
pnpm --dir packages/webcam-ts typecheck
pnpm --dir packages/webcam-ts test
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
GITHUB_ACTIONS=true pnpm --dir apps/playground build
```

Expected: zero failures.

- [ ] **Step 2: Verify browser conformance remains unchanged**

Use the existing Browser Conformance GitHub Actions workflow on the PR exact head. Expected: Chromium, Firefox, WebKit, and aggregate jobs PASS.

- [ ] **Step 3: Review diff**

Confirm changed production scope is limited to normal-playground HTML/CSS/bindings plus tests/docs, with no `packages/webcam-ts/src/**` public-behavior changes.

- [ ] **Step 4: Update PR evidence and keep merge decision explicit**

Record exact head, CI/test counts, build result, and browser-conformance result in the PR description before Ready/merge.
