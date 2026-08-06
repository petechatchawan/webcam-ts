# Webcam-TS v4 Shadcn-Minimal Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dark glassmorphism playground with a light-first, shadcn-inspired minimal interface while preserving all Webcam-TS v4 behavior and GitHub Pages contracts.

**Architecture:** Keep the existing Vanilla TypeScript controller and all controller-bound DOM IDs unchanged. Restructure only `index.html` presentation hierarchy, replace the CSS token/component layer, and add source-level UI contracts that verify neutral tokens, system dark mode, progressive diagnostics disclosure, accessibility hooks, and removal of the legacy visual language.

**Tech Stack:** Vite 6, Vanilla TypeScript, HTML5, CSS custom properties, Node test runner, pnpm 8.14.0.

## Global Constraints

- No React, shadcn/ui package, Tailwind, Radix, icon package, or new runtime dependency.
- Light-first UI with `@media (prefers-color-scheme: dark)` as the only theme override.
- Preserve every DOM ID referenced by `apps/playground/src/ui-renderer.ts`.
- Preserve camera lifecycle, capture, permissions, device, and hardware-control behavior.
- No gradients, glass blur, neon cyan palette, or oversized marketing hero.
- Diagnostics use native `details/summary` and remain closed by default.
- Maintain keyboard focus visibility, semantic labels, ARIA live/error behavior, and mobile overflow safety.

---

### Task 1: Lock the visual and structural contracts

**Files:**
- Modify: `apps/playground/test/source-contract.test.mjs`
- Test: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: repository files `apps/playground/index.html` and `apps/playground/src/styles.css`.
- Produces: source-level contracts that fail until the approved markup and token system are present.

- [ ] **Step 1: Add the failing design-system contract**

Extend the test module with helpers that read the playground HTML and CSS, then add:

```js
const playgroundRoot = fileURLToPath(new URL("../", import.meta.url));

async function readPlaygroundFile(path) {
  return readFile(join(playgroundRoot, path), "utf8");
}

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
  assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.doesNotMatch(css, /backdrop-filter|radial-gradient|#64d8ff|#00a8e8/i);
});
```

- [ ] **Step 2: Add the failing information-architecture contract**

```js
test("playground keeps required bindings and uses progressive diagnostics", async () => {
  const html = await readPlaygroundFile("index.html");
  for (const id of [
    "camera-preview",
    "status-badge",
    "status-message",
    "device-select",
    "facing-select",
    "resolution-select",
    "mirror-toggle",
    "audio-toggle",
    "request-permission",
    "refresh-devices",
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
  assert.match(html, /<details[^>]*class=["'][^"']*diagnostics-disclosure/);
  assert.match(html, /<summary[^>]*>[^<]*Diagnostics/i);
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm --dir apps/playground test
```

Expected: FAIL because the current CSS uses the legacy palette/glass styles and the diagnostics section is not a native disclosure.

- [ ] **Step 4: Commit the RED contract**

```bash
git add apps/playground/test/source-contract.test.mjs
git commit -m "test(playground): lock minimal UI contracts"
```

---

### Task 2: Rebuild the playground markup hierarchy

**Files:**
- Modify: `apps/playground/index.html`
- Test: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: all existing element IDs used by `UiRenderer`.
- Produces: compact app shell, preview-first workspace, utility sidebar, capture card, and native diagnostics disclosure.

- [ ] **Step 1: Replace the large hero with a compact app header**

Use this hierarchy while keeping the source URL:

```html
<header class="app-header">
  <div class="container header-inner">
    <div class="brand-lockup">
      <div class="brand-mark" aria-hidden="true">W</div>
      <div>
        <div class="brand-line">
          <span class="brand-name">Webcam-TS</span>
          <span class="badge badge-outline">v4 alpha</span>
        </div>
        <p class="brand-description">Framework-agnostic camera lifecycle playground</p>
      </div>
    </div>
    <a class="button button-outline button-sm" href="https://github.com/petechatchawan/webcam-ts">View source</a>
  </div>
</header>
```

- [ ] **Step 2: Create a preview-first two-column workspace**

The main container must use:

```html
<main class="container page-shell">
  <div class="page-heading">
    <div>
      <h1>Camera playground</h1>
      <p>Test deterministic lifecycle, atomic switching, capture, and hardware controls.</p>
    </div>
    <span id="status-badge" class="badge" data-status="idle">idle</span>
  </div>

  <div class="workspace-grid">
    <section class="workspace-column" aria-labelledby="workspace-title">
      <!-- preview card, settings card, error alert -->
    </section>
    <aside class="sidebar-column">
      <!-- permission and hardware control cards -->
    </aside>
  </div>
</main>
```

The `video`, status message, all field IDs, lifecycle buttons, and error IDs remain unchanged.

- [ ] **Step 3: Normalize controls to reusable button and field classes**

Map actions as follows:

```html
<button id="request-permission" class="button button-outline">Request permission</button>
<button id="refresh-devices" class="button button-ghost">Refresh cameras</button>
<button id="start-camera" class="button button-primary">Start camera</button>
<button id="switch-camera" class="button button-secondary" disabled>Switch</button>
<button id="stop-camera" class="button button-destructive-outline" disabled>Stop</button>
```

Keep labels explicit and add short field descriptions only where they clarify behavior.

- [ ] **Step 4: Convert diagnostics to progressive disclosure**

Use:

```html
<details class="diagnostics-disclosure">
  <summary>
    <span>Diagnostics</span>
    <span class="summary-description">State, capabilities, and typed events</span>
  </summary>
  <div class="diagnostics-grid">
    <!-- existing state-output, devices-output, event-list and clear-events IDs -->
  </div>
</details>
```

Do not add `open`; diagnostics are closed by default.

- [ ] **Step 5: Run source contracts**

Run:

```bash
pnpm --dir apps/playground test
```

Expected: token test remains FAIL; markup/ID/disclosure contract progresses to PASS.

- [ ] **Step 6: Commit the markup redesign**

```bash
git add apps/playground/index.html
git commit -m "feat(playground): restructure minimal camera workspace"
```

---

### Task 3: Implement the shadcn-inspired neutral CSS system

**Files:**
- Modify: `apps/playground/src/styles.css`
- Test: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- Consumes: semantic classes and layout hierarchy introduced in Task 2.
- Produces: light-first neutral tokens, system dark mode, reusable component styling, responsive layout, and accessible interaction states.

- [ ] **Step 1: Replace root tokens and global defaults**

Start with:

```css
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;

  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.625rem;
}
```

- [ ] **Step 2: Add system dark-mode token overrides**

```css
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

- [ ] **Step 3: Implement reusable component styles**

Define cards, fields, badges, alerts, buttons, form controls, switches, preview shell, capture result, code surfaces, and details/summary using HSL tokens. Required focus contract:

```css
button:focus-visible,
a:focus-visible,
select:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

Buttons must use 36px minimum height, subtle transition, no lift transform, and no gradient.

- [ ] **Step 4: Implement responsive layouts**

```css
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 1.5rem;
}

@media (max-width: 960px) {
  .workspace-grid { grid-template-columns: 1fr; }
  .sidebar-column { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .container { width: min(100% - 1rem, 80rem); }
  .sidebar-column,
  .settings-grid,
  .capture-layout { grid-template-columns: 1fr; }
  .action-row .button { flex: 1 1 100%; }
  .preview-shell { aspect-ratio: 4 / 3; }
}
```

- [ ] **Step 5: Respect reduced motion**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 6: Run playground tests and Pages build**

Run:

```bash
pnpm --dir apps/playground test
GITHUB_ACTIONS=true pnpm --dir apps/playground build
```

Expected: all playground tests PASS and generated asset paths remain under `/webcam-ts/`.

- [ ] **Step 7: Commit the visual system**

```bash
git add apps/playground/src/styles.css
git commit -m "feat(playground): apply shadcn-inspired minimal theme"
```

---

### Task 4: Final verification and PR evidence

**Files:**
- Modify: PR #2 description only if verification values change.

**Interfaces:**
- Consumes: completed markup, CSS, tests, package, lockfile, and workflows.
- Produces: exact-head verification evidence without merging or deploying from the feature branch.

- [ ] **Step 1: Run the complete local/CI-equivalent gate**

```bash
pnpm install --frozen-lockfile
node scripts/verify-playground-clean-room.mjs
pnpm --dir packages/webcam-ts typecheck
pnpm --dir packages/webcam-ts test
cd packages/webcam-ts && npm pack --dry-run
cd ../..
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
GITHUB_ACTIONS=true pnpm --dir apps/playground build
```

Expected: all commands PASS; package remains 40/40 and playground test count includes the new UI contracts.

- [ ] **Step 2: Inspect the generated artifact**

Confirm:

- `apps/playground/dist/index.html` exists.
- CSS and JavaScript assets use `/webcam-ts/assets/` paths.
- No runtime dependency was added.
- No controller-bound element ID was removed.

- [ ] **Step 3: Verify exact GitHub Actions head**

Wait for CI on the final commit and require every step to conclude `success`, especially frozen-lockfile install, source contracts, typechecks, package tests, playground tests, and Pages build.

- [ ] **Step 4: Update PR #2 evidence**

Record the exact head SHA, final package/playground test counts, Pages build result, and the shadcn-minimal UX scope. Keep the PR in Draft until manual camera/browser verification is complete.
