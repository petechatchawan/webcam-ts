# Webcam-TS v4 Mobile Preview Action Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Start, Switch, and Stop directly beneath the live preview, keep them reachable while configuring the camera on mobile, and reduce the oversized idle preview without changing camera lifecycle behavior.

**Architecture:** Preserve every existing DOM id and controller binding. Reorder the existing lifecycle and utility controls into a dedicated action panel between the preview and session settings, move the existing typed-error alert beside those actions, and expose preview activity through `data-active` so CSS can render a compact idle shell while retaining negotiated aspect ratios for active streams. The same lifecycle button group is static on desktop and sticky on mobile; no duplicate controls or synchronization layer is introduced.

**Tech Stack:** Vanilla TypeScript, semantic HTML, CSS media queries, Node test runner, Vite, existing Webcam-TS public APIs.

## Global Constraints

- Keep `apps/playground` framework-free and dependency-free beyond its existing Vite/TypeScript toolchain.
- Preserve all existing public Webcam-TS imports and all controller lifecycle semantics.
- Preserve the existing button ids: `start-camera`, `switch-camera`, and `stop-camera`.
- Do not duplicate lifecycle buttons; one DOM control set remains the single source of user commands.
- Preserve permission blocking, exact-resolution behavior, typed errors, capture behavior, and GitHub Pages deployment.
- Target 320–480 px mobile viewports first and retain desktop enhancement from 721 px.
- Maintain touch targets of at least 44 px and iPhone safe-area spacing.

---

### Task 1: Add RED layout contracts

**Files:**
- Modify: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: current `index.html`, `src/styles.css`, and `src/ui-renderer.ts` source text.
- Produces: contracts that require preview-first control order, compact idle preview state, and a mobile sticky lifecycle dock.

- [ ] **Step 1: Add a failing HTML order test**

Add a test that reads `index.html`, finds `id="preview-shell"`, `class="camera-action-panel"`, `id="error-panel"`, and `class="card settings-card"`, and asserts this order:

```text
preview-shell < camera-action-panel < error-panel < settings-card
```

Also assert that `start-camera`, `switch-camera`, and `stop-camera` occur inside the action panel rather than inside the settings card.

- [ ] **Step 2: Add a failing CSS/runtime-state test**

Read `src/styles.css` and `src/ui-renderer.ts`, then assert:

```text
.preview-shell[data-active="false"] defines a compact height
@media (max-width: 720px) makes .lifecycle-actions position: sticky
.camera-action-panel has its own compact card styling
UiRenderer writes previewShell.dataset.active from the negotiated stream state
```

- [ ] **Step 3: Run the playground tests and verify RED**

Run through CI-equivalent command:

```bash
pnpm --dir apps/playground test
```

Expected: the new layout tests fail because `camera-action-panel` and `data-active` do not exist and the controls are still inside `settings-card`.

- [ ] **Step 4: Commit RED contracts**

```bash
git add apps/playground/test/source-contract.test.mjs
git commit -m "test(playground): require preview-first lifecycle controls"
```

### Task 2: Move lifecycle controls next to preview

**Files:**
- Modify: `apps/playground/index.html`

**Interfaces:**
- Consumes: existing button ids and existing `UiRenderer` event bindings.
- Produces: one `camera-action-panel` between preview and settings, containing the existing lifecycle buttons and utility actions; existing `error-panel` follows it immediately.

- [ ] **Step 1: Add the action panel immediately after the preview card**

Move the existing `lifecycle-actions` block out of `settings-card` and place it inside:

```html
<section class="card camera-action-panel" aria-label="Camera session controls">
  <div class="camera-action-copy">
    <div>
      <strong>Camera session</strong>
      <span>Start, switch, or stop without leaving the preview.</span>
    </div>
  </div>
  <div class="lifecycle-actions">...</div>
  <div class="utility-actions">...</div>
</section>
```

Do not create duplicate ids or buttons.

- [ ] **Step 2: Move the existing error panel before settings**

Place `error-panel` immediately after `camera-action-panel` so exact-resolution and permission failures appear beside the command that triggered them.

- [ ] **Step 3: Simplify settings-card**

Remove the old `action-section`. Keep resolution preset and behavior visible. Keep device, facing mode, mirror, and microphone controls in the same settings card without changing ids.

- [ ] **Step 4: Run source contracts**

```bash
pnpm --dir apps/playground test
```

Expected: HTML-order assertions pass; CSS/runtime-state assertions remain RED.

### Task 3: Add compact preview and responsive command dock

**Files:**
- Modify: `apps/playground/src/styles.css`
- Modify: `apps/playground/src/ui-renderer.ts`

**Interfaces:**
- Consumes: `PlaygroundSnapshot.camera.status` and actual negotiated width/height.
- Produces: `preview-shell.dataset.active`, compact idle/start shell, active aspect-ratio shell, and mobile sticky lifecycle controls.

- [ ] **Step 1: Project preview activity in UiRenderer**

In `renderPreview`, after deriving `hasActual`, write:

```ts
this.previewShell.dataset.active = String(hasActual);
```

Do not change stream ownership or request semantics.

- [ ] **Step 2: Make inactive preview compact**

Add CSS so:

```css
.preview-shell[data-active="false"] {
  height: clamp(15rem, 58vw, 20rem);
  max-height: 20rem;
  aspect-ratio: auto;
}
```

Active preview continues using `--preview-aspect-ratio` and `object-fit: contain`.

- [ ] **Step 3: Style camera-action-panel**

Create a compact card with small explanatory copy, lifecycle buttons directly below the preview, and utility actions visually secondary. Keep Start primary, Switch secondary, and Stop destructive outline.

- [ ] **Step 4: Make lifecycle-actions sticky only on mobile**

Move sticky positioning into:

```css
@media (max-width: 720px) {
  .lifecycle-actions {
    position: sticky;
    bottom: max(0.5rem, env(safe-area-inset-bottom));
    z-index: 20;
  }
}
```

At 721 px and above, use a static three-column row. Preserve 44 px minimum touch targets.

- [ ] **Step 5: Prevent sticky overlap**

Give the mobile page shell enough bottom safe-area breathing room and keep the action panel in normal document flow so it returns to its position when the user scrolls back to the preview.

- [ ] **Step 6: Run playground tests**

```bash
pnpm --dir apps/playground test
```

Expected: all playground tests pass.

### Task 4: Full verification and PR evidence

**Files:**
- Modify: PR #2 description only if verification succeeds.

**Interfaces:**
- Consumes: final branch head.
- Produces: exact-head CI evidence for package, playground, and Pages artifact.

- [ ] **Step 1: Run the full CI-equivalent gate**

```bash
pnpm install --frozen-lockfile
node scripts/verify-playground-clean-room.mjs
pnpm --dir packages/webcam-ts typecheck
pnpm --dir packages/webcam-ts test
cd packages/webcam-ts && npm pack --dry-run
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
GITHUB_ACTIONS=true pnpm --dir apps/playground build
```

Expected:

```text
package typecheck PASS
package tests 41/41 PASS or higher
playground typecheck PASS
playground tests all PASS
GitHub Pages build PASS
```

- [ ] **Step 2: Review the generated layout manually**

Verify at desktop width and at 390×844 mobile viewport:

```text
idle preview no longer consumes portrait-stream height
Start/Switch/Stop appear immediately below preview
mobile lifecycle row remains reachable while scrolling through settings
permission and exact-resolution failures appear before settings
no duplicate lifecycle controls exist
```

- [ ] **Step 3: Update PR #2 evidence**

Record the exact head SHA, final test counts, Pages build result, and the preview-first lifecycle layout change. Keep the PR as Draft for physical camera testing.
