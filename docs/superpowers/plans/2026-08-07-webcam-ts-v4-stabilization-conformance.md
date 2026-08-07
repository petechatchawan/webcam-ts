# Webcam-TS v4 Stabilization & Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Webcam-TS v4 against real browser behavior and physical camera hardware, harden only evidence-backed defects, and produce a release candidate that can be promoted to stable `4.0.0` without changing public API or lifecycle semantics.

**Architecture:** Keep the existing `Camera` / single-owner `CameraSession` production architecture. Add a separate conformance layer to the Vanilla TypeScript playground, add engine-level browser automation, then harden lifecycle, resolution, device, capture, permission, and controls behavior from failing evidence. Physical Tier-1 runs remain authoritative for hardware and mobile behavior that synthetic automation cannot prove.

**Tech Stack:** TypeScript 5.x, ESM, Web Platform Media Capture APIs, Vite, Node built-in test runner, Playwright for Chromium/Firefox/WebKit automation, GitHub Actions, GitHub Pages.

## Global Constraints

- Baseline is `master@c06638423956bda189c88ed7f09b185f360d711a` after planning PR merge.
- Start from `webcam-ts@4.0.0-alpha.1`; do not publish stable until every release gate in the approved design passes.
- Production code changes require an observed failing test or reproducible physical/browser failure first.
- Conformance code consumes declared public `webcam-ts` entrypoints only; it must not import package source or undeclared `dist` internals.
- `CameraSession` remains the sole lifecycle owner of active and candidate streams.
- Never add speculative Safari/iOS exclusive-camera behavior. Candidate-first atomic switching remains authoritative until Tier-1 evidence proves it cannot work.
- Exact resolution means delivered track settings must satisfy requested exact width/height when authoritative settings are exposed; it never claims native sensor mode.
- Permissions API is advisory; `getUserMedia()` remains request authority.
- `devicechange` is advisory; active-track `ended` remains session-loss authority.
- Evidence is privacy-safe by default: no raw `deviceId`, `groupId`, camera label, frames, or unrestricted error serialization.
- Physical Tier-1 release runs are mandatory, including an external USB webcam run.
- Stable Node/SSR floor becomes Node `>=22`; Node 22 and 24 are release-gated.
- Keep normal playground UX independent from conformance-mode UI and logic.
- Every PR follows RED → minimal GREEN → refactor only after GREEN → full verification.
- Do not merge a PR whose exact head has not passed its required CI gate.

---

## PR boundary map

```text
PR 1  Conformance Harness & Evidence Contract
PR 2  Automated Browser Conformance
PR 3  Lifecycle & Cancellation Hardening
PR 4  Resolution, Device & Switching Stabilization
PR 5  Capture, Controls & Permission Conformance
PR 6  Release Candidate Gate
```

Each implementation PR branches from the merged predecessor. Do not stack unverified production fixes across PR boundaries.

---

# PR 1 — Conformance Harness & Evidence Contract

**Intent:** Build the evidence system and physical-test UI without changing production package behavior.

## Task 1.1 — Conformance domain model and result authority

**Files:**
- Create: `apps/playground/src/conformance/types.ts`
- Create: `apps/playground/src/conformance/scenario-runner.ts`
- Create: `apps/playground/test/conformance-core.test.mjs`
- Modify: `apps/playground/tsconfig.test.json`

**Interfaces:**

```ts
export type ConformanceStatus = "pass" | "fail" | "blocked" | "skipped";
export type HardwareClass = "integrated" | "external" | "front" | "rear" | "unknown";

export interface ConformanceAssertion {
  readonly id: string;
  readonly passed: boolean;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly message: string;
}

export interface ConformanceObservation {
  readonly key: string;
  readonly value: unknown;
}

export interface ConformanceScenarioResult {
  readonly scenarioId: string;
  readonly status: ConformanceStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly environment: ConformanceEnvironment;
  readonly observations: readonly ConformanceObservation[];
  readonly assertions: readonly ConformanceAssertion[];
  readonly error?: SanitizedCameraError;
}
```

- [ ] **Step 1: Write RED tests** proving results cannot become `pass` merely because execution returned without throwing. Require at least one assertion and derive `fail` when any required assertion fails.
- [ ] **Step 2: Extend `tsconfig.test.json`** so conformance modules compile into `dist-test`.
- [ ] **Step 3: Run `pnpm --dir apps/playground test` and record RED.** Expected failure: conformance modules do not exist.
- [ ] **Step 4: Implement immutable result/assertion builders and a minimal sequential `ScenarioRunner`.** Runner owns orchestration only; it does not create `Camera` directly.
- [ ] **Step 5: Run focused and full playground tests to GREEN.**
- [ ] **Step 6: Commit:** `feat(playground): define conformance scenario authority`.

## Task 1.2 — Privacy sanitizer and evidence exporter

**Files:**
- Create: `apps/playground/src/conformance/privacy-sanitizer.ts`
- Create: `apps/playground/src/conformance/evidence-exporter.ts`
- Extend: `apps/playground/test/conformance-core.test.mjs`

**Required behavior:**

```text
raw deviceId          -> removed
raw groupId           -> removed
camera label          -> removed
Error.cause           -> never recursively serialized
URL query/hash        -> removed unless explicitly safe
CameraError snapshot  -> code/message/operation/recoverable + sanitized context
frame/image bytes     -> never present
```

- [ ] **Step 1: Add failing sanitizer tests** with nested objects containing `deviceId`, `groupId`, labels, URL secrets, Error causes, and Blob-like values.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement allow-list-based sanitizer.** Do not implement a blacklist-only recursive serializer.
- [ ] **Step 4: Implement deterministic JSON evidence export** with schema version, package version, tested git SHA, timestamp, environment, and results.
- [ ] **Step 5: Verify output is stable for deterministic fixtures and contains none of the forbidden fields.**
- [ ] **Step 6: Commit:** `feat(playground): add privacy-safe conformance evidence`.

## Task 1.3 — Environment collector and scenario catalog

**Files:**
- Create: `apps/playground/src/conformance/environment.ts`
- Create: `apps/playground/src/conformance/scenarios.ts`
- Extend: `apps/playground/test/conformance-core.test.mjs`

**Environment authority:** collect only information already exposed by normal browser/runtime APIs. No fingerprinting extensions or raw full UA in default evidence.

**Required scenario IDs:**

```text
runtime-secure-context
permission-request
device-enumeration
camera-start
exact-resolution-supported
exact-resolution-unsupported
ideal-resolution
camera-switch
rapid-switch
stop-pending-start
dispose-pending-switch
track-ended
external-disconnect-reconnect
preview-integrity
capture-jpeg
capture-png
capture-repeated
control-zoom
control-torch
control-focus
```

- [ ] **Step 1: Write RED tests** for stable scenario IDs, unique IDs, explicit prerequisites, and physical-confirmation metadata where required.
- [ ] **Step 2: Implement environment collector** with dependency injection for `navigator`, secure-context flag, package version, git SHA, and user-supplied hardware class.
- [ ] **Step 3: Implement immutable scenario catalog.** Unsupported optional controls must resolve to `skipped`, not `fail`.
- [ ] **Step 4: GREEN full playground suite.**
- [ ] **Step 5: Commit:** `feat(playground): catalog conformance scenarios`.

## Task 1.4 — Conformance controller separate from normal CameraController

**Files:**
- Create: `apps/playground/src/conformance/conformance-controller.ts`
- Create: `apps/playground/test/conformance-controller.test.mjs`

**Dependencies:** consume public package APIs through injected ports/adapters; reuse normal `CameraController` only where its public behavior is the subject under test. Do not let the conformance controller mutate private state of `UiRenderer` or `CameraController`.

- [ ] **Step 1: RED tests** for run-one, reset, user-confirmed physical observation, blocked prerequisite, evidence snapshot, and dispose cleanup.
- [ ] **Step 2: Verify no raw device identity enters exported result fixtures.**
- [ ] **Step 3: Implement minimal controller state machine:** `idle | running | awaiting-confirmation | complete`.
- [ ] **Step 4: Verify listener isolation and idempotent dispose.**
- [ ] **Step 5: Commit:** `feat(playground): orchestrate conformance runs`.

## Task 1.5 — Conformance mode UI and routing

**Files:**
- Create: `apps/playground/src/conformance/conformance-renderer.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/index.html`
- Modify: `apps/playground/src/styles.css`
- Create: `apps/playground/test/conformance-source-contract.test.mjs`
- Modify: `apps/playground/test/source-contract.test.mjs` only when normal-mode selectors need explicit preservation assertions.

**Routing:** `?conformance=1` activates conformance mode. Normal URL remains the existing playground with no conformance controls visible.

- [ ] **Step 1: Write source-contract RED tests** requiring conformance root, scenario selector/list, run button, result status, physical-confirmation control, hardware-class selector, export button, and normal-mode isolation.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add semantic HTML and light-theme styles.** Keep touch targets and existing 320px mobile floor.
- [ ] **Step 4: Update `main.ts`** to construct exactly one mode. Both modes share page lifecycle cleanup but not renderer state.
- [ ] **Step 5: GREEN typecheck, tests, and production build.**
- [ ] **Step 6: Commit:** `feat(playground): add physical conformance mode`.

## Task 1.6 — Manual evidence protocol

**Files:**
- Create: `docs/superpowers/conformance/webcam-ts-v4-manual-runbook.md`
- Create: `docs/superpowers/conformance/webcam-ts-v4-tier1-matrix.md`
- Modify: `README.md`

- [ ] Define exact physical prerequisites for macOS Chromium/Firefox/Safari, iOS Safari, Android Chrome, and external USB webcam.
- [ ] Define pass/fail/blocked semantics; `blocked` never counts as Tier-1 PASS.
- [ ] Define file naming: `<date>-<platform>-<browser>-<hardware>-<sha>.json` without device identity.
- [ ] Document that Playwright WebKit does not satisfy iOS Safari physical gate.
- [ ] Run clean-room verification and playground full suite.
- [ ] Commit: `docs: add v4 physical conformance runbook`.

**PR 1 gate:** package tests unchanged and green, playground tests/typecheck/build green, evidence sanitizer tests green, clean-room green, no production package source modified.

---

# PR 2 — Automated Browser Conformance

**Intent:** Run deterministic real-engine browser tests without pretending synthetic media proves physical hardware behavior.

## Task 2.1 — Playwright workspace and deterministic browser fixture

**Files:**
- Modify: `apps/playground/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/playground/playwright.config.ts`
- Create: `apps/playground/browser-test/fixture-page.ts`
- Create: `apps/playground/browser-test/public-package.spec.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add RED source/package contract** requiring Playwright projects named `chromium`, `firefox`, `webkit`.
- [ ] **Step 2: Add Playwright dev dependency and scripts:** `test:browser`, `test:browser:chromium`, `test:browser:firefox`, `test:browser:webkit`.
- [ ] **Step 3: Create a browser fixture that imports only public package entrypoints.** For deterministic lifecycle scenarios, inject `MediaDevicesPort` through `new Camera({ mediaDevices })` inside the browser; do not require physical camera access.
- [ ] **Step 4: Verify root package, preview, capture, devices, controls imports in each engine.**
- [ ] **Step 5: Commit:** `test(playground): add cross-engine conformance harness`.

## Task 2.2 — Engine-level lifecycle, preview, and capture coverage

**Files:**
- Create: `apps/playground/browser-test/lifecycle.spec.ts`
- Create: `apps/playground/browser-test/preview.spec.ts`
- Create: `apps/playground/browser-test/capture.spec.ts`
- Create: `apps/playground/browser-test/error-normalization.spec.ts`

- [ ] Add tests for start/stop state/event ordering using in-page fake streams/tracks.
- [ ] Add preview tests using real `HTMLVideoElement` DOM binding semantics while stream ownership remains fake/deterministic.
- [ ] Add capture fallback tests with a deterministic canvas/video fixture only where the engine supports the required DOM path reliably; otherwise explicitly skip with a documented reason.
- [ ] Add DOMException normalization fixtures for recognized browser names.
- [ ] Require zero unhandled rejection/pageerror/console-error events for passing scenarios.
- [ ] Run all three engines and classify engine-specific unsupported behavior as explicit skip, never silent pass.
- [ ] Commit: `test(webcam-ts): cover public APIs in Chromium Firefox and WebKit`.

## Task 2.3 — Browser conformance CI and evidence artifacts

**Files:**
- Create: `.github/workflows/browser-conformance.yml`
- Create: `scripts/verify-browser-conformance-artifact.mjs`

**CI:** run on pull requests touching package/playground/browser tests and manual dispatch. Install Playwright browsers with pinned dependency lock. Keep this separate from the fast package/playground CI.

- [ ] RED-test artifact verifier with missing engine/result cases.
- [ ] Workflow matrix runs Chromium, Firefox, WebKit independently.
- [ ] Each job uploads sanitized JSON/JUnit-like evidence and Playwright diagnostics only on failure; no camera frames.
- [ ] Aggregate job fails when any required engine job fails or required artifact is missing.
- [ ] Commit: `ci: add browser conformance matrix`.

**PR 2 gate:** all existing CI green plus Chromium/Firefox/WebKit conformance green on exact head. Automated WebKit evidence must be labeled `webkit-automation`, not `ios-safari`.

---

# PR 3 — Lifecycle & Cancellation Hardening

**Intent:** Make public operations settle promptly when acquisition is preempted even if the browser leaves `getUserMedia()` pending indefinitely.

## Task 3.1 — Operation lease invalidation settlement primitive

**Files:**
- Modify: `packages/webcam-ts/src/session/operation-controller.ts`
- Modify: `packages/webcam-ts/src/testing/fakes.ts`
- Modify: `packages/webcam-ts/test/events-operations.test.mjs`

**Interface direction:** add a one-shot invalidation promise/signal to `OperationLease`, for example `whenInvalidated(): Promise<CameraError>`. It resolves once with the final invalidation reason. Implementation must not expose new root public API.

- [ ] RED test: invalidating a lease settles `whenInvalidated()` immediately with correct `OPERATION_ABORTED`, `OPERATION_SUPERSEDED`, or `DISPOSED` semantics.
- [ ] RED test: repeated invalidation is idempotent.
- [ ] Implement minimal deferred invalidation primitive.
- [ ] GREEN focused/full package suite.
- [ ] Commit: `fix(webcam-ts): make operation invalidation observable`.

## Task 3.2 — Race media acquisition against preemption

**Files:**
- Modify: `packages/webcam-ts/src/session/camera-session.ts`
- Modify: `packages/webcam-ts/test/camera-session.test.mjs`

**Required algorithm:**

```text
openPromise = mediaDevices.open(constraints)
public await = race(openPromise, lease invalidation)

if lease invalidates first:
  reject public start/switch promptly
  attach late observer to openPromise
  if it later resolves -> stop returned stream exactly once
  if it later rejects -> consume rejection; no unhandled rejection

if open resolves first:
  continue current lease validation and candidate commit rules
```

- [ ] RED test: `start()` remains pending forever at media port; `stop()` causes `start()` to reject promptly without resolving media promise.
- [ ] RED test: `switch()` remains pending forever; `dispose()` causes it to reject promptly with `DISPOSED`.
- [ ] RED test: media promise resolves after preemption; late stream track gets exactly one `stop()` and never emits stream commit/completed success.
- [ ] RED test: late media rejection after preemption produces no unhandled rejection.
- [ ] Implement one race helper inside session boundary; browser adapter remains stateless.
- [ ] GREEN concurrency suite and browser conformance suite.
- [ ] Commit: `fix(webcam-ts): preempt pending media acquisition promptly`.

## Task 3.3 — AbortSignal integration and event-order invariants

**Files:**
- Modify: `packages/webcam-ts/src/session/camera-session.ts`
- Modify: `packages/webcam-ts/test/camera-session.test.mjs`

- [ ] RED test: request signal abort during pending acquisition rejects promptly with `OPERATION_ABORTED` even if media promise stays pending.
- [ ] RED test: event order is `operation-started` → failure/state rollback, never `operation-completed` after abort.
- [ ] Implement signal race without transferring stream ownership to AbortController.
- [ ] Verify stop/dispose idempotency and stale cleanup counts.
- [ ] Commit: `fix(webcam-ts): harden abort event ordering`.

**PR 3 gate:** package full suite, browser conformance, no unhandled rejections, zero candidate leaks in deterministic tests.

---

# PR 4 — Resolution, Device & Switching Stabilization

**Intent:** Enforce exact delivered-resolution postconditions and collect the physical evidence needed to decide switching semantics.

## Task 4.1 — Exact resolution postcondition helper

**Files:**
- Create: `packages/webcam-ts/src/session/exact-resolution-postcondition.ts`
- Modify: `packages/webcam-ts/src/session/camera-session.ts`
- Modify: `packages/webcam-ts/test/domain-lifecycle.test.mjs`
- Modify: `packages/webcam-ts/test/camera-session.test.mjs`

**Rules:** validate only exact numeric width/height values explicitly present in the request. Compare only settings that the browser actually exposes as finite positive numbers.

- [ ] RED test: exact `1920x1920`, delivered `1760x1328` rejects `CONSTRAINT_UNSATISFIED` and stops candidate.
- [ ] RED test: exact start mismatch returns idle; exact switch mismatch preserves old stream.
- [ ] RED test: ideal mismatch succeeds.
- [ ] RED test: missing authoritative width or height does not fabricate mismatch; postcondition remains unobservable.
- [ ] Implement helper returning verified/unobservable or throwing typed error with sanitized requested/actual context.
- [ ] GREEN package + playground exact-resolution tests.
- [ ] Commit: `fix(webcam-ts): verify exact delivered resolution`.

## Task 4.2 — Device/disconnect conformance scenarios

**Files:**
- Modify: `apps/playground/src/conformance/scenarios.ts`
- Modify: `apps/playground/src/conformance/conformance-controller.ts`
- Extend: `apps/playground/test/conformance-controller.test.mjs`

- [ ] Add scenarios for enumeration before/after permission, active `track ended`, advisory `devicechange`, external disconnect, explicit restart after reconnect.
- [ ] Assert raw device identity never enters evidence.
- [ ] Do not auto-reopen a reconnected device.
- [ ] GREEN playground/browser tests.
- [ ] Commit: `feat(playground): collect device disconnect evidence`.

## Task 4.3 — Physical switching evidence checkpoint

**Files:**
- Update: `docs/superpowers/conformance/webcam-ts-v4-tier1-matrix.md`
- Evidence files: `docs/superpowers/conformance/evidence/*.json` only sanitized exported reports explicitly accepted for repository retention.

**Required physical runs before changing switching architecture:**

```text
iOS Safari front -> rear -> front
Android Chrome front -> rear -> front
macOS Safari multi-camera if available
macOS Chromium integrated <-> external USB
```

- [ ] Run canonical GitHub Pages conformance mode against the exact deployed SHA.
- [ ] Record candidate-first switch outcome and normalized errors.
- [ ] If all Tier-1 runs support atomic acquisition, retain existing contract with no switch production change.
- [ ] If repeatable simultaneous-acquisition `DEVICE_BUSY` is proven, stop this PR before workaround implementation and amend the architecture spec with explicit atomic vs break-before-make semantics. Then write RED tests from that evidence before code.

**PR 4 gate:** exact postcondition automated tests green, device/disconnect evidence system green, and switching strategy either proven unchanged or explicitly amended from physical evidence. No speculative fallback is allowed.

---

# PR 5 — Capture, Controls & Permission Conformance

**Intent:** Close remaining cross-browser service gaps using evidence from PR 2/4.

## Task 5.1 — Native ImageCapture backend with explicit fallback

**Files:**
- Create: `packages/webcam-ts/src/capture/image-capture-backend.ts`
- Create: `packages/webcam-ts/src/capture/default-capture-backend.ts`
- Modify: `packages/webcam-ts/src/capture/camera-capture.ts`
- Modify: `packages/webcam-ts/src/capture/index.ts`
- Modify: `packages/webcam-ts/test/preview-capture.test.mjs`

**Selection:** native `ImageCapture` path is used only when the required operation is available; otherwise fallback to existing `CanvasCaptureBackend`. Module import must remain SSR-safe.

- [ ] RED test: importing capture subpath with no DOM/ImageCapture globals remains safe.
- [ ] RED test: native backend selected when injected ImageCapture capability is available.
- [ ] RED test: unavailable/unsupported native path falls back to canvas without stopping session tracks.
- [ ] RED test: JPEG/PNG result metadata is non-empty and consistent.
- [ ] RED test: backend dispose releases only backend resources.
- [ ] Implement minimal backend selector and native path.
- [ ] GREEN package + three-engine browser capture tests.
- [ ] Commit: `feat(webcam-ts): add native capture with canvas fallback`.

## Task 5.2 — Permission and browser-error evidence corrections

**Files:**
- Modify only if evidence requires: `packages/webcam-ts/src/devices/camera-permission-service.ts`
- Modify only if evidence requires: `packages/webcam-ts/src/platform/browser-error-normalizer.ts`
- Modify: `packages/webcam-ts/test/platform-ssr.test.mjs`
- Modify: `packages/webcam-ts/test/devices-permissions-controls.test.mjs`
- Extend conformance scenarios/tests.

- [ ] Convert each observed cross-browser discrepancy into a RED fixture before changing mapping.
- [ ] Preserve browser error names only as sanitized context.
- [ ] Do not add a new public error code unless the approved spec is amended first.
- [ ] Cover `prompt/allow`, `prompt/deny`, granted, denied, Permissions API unsupported/unknown, insecure context, and browser/site block behavior where observable.
- [ ] Commit evidence-backed correction as one focused commit per mapping family.

## Task 5.3 — Capability-driven controls physical/browser evidence

**Files:**
- Modify only if failing evidence requires: `packages/webcam-ts/src/controls/camera-controls.ts`
- Modify: `packages/webcam-ts/test/devices-permissions-controls.test.mjs`
- Extend: conformance controller/scenario tests.

- [ ] For absent torch/zoom/focus capability, scenario result is `skipped` and direct library request returns `CONTROL_UNSUPPORTED` before `applyConstraints`.
- [ ] For supported capabilities, verify range/mode validation and returned settings where observable.
- [ ] Convert real applyConstraints failure into `CONTROL_FAILED` without state/ownership corruption.
- [ ] Verify controls never call `track.stop()`.
- [ ] Commit: `test(webcam-ts): close control conformance gaps` plus production fix only if RED requires it.

**PR 5 gate:** package, playground, three-engine automation green; available physical control/capture scenarios recorded without turning absent optional capabilities into failures.

---

# PR 6 — Release Candidate Gate

**Intent:** Freeze supported runtime/API claims and produce `4.0.0-rc.1` only after the mandatory conformance matrix is complete.

## Task 6.1 — Node 22/24 runtime contract

**Files:**
- Modify: `package.json`
- Modify: `packages/webcam-ts/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Create or modify: `.github/workflows/browser-conformance.yml`
- Extend: `packages/webcam-ts/test/platform-ssr.test.mjs`
- Extend: `packages/webcam-ts/test/package-contract.test.mjs`

- [ ] RED metadata test requires `engines.node >=22` for root/package release configuration.
- [ ] CI matrix verifies package/SSR contract on Node 22 and Node 24.
- [ ] Pages build uses supported Node runtime, preferably Node 24 for the deployment build.
- [ ] Packed tarball import/construction succeeds on both supported Node majors.
- [ ] Browser-only operations still fail lazily with typed unsupported runtime error.
- [ ] Commit: `chore(webcam-ts): lock v4 Node support to 22 and 24`.

## Task 6.2 — Support matrix, known limitations, and API freeze

**Files:**
- Modify: `README.md`
- Replace/expand: `packages/webcam-ts/README.md`
- Create: `docs/superpowers/conformance/webcam-ts-v4-support-matrix.md`
- Create: `docs/superpowers/conformance/webcam-ts-v4-known-limitations.md`
- Create: `CHANGELOG.md`
- Create: `packages/webcam-ts/CHANGELOG.md` if package tarball continues to include a package-local changelog.

- [ ] Publish only browser/platform versions with retained Tier-1 evidence.
- [ ] Document exact vs ideal semantics, physical switch limitations if any, permission ambiguity, optional controls, and capture fallback semantics.
- [ ] Every README sample must be extracted/executed against a packed package in a temporary fixture.
- [ ] Assert public export list remains exactly the approved six entrypoints unless an explicit spec amendment exists.
- [ ] Commit: `docs(webcam-ts): publish v4 conformance support contract`.

## Task 6.3 — RC version gate

**Files:**
- Modify: `packages/webcam-ts/package.json`
- Modify: lockfile only if workspace metadata requires it.
- Extend: `packages/webcam-ts/test/package-contract.test.mjs`

**Hard precondition:** Tier-1 matrix contains PASS evidence for macOS Chromium integrated + external USB, macOS Firefox integrated, macOS Safari integrated, iOS Safari front/rear, Android Chrome front/rear, exact supported/unsupported cases, permission allow/deny, disconnect/recovery, JPEG/PNG capture. Open P0 = 0 and P1 = 0.

- [ ] Add RED release-contract test requiring version `4.0.0-rc.1` only when a machine-readable release-gate manifest says every mandatory gate passed.
- [ ] Create `docs/superpowers/conformance/release-gate.json` from accepted evidence summaries; it must not contain raw device identity.
- [ ] Set package version to `4.0.0-rc.1` only after gate verifier passes.
- [ ] Run package typecheck/tests/pack, playground typecheck/tests/build, three-engine conformance, Node 22/24 matrix, clean-room, and `git diff --check` equivalent in CI.
- [ ] Deploy GitHub Pages from exact merged master SHA and verify deployment record SHA equals source SHA.
- [ ] Commit: `release(webcam-ts): prepare 4.0.0-rc.1`.

## Task 6.4 — Stable promotion

Stable promotion is not an implementation feature PR. It is a verification/release step after `4.0.0-rc.1` has completed a fresh final physical Tier-1 run without public contract changes.

- [ ] Re-run physical Tier-1 matrix on the RC artifact / exact Pages SHA.
- [ ] Confirm no P0/P1 and no architecture contradiction.
- [ ] Change only version/release notes required for `4.0.0`.
- [ ] Re-run all automated gates on exact stable head.
- [ ] Publish only after explicit release authorization.

---

## Final milestone verification checklist

- [ ] Conformance harness produces assertion-based results, never exception-only pass.
- [ ] Evidence exporter cannot leak raw device identity, labels, frames, URLs with secrets, or arbitrary error causes.
- [ ] Chromium automated conformance PASS.
- [ ] Firefox automated conformance PASS.
- [ ] WebKit automated conformance PASS.
- [ ] Node 22 SSR/package PASS.
- [ ] Node 24 SSR/package PASS.
- [ ] Pending `getUserMedia()` preemption settles public operations promptly.
- [ ] Every late/stale candidate is stopped exactly once.
- [ ] Exact resolution mismatch cannot report success when settings are authoritative.
- [ ] Failed atomic switch preserves previous stream unless an evidence-backed architecture amendment explicitly changes semantics.
- [ ] Device disconnect cannot leave public state falsely active.
- [ ] JPEG/PNG native/fallback capture paths satisfy result contracts where supported.
- [ ] Unsupported torch/zoom/focus never counts as platform failure.
- [ ] Physical macOS Chromium integrated PASS.
- [ ] Physical macOS Chromium external USB PASS.
- [ ] Physical macOS Firefox integrated PASS.
- [ ] Physical macOS Safari integrated PASS.
- [ ] Physical iOS Safari front/rear PASS.
- [ ] Physical Android Chrome front/rear PASS.
- [ ] Permission allow/deny physical cases PASS.
- [ ] Disconnect/recovery physical case PASS.
- [ ] Open P0 defects = 0.
- [ ] Open P1 defects = 0.
- [ ] Support matrix and known limitations match retained evidence.
- [ ] Public API frozen and packed-package README examples verified.
- [ ] GitHub Pages deployment SHA equals the release source SHA.
- [ ] No `TODO`, `TBD`, placeholder gate, guessed capability, or unapproved compatibility claim remains.
