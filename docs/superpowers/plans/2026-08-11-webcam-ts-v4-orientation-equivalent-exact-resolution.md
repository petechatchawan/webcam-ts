# Webcam-TS v4 Orientation-Equivalent Exact Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exact camera resolution robust to mobile/tablet width-height orientation swaps without weakening Exact semantics.

**Architecture:** Keep `CameraSession` as the operation orchestrator. Add small focused helpers beside the existing exact-resolution postcondition: one helper classifies exact dimension pairs and validates direct/rotated equality, and one helper derives the single swapped exact acquisition request. `CameraSession` performs at most one eligible retry inside the same operation lease and preserves candidate-first switch semantics.

**Tech Stack:** TypeScript 5.9, Node 24 verification baseline, Media Capture Web APIs, node:test, existing browser-conformance Playwright matrix.

## Global Constraints

- No UA/mobile/tablet detection.
- Exact accepts only direct `W×H` or rotated `H×W` equality when both dimensions are exact.
- Ideal/Prefer closest behavior is unchanged.
- Square requests do not trigger an orientation retry.
- Partial exact constraints retain current per-axis semantics.
- Actual `MediaTrackSettings` are never rewritten.
- Retry only after browser resolution-constraint failure.
- Retry stays inside the same operation lease and remains preemptible by stop/dispose/abort/supersede.
- Switch remains candidate-first and preserves the previous active stream on failure.
- No unnecessary public API changes or strategy/service hierarchy.

---

### Task 1: Define orientation-equivalent postcondition

**Files:**
- Modify: `packages/webcam-ts/test/domain-lifecycle.test.mjs`
- Modify: `packages/webcam-ts/src/session/exact-resolution-postcondition.ts`

**Interfaces:**
- Consumes: `CameraRequest`, `MediaTrackSettings`
- Produces: `verifyExactResolutionPostcondition()` accepting direct or swapped exact dimension pairs when both dimensions are exact.

- [ ] **Step 1: Write failing tests** for `720×1280` requested / `1280×720` actual PASS, genuine `1920×1080` mismatch FAIL, square exact PASS, and partial-exact semantics unchanged.
- [ ] **Step 2: Run package tests** and confirm the rotated-equivalent test fails with `CONSTRAINT_UNSATISFIED`.
- [ ] **Step 3: Implement minimal matching logic**: only compare swapped axes when both requested exact dimensions are present; otherwise use existing per-axis checks.
- [ ] **Step 4: Run package tests** and confirm the postcondition matrix passes.
- [ ] **Step 5: Commit** the postcondition RED/GREEN change.

### Task 2: Add one swapped exact acquisition retry

**Files:**
- Modify: `packages/webcam-ts/test/domain-lifecycle.test.mjs`
- Modify: `packages/webcam-ts/src/session/camera-session.ts`
- Optionally create one focused helper under `packages/webcam-ts/src/session/` only if it keeps request derivation isolated and smaller than inline session code.

**Interfaces:**
- Consumes: exact `CameraRequest`, browser acquisition failure, `OperationLease`
- Produces: at most two media-open attempts: original exact pair, then swapped exact pair.

- [ ] **Step 1: Write failing start tests** where original `720×1280` acquisition throws `OverconstrainedError` and swapped `1280×720` succeeds; assert two open calls and final active state.
- [ ] **Step 2: Write failing exclusion tests** proving no swapped retry for `NotAllowedError`, `NotReadableError`, `NotFoundError`, `SecurityError`, `AbortError`, generic errors, ideal requests, square requests, and partial-exact requests.
- [ ] **Step 3: Run package tests** and confirm only new retry tests fail.
- [ ] **Step 4: Implement minimal retry orchestration** inside `CameraSession`, normalizing the first acquisition error only enough to decide whether it is `CONSTRAINT_UNSATISFIED`; re-check request/lease before retry; copy request with width/height exact values swapped and all other fields preserved.
- [ ] **Step 5: On final resolution failure**, preserve `CONSTRAINT_UNSATISFIED` and attach requested dimensions plus `orientationRetryAttempted: true` without exposing duplicate raw browser errors.
- [ ] **Step 6: Run package tests** and confirm retry/exclusion coverage passes.
- [ ] **Step 7: Commit** acquisition retry implementation.

### Task 3: Preserve switch and concurrency invariants

**Files:**
- Modify: `packages/webcam-ts/test/domain-lifecycle.test.mjs`
- Modify: `packages/webcam-ts/src/session/camera-session.ts` only if Task 2 tests expose a gap.

**Interfaces:**
- Consumes: same retry helper/orchestration from Task 2.
- Produces: candidate-first switching through both orientation attempts without disturbing current stream ownership.

- [ ] **Step 1: Write failing switch test**: active A; B original orientation constraint-fails; B swapped succeeds; assert A remains live until B commits, then A stops.
- [ ] **Step 2: Write failing dual-failure switch test**: both B attempts resolution-fail; assert A remains active and unstopped.
- [ ] **Step 3: Write operation-invalidation tests** for stop/dispose/signal abort while the first acquisition is failing or before swapped retry commits; assert late streams are stopped and no stale candidate commits.
- [ ] **Step 4: Run package tests**, implement only any missing lease/current checks, then rerun to GREEN.
- [ ] **Step 5: Commit** concurrency/switch hardening if production changes were required.

### Task 4: Playground regression and diagnostics

**Files:**
- Modify: `apps/playground/test/*` only where a package-level production regression can be represented without duplicating core logic.
- Modify: `apps/playground/src/playground-logic.ts` only if error projection needs the new retry context; do not change normal UI behavior unnecessarily.

**Interfaces:**
- Consumes: package `CameraError` and raw `CameraState.settings`
- Produces: requested `720×1280` may coexist with actual `1280×720` while session is active and diagnostics show raw actual dimensions.

- [ ] **Step 1: Add regression coverage** proving rotated-equivalent exact success does not become a playground error and raw actual dimensions remain visible.
- [ ] **Step 2: Verify the friendly failure message still describes true dual-orientation failure accurately if `orientationRetryAttempted` is present.
- [ ] **Step 3: Run playground typecheck/tests** and make only minimal projection changes required by the new context.
- [ ] **Step 4: Commit** playground regression coverage.

### Task 5: Full verification and merge

**Files:**
- Update PR description with RED/GREEN evidence only; no production file changes unless verification uncovers a real defect.

- [ ] **Step 1: Run full package verification**: typecheck, unit tests, packed exports, npm tarball verification.
- [ ] **Step 2: Run playground clean-room, typecheck, tests, and GitHub Pages artifact build.**
- [ ] **Step 3: Run Browser Conformance** for Chromium, Firefox, WebKit, and aggregate evidence.
- [ ] **Step 4: Review PR diff** for scope, no UA detection, no public API expansion, and no unrelated refactor.
- [ ] **Step 5: Merge using squash with expected exact head SHA.**
- [ ] **Step 6: Verify post-merge `master` CI and GitHub Pages deployment use the squash merge SHA and complete successfully.**