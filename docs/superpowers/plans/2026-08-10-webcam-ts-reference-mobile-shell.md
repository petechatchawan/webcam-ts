# Webcam-TS Reference-Inspired Mobile Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the normal playground camera shell around a reference-inspired media card and safe-area sticky Start/Capture/Stop footer while moving Switch into Session configuration.

**Architecture:** Keep the existing `UiRenderer` and controller bindings as the only behavior source. Restructure static HTML so the same control IDs live in their approved locations, then use one focused stylesheet for the camera card/footer treatment. No runtime DOM relocation and no new state abstraction.

**Tech Stack:** Vite, Vanilla TypeScript, CSS, Node test runner, Playwright browser conformance.

## Global Constraints

- Preserve Webcam-TS v4 public API and lifecycle behavior.
- Preserve exact/prefer resolution semantics and typed errors.
- Permission and Start stay separate explicit actions.
- Sticky footer contains only `start-camera`, `capture-photo`, `stop-camera`.
- `switch-camera` lives in Session configuration beside camera selection.
- Facing mode remains absent from the normal playground.
- Conformance mode is unchanged.
- Mobile safe-area support is mandatory.

---

### Task 1: Lock static layout contracts

**Files:**
- Create: `apps/playground/test/reference-mobile-shell.test.mjs`

**Interfaces:**
- Consumes: `apps/playground/index.html`, `apps/playground/src/reference-mobile-shell.css`
- Produces: source contracts for camera media card, in-preview permission gate, settings switch action, and sticky footer.

- [ ] **Step 1: Write failing source-contract tests**

Assert that `start-camera`, `capture-photo`, and `stop-camera` appear exactly once inside `.mobile-camera-footer`; `switch-camera` appears exactly once inside the Session configuration card; the preview contains `permission-gate`; and no `.preview-session-controls` remains.

- [ ] **Step 2: Run playground tests and verify RED**

Run the repository playground test command through CI. Expected: failures only for the new static layout contract.

- [ ] **Step 3: Commit RED tests**

Commit only the test file.

### Task 2: Rebuild static camera shell

**Files:**
- Modify: `apps/playground/index.html`

**Interfaces:**
- Consumes: existing control IDs used by `UiRenderer`.
- Produces: static reference-inspired camera card and footer structure without duplicate controls.

- [ ] **Step 1: Move Start/Capture/Stop into one bottom action footer**

Reuse existing IDs and button elements. Do not create secondary action copies.

- [ ] **Step 2: Move Switch into Session configuration**

Place `switch-camera` directly after `device-select` so target device selection and switching form one interaction group.

- [ ] **Step 3: Keep permission gate inside preview**

Preserve `permission-gate`, `permission-gate-title`, `permission-gate-message`, and `permission-gate-action` IDs and live-region semantics.

- [ ] **Step 4: Add media information strip**

Add static elements that can display the selected/active camera and delivered resolution using existing snapshot data or current diagnostics projection without changing package APIs.

- [ ] **Step 5: Run typecheck/tests**

Expected: static layout contracts pass; renderer/compiler may identify any required focused projection changes.

### Task 3: Project media-card metadata and footer state

**Files:**
- Modify: `apps/playground/src/ui-renderer.ts`
- Test: `apps/playground/test/reference-mobile-shell.test.mjs`

**Interfaces:**
- Consumes: `PlaygroundSnapshot.devices`, `camera.deviceId`, `camera.settings`, `availability`.
- Produces: media-card camera label/resolution projection while retaining existing button state logic.

- [ ] **Step 1: Add RED contracts for metadata IDs**

Require renderer bindings for `preview-device-label` and `preview-device-resolution`.

- [ ] **Step 2: Implement minimal renderer projection**

Resolve the active/selected device label from the snapshot; fall back to `Camera` when no label is available. Show actual width×height while active, otherwise the selected requested preset.

- [ ] **Step 3: Preserve footer button state logic**

`startButton.disabled`, `captureButton.disabled`, and `stopButton.disabled` remain driven by the existing snapshot conditions. `switchButton` remains driven by `availability.canSwitch`.

- [ ] **Step 4: Run typecheck/tests**

Expected: PASS.

### Task 4: Implement reference-inspired mobile styling

**Files:**
- Create: `apps/playground/src/reference-mobile-shell.css`
- Modify: `apps/playground/src/main.ts` or stylesheet import location only if required by current import pattern.
- Modify: `apps/playground/src/styles.css` only for obsolete conflicting preview/session rules that must be removed.

**Interfaces:**
- Produces: camera card with distinct media/info strip, centered permission state, and safe-area footer.

- [ ] **Step 1: Add focused CSS contract assertions**

Require `.mobile-camera-footer` to be sticky/fixed with `env(safe-area-inset-bottom)`, require page bottom spacing, require `.camera-media-strip`, and prohibit old `.preview-session-controls` presentation.

- [ ] **Step 2: Implement camera-card styling**

Keep `object-fit: contain`; use a clear media surface, centered idle/permission content, and an information strip below the media area.

- [ ] **Step 3: Implement sticky footer**

Three equal action lanes on mobile: Start primary, Capture neutral, Stop destructive. Constrain width to the app container on larger screens.

- [ ] **Step 4: Remove obsolete conflicting overlay action CSS**

Delete or stop importing the previous preview-centric action overlay rules; retain only behavior-independent styles still needed elsewhere.

- [ ] **Step 5: Run full CI and Pages build**

Expected: package, playground, typecheck, tests, packed export, tarball, and Pages build all PASS.

### Task 5: Browser verification and integration

**Files:**
- No production file changes unless verification finds a scoped defect.

**Interfaces:**
- Consumes: exact PR head.
- Produces: merge evidence and production Pages deployment.

- [ ] **Step 1: Run Chromium / Firefox / WebKit conformance**

Expected: all engines and aggregate evidence PASS.

- [ ] **Step 2: Review PR diff**

Confirm no package public API or conformance-mode behavior changes.

- [ ] **Step 3: Mark PR Ready and squash-merge with expected head SHA**

Use the repository's squash merge flow.

- [ ] **Step 4: Verify post-merge CI and Pages deployment**

Confirm the deployed `github-pages` SHA equals the resulting `master` merge SHA.
