# Webcam-TS v4 Physical Conformance Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `?conformance=1` from a mostly-blocked catalog into a lean real-browser executor that can collect physical camera switching/disconnect evidence for PR 4 without duplicating the normal playground.

**Architecture:** Add one `BrowserConformanceExecutor` behind the existing `ConformanceScenarioExecutor` contract. It owns only browser camera/device operations and ephemeral primary/alternate device selections; `ConformanceController` remains the sole evidence/state authority and `ConformanceRenderer` gains only the minimum preview/device selectors required by Task 4.3.

**Tech Stack:** TypeScript 5.9, Vite, public `webcam-ts` package entrypoints, Node test runner, existing Playwright Chromium/Firefox/WebKit conformance matrix.

## Global Constraints

- Keep the implementation clean and lean; no speculative abstraction or generic workflow engine.
- Do not reuse the normal playground `CameraController`.
- Do not add or change public `webcam-ts` package API.
- Candidate-first switching remains authoritative; no break-before-make fallback or browser-specific workaround.
- Raw `deviceId`, `groupId`, and camera labels are runtime-only and must never enter retained evidence.
- `devicechange` is advisory only; active-track `ended`/session-ended is session-loss authority.
- Reconnect never auto-opens a camera; restart is explicit-only.
- Capture/control/permission edge-case expansion remains PR 5 scope.
- Other conformance scenarios may remain BLOCKED until their owning PR.

---

## File Map

- Create `apps/playground/src/conformance/browser-conformance-executor.ts` — focused browser executor plus minimal runtime device-selection API.
- Create `apps/playground/test/browser-conformance-executor.test.mjs` — deterministic executor tests with injected fake camera/device/permission/preview ports.
- Modify `apps/playground/src/conformance/conformance-renderer.ts` — primary/alternate selector bindings and post-run device option refresh only.
- Modify `apps/playground/index.html` — one conformance preview plus two device selectors.
- Modify `apps/playground/src/conformance/conformance.css` — minimal preview/selector layout using existing light-theme tokens.
- Modify `apps/playground/src/main.ts` — replace the hard-coded BLOCKED executor with the real browser executor and a narrow prerequisite checker.
- Modify `apps/playground/test/source-contract.test.mjs` — source-level regression guard that conformance mode is wired to the real executor and does not duplicate the normal controller.

---

### Task 1: Browser executor lifecycle and privacy seam

**Files:**
- Create: `apps/playground/src/conformance/browser-conformance-executor.ts`
- Create: `apps/playground/test/browser-conformance-executor.test.mjs`
- Modify: `apps/playground/tsconfig.test.json` only if the new source file is not already included by the existing glob.

**Interfaces:**
- Consumes: `ConformanceScenarioExecutor`, `ConformanceScenarioDefinition`, `ConformanceScenarioExecution`, public `CameraRequest`/camera event shapes.
- Produces:

```ts
export interface ConformanceDeviceOption {
  readonly id: string;   // runtime-only
  readonly label: string; // runtime-only display text
}

export interface ConformanceDeviceRuntime {
  refreshDeviceOptions(): Promise<readonly ConformanceDeviceOption[]>;
  setPrimaryDeviceId(deviceId: string): void;
  setAlternateDeviceId(deviceId: string): void;
}

export interface BrowserConformanceExecutorDependencies {
  readonly camera: {
    start(request?: CameraRequest): Promise<void>;
    switch(request: CameraRequest): Promise<void>;
    getState(): CameraState;
    subscribe(listener: CameraEventListener): () => void;
    dispose(): Promise<void>;
  };
  readonly devices: {
    list(): Promise<readonly CameraDevice[]>;
    subscribe(listener: (devices: readonly CameraDevice[]) => void): () => void;
    dispose(): void;
  };
  readonly permissions: {
    query(): Promise<CameraPermissionMap>;
    request(request?: Readonly<{ video?: boolean; audio?: boolean }>): Promise<CameraPermissionMap>;
  };
  readonly preview: { dispose(): void };
}
```

`BrowserConformanceExecutor` implements both `ConformanceScenarioExecutor` and `ConformanceDeviceRuntime`.

- [ ] **Step 1: Write RED tests for lifecycle/privacy seam**

Add tests that instantiate `BrowserConformanceExecutor` with fakes and assert:

```js
const executor = new BrowserConformanceExecutor(fakes);
const options = await executor.refreshDeviceOptions();
assert.deepEqual(options.map(({ label }) => label), ["Camera 1", "Camera 2"]);
executor.setPrimaryDeviceId("raw-primary-id");
executor.setAlternateDeviceId("raw-alternate-id");
await executor.dispose();
await executor.dispose();
assert.equal(fakes.camera.disposeCalls, 1);
assert.equal(fakes.devices.disposeCalls, 1);
assert.equal(fakes.preview.disposeCalls, 1);
```

Also assert no `ConformanceScenarioExecution` produced by the executor contains the selected raw IDs or raw labels.

- [ ] **Step 2: Run RED test**

Run:

```bash
pnpm --dir apps/playground test
```

Expected: FAIL because `browser-conformance-executor.js` does not exist.

- [ ] **Step 3: Implement minimal executor state and cleanup**

Implement only:

```ts
export class BrowserConformanceExecutor
  implements ConformanceScenarioExecutor, ConformanceDeviceRuntime {
  private primaryDeviceId = "";
  private alternateDeviceId = "";
  private activeRole: "primary" | "alternate" | "unknown" = "unknown";
  private disposed = false;
  private cameraUnsubscribe: (() => void) | null = null;
  private deviceUnsubscribe: (() => void) | null = null;

  async refreshDeviceOptions(): Promise<readonly ConformanceDeviceOption[]> { /* list + neutral aliases */ }
  setPrimaryDeviceId(deviceId: string): void { this.primaryDeviceId = deviceId; }
  setAlternateDeviceId(deviceId: string): void { this.alternateDeviceId = deviceId; }
  async execute(definition: ConformanceScenarioDefinition): Promise<ConformanceScenarioExecution> { /* runtime-secure-context only at this task */ }
  async dispose(): Promise<void> { /* idempotent unsubscribe + preview/devices/camera cleanup */ }
}
```

Do not introduce a second state store or a generic scenario registry.

- [ ] **Step 4: Run GREEN test**

Run:

```bash
pnpm --dir apps/playground test
pnpm --dir apps/playground typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/conformance/browser-conformance-executor.ts apps/playground/test/browser-conformance-executor.test.mjs apps/playground/tsconfig.test.json
git commit -m "test(playground): add physical conformance executor seam"
```

---

### Task 2: Real PR 4 scenario execution

**Files:**
- Modify: `apps/playground/src/conformance/browser-conformance-executor.ts`
- Modify: `apps/playground/test/browser-conformance-executor.test.mjs`

**Interfaces:**
- Consumes the Task 1 executor and runtime role selections.
- Produces real execution for exactly:
  - `runtime-secure-context`
  - `permission-request`
  - `device-enumeration-before-permission`
  - `device-enumeration-after-permission`
  - `camera-start`
  - `camera-switch`
  - `rapid-switch`
  - `track-ended`
  - `devicechange-advisory`
  - `external-disconnect`
  - `external-reconnect-explicit-restart`

Unsupported catalog entries return an explicit BLOCKED execution with one observation `scenario.supported=false`; they never PASS accidentally.

- [ ] **Step 1: Write RED tests for start/switch semantics**

Tests must prove:

```js
executor.setPrimaryDeviceId("A");
executor.setAlternateDeviceId("B");
await executor.execute(getConformanceScenario("camera-start"));
assert.deepEqual(fakeCamera.startRequests, [{ deviceId: "A" }]);

const firstSwitch = await executor.execute(getConformanceScenario("camera-switch"));
assert.deepEqual(fakeCamera.switchRequests, [{ deviceId: "B" }]);
assert.equal(fakeCamera.stopCalls ?? 0, 0); // no manual pre-stop
assert.equal(firstSwitch.observations.some((o) => o.value === "B"), false);

await executor.execute(getConformanceScenario("camera-switch"));
assert.deepEqual(fakeCamera.switchRequests, [{ deviceId: "B" }, { deviceId: "A" }]);
```

Switch execution must expose only sanitized observations such as `direction`, `activeRole`, `status`, `width`, `height`, `facingMode`.

- [ ] **Step 2: Write RED tests for failure and event authority**

Cover:

```js
// failed switch
fakeCamera.failNextSwitch({ code: "DEVICE_BUSY", operation: "switch" });
const failed = await executor.execute(getConformanceScenario("camera-switch"));
assert.equal(failed.assertions.every((a) => a.passed), false);
assert.equal(failed.error?.code, "DEVICE_BUSY");
assert.equal(failed.observations.some((o) => String(o.value).includes("raw-")), false);

// devicechange advisory does not start/switch
fakeDevices.emitDeviceChange();
const advisory = await executor.execute(getConformanceScenario("devicechange-advisory"));
assert.equal(fakeCamera.startRequests.length, priorStarts);
assert.equal(fakeCamera.switchRequests.length, priorSwitches);

// session ended is authority
fakeCamera.emitSessionEnded();
const ended = await executor.execute(getConformanceScenario("track-ended"));
assert.equal(ended.assertions.find((a) => a.id === "session-ended").passed, true);
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
pnpm --dir apps/playground test
```

Expected: FAIL because Task 1 executor does not yet implement these scenarios.

- [ ] **Step 4: Implement minimal scenario switch**

Use a direct `switch (definition.id)` in the executor. Keep each branch short and return `ConformanceScenarioExecution` directly; do not add handler classes.

Camera selection must use only:

```ts
const request = (deviceId: string): CameraRequest => ({ deviceId });
```

Do not attach exact width/height constraints to switching evidence because resolution failure would confound switching behavior.

For `camera-switch`, toggle the runtime role only after successful public `camera.switch()`.

For `rapid-switch`, issue the minimal A→B→A sequence through `camera.switch()` and assert final state is active; do not add retry/backoff.

For `external-reconnect-explicit-restart`, call `camera.start({ deviceId: selectedExternalId })` only when the scenario is explicitly run.

- [ ] **Step 5: GREEN executor tests**

Run:

```bash
pnpm --dir apps/playground test
pnpm --dir apps/playground typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/playground/src/conformance/browser-conformance-executor.ts apps/playground/test/browser-conformance-executor.test.mjs
git commit -m "feat(playground): execute physical camera conformance"
```

---

### Task 3: Lean conformance preview and device-role UI

**Files:**
- Modify: `apps/playground/index.html`
- Modify: `apps/playground/src/conformance/conformance-renderer.ts`
- Modify: `apps/playground/src/conformance/conformance.css`
- Modify: `apps/playground/test/source-contract.test.mjs`

**Interfaces:**
- `ConformanceRenderer` receives one additional structural dependency:

```ts
export interface ConformanceDeviceRuntime {
  refreshDeviceOptions(): Promise<readonly ConformanceDeviceOption[]>;
  setPrimaryDeviceId(deviceId: string): void;
  setAlternateDeviceId(deviceId: string): void;
}
```

- [ ] **Step 1: Write RED source/UI contracts**

Assert that conformance markup contains exactly one:

```text
#conformance-preview
#conformance-primary-device
#conformance-alternate-device
```

and that `ConformanceRenderer` binds those selectors to `ConformanceDeviceRuntime` without importing or instantiating the normal `CameraController`.

Also assert conformance CSS uses the existing light-theme variables and does not introduce a second theme token system.

- [ ] **Step 2: Run RED playground tests**

```bash
pnpm --dir apps/playground test
```

Expected: source-contract failures for missing preview/device-role UI.

- [ ] **Step 3: Add minimal markup**

Inside the existing Run configuration card add:

```html
<div class="conformance-preview-shell">
  <video id="conformance-preview" aria-label="Conformance camera preview"></video>
</div>
<label class="field">
  <span class="field-label">Primary camera</span>
  <select id="conformance-primary-device"></select>
</label>
<label class="field">
  <span class="field-label">Alternate camera</span>
  <select id="conformance-alternate-device"></select>
</label>
```

No additional lifecycle buttons are added; scenario execution remains the only action surface.

- [ ] **Step 4: Bind runtime selections and refresh after relevant runs**

`ConformanceRenderer` populates both selectors from `refreshDeviceOptions()`, calls the appropriate setter on `change`, and refreshes options after `permission-request` / enumeration scenarios. Device IDs remain option values only; result text never displays them.

- [ ] **Step 5: Add minimal CSS**

Use one compact preview rule and existing card/field tokens. Preserve `object-fit: contain`, mobile-first width, and no dark-theme block.

- [ ] **Step 6: GREEN UI tests**

```bash
pnpm --dir apps/playground test
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/playground/index.html apps/playground/src/conformance/conformance-renderer.ts apps/playground/src/conformance/conformance.css apps/playground/test/source-contract.test.mjs
git commit -m "feat(playground): add lean physical conformance controls"
```

---

### Task 4: Browser bootstrap, prerequisite gate, and exact-head verification

**Files:**
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/test/source-contract.test.mjs`
- Update PR #7 description with final exact-head evidence; no production docs rewrite unless behavior differs from the approved design.

**Interfaces:**
- `bootstrapConformance()` creates one `Camera`, one `VideoPreview`, one `CameraDeviceManager`, one `CameraPermissionService`, one `BrowserConformanceExecutor`, then passes the executor to both controller and renderer.

- [ ] **Step 1: Write RED bootstrap contract**

Assert `main.ts`:

```text
imports BrowserConformanceExecutor
constructs VideoPreview for #conformance-preview
passes BrowserConformanceExecutor to ConformanceController
passes the same executor as ConformanceDeviceRuntime to ConformanceRenderer
does not contain "Scenario execution is added in a later stabilization PR."
does not create CameraController in conformance mode
```

- [ ] **Step 2: Run RED source contract**

```bash
pnpm --dir apps/playground test
```

Expected: FAIL because `main.ts` still uses the stub executor.

- [ ] **Step 3: Replace only the conformance stub wiring**

Keep `bootstrapPlayground()` unchanged. In `bootstrapConformance()` instantiate public package services directly and bind `VideoPreview` to the same `Camera` used by `BrowserConformanceExecutor`.

Prerequisite checker stays deliberately narrow:

```ts
const supportedScenarioIds = new Set([
  "runtime-secure-context",
  "permission-request",
  "device-enumeration-before-permission",
  "device-enumeration-after-permission",
  "camera-start",
  "camera-switch",
  "rapid-switch",
  "track-ended",
  "devicechange-advisory",
  "external-disconnect",
  "external-reconnect-explicit-restart",
]);
```

For these scenarios, runtime prerequisites are checked from secure context + executor selection/session state. All other catalog entries remain BLOCKED with an explicit owning-PR reason.

- [ ] **Step 4: Run full local-equivalent verification**

```bash
pnpm install --frozen-lockfile
node scripts/verify-playground-clean-room.mjs
pnpm --dir packages/webcam-ts typecheck
pnpm --dir packages/webcam-ts test
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
pnpm --dir apps/playground build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/playground/src/main.ts apps/playground/test/source-contract.test.mjs
git commit -m "feat(playground): wire real physical conformance executor"
```

- [ ] **Step 6: Verify exact PR head in CI**

Required GREEN evidence before physical deployment:

```text
Lean CI: success
Package tests: all pass
Playground tests: all pass
GitHub Pages production build: success
Browser Conformance: chromium success
Browser Conformance: firefox success
Browser Conformance: webkit success
Browser evidence aggregate: success
```

- [ ] **Step 7: Diff review**

Confirm no unrelated package API changes, no normal playground lifecycle duplication, no browser-specific fallback, and no raw identity observation/export path.

- [ ] **Step 8: Physical checkpoint**

Deploy the exact PR head SHA to GitHub Pages, verify the page-stamped SHA matches, then run:

```text
iOS Safari: front -> rear -> front
Android Chrome: front -> rear -> front
macOS Safari: camera A <-> B when available
macOS Chromium: integrated <-> external USB
```

If candidate-first passes, keep switching architecture unchanged. If repeatable `DEVICE_BUSY` is retained, stop PR 4 before workaround code and amend the architecture first.

---

## Completion Gate

PR #7 remains Draft until Task 4 exact-head automated verification is green and physical switching evidence is collected. The implementation is complete only when the conformance runner can perform the physical scenarios from the canonical Pages URL without exposing raw device identity and without altering the established camera lifecycle contract.
