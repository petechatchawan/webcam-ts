# Webcam-TS v4 Orientation-Equivalent Exact Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exact camera resolution robust to mobile/tablet width-height orientation swaps without weakening Exact semantics.

**Architecture:** Keep `CameraSession` as the operation orchestrator. Add small focused helpers beside the existing exact-resolution postcondition: one helper validates direct/rotated equality and one derives the single swapped exact acquisition request. `CameraSession` performs at most one eligible retry inside the same operation lease and preserves candidate-first switch semantics.

**Tech Stack:** TypeScript 5.9, Media Capture Web APIs, node:test, existing browser-conformance Playwright matrix.

## Global Constraints

- No UA/mobile/tablet detection.
- Exact accepts only direct `W×H` or rotated `H×W` equality when both dimensions are exact.
- Ideal/Prefer closest behavior is unchanged.
- Square requests do not trigger an orientation retry.
- Partial exact constraints retain current per-axis semantics.
- Actual `MediaTrackSettings` are never rewritten.
- Retry only after browser resolution-constraint failure on width or height.
- Retry stays inside the same operation lease and remains preemptible by stop/dispose/abort/supersede.
- Switch remains candidate-first and preserves the previous active stream on failure.
- A non-resolution failure on the swapped attempt must retain its own error semantics rather than be relabeled as an orientation failure.
- No unnecessary public API changes or strategy/service hierarchy.

---

### Task 1: Define orientation-equivalent postcondition

**Files:**
- Test: `packages/webcam-ts/test/orientation-equivalent-exact-resolution.test.mjs`
- Modify: `packages/webcam-ts/src/session/exact-resolution-postcondition.ts`

**Interfaces:**
- Consumes: `CameraRequest`, `MediaTrackSettings`
- Produces: `verifyExactResolutionPostcondition()` accepting direct or swapped exact dimension pairs when both dimensions are exact.

- [ ] **Step 1: Write failing tests** for `720×1280` requested / `1280×720` actual PASS, genuine `1920×1080` mismatch FAIL, and partial-exact semantics unchanged.
- [ ] **Step 2: Run package tests** and confirm the rotated-equivalent test fails with `CONSTRAINT_UNSATISFIED`.
- [ ] **Step 3: Implement minimal matching logic**: compare swapped axes only when both requested exact dimensions are present; otherwise use existing per-axis checks.
- [ ] **Step 4: Run package tests** and confirm the postcondition matrix passes.
- [ ] **Step 5: Commit** the postcondition RED/GREEN change.

### Task 2: Add one swapped exact acquisition retry

**Files:**
- Test: `packages/webcam-ts/test/orientation-equivalent-exact-resolution.test.mjs`
- Modify: `packages/webcam-ts/src/session/camera-session.ts`
- Modify: `packages/webcam-ts/src/session/exact-resolution-postcondition.ts`

**Interfaces:**
- Consumes: exact `CameraRequest`, browser acquisition failure, `OperationLease`
- Produces: at most two media-open attempts: original exact pair, then swapped exact pair.

- [ ] **Step 1: Write failing start tests** where original `720×1280` acquisition throws `OverconstrainedError` and swapped `1280×720` succeeds; assert two open calls and final active state.
- [ ] **Step 2: Write failing exclusion tests** proving no swapped retry for permission/non-resolution errors, ideal requests, square requests, and partial-exact requests.
- [ ] **Step 3: Run package tests** and confirm only new retry tests fail.
- [ ] **Step 4: Implement minimal retry orchestration** inside `CameraSession`; re-check request/lease before retry; copy the request with width/height exact constraints swapped and all other fields preserved.
- [ ] **Step 5: On true dual-orientation resolution failure**, preserve `CONSTRAINT_UNSATISFIED` and attach requested dimensions plus `orientationRetryAttempted: true`.
- [ ] **Step 6: Run package tests** and confirm retry/exclusion coverage passes.
- [ ] **Step 7: Commit** acquisition retry implementation.

### Task 3: Preserve switch and concurrency invariants

**Files:**
- Test: `packages/webcam-ts/test/orientation-equivalent-exact-resolution.test.mjs`
- Modify: `packages/webcam-ts/src/session/camera-session.ts` only if tests expose a gap.

**Interfaces:**
- Consumes: same retry helper/orchestration from Task 2.
- Produces: candidate-first switching through both orientation attempts without disturbing current stream ownership.

- [ ] **Step 1: Test switch success**: active A; B original orientation constraint-fails; B swapped succeeds; assert A stays live until B commits, then A stops.
- [ ] **Step 2: Test dual-failure switch**: both B orientation attempts resolution-fail; assert A remains active and unstopped.
- [ ] **Step 3: Test operation invalidation** during swapped retry; assert late streams are stopped and no stale candidate commits.
- [ ] **Step 4: Run package tests**, implement only any missing lease/current checks, then rerun to GREEN.
- [ ] **Step 5: Commit** concurrency/switch hardening if production changes were required.

### Task 4: Preserve secondary-constraint diagnostics

**Files:**
- Test: `packages/webcam-ts/test/orientation-equivalent-exact-resolution.test.mjs`
- Modify: `packages/webcam-ts/src/session/camera-session.ts`

**Interfaces:**
- Consumes: a swapped retry whose second browser failure may target a constraint other than width/height.
- Produces: only width/height dual failures receive orientation retry context; other failures retain the normalized browser constraint unchanged.

- [ ] **Step 1: Write a failing test**: original attempt fails `width`, swapped attempt fails `frameRate`; assert final context keeps `constraint: "frameRate"` and omits `orientationRetryAttempted`.
- [ ] **Step 2: Run package tests** and confirm this single edge case fails for the intended reason.
- [ ] **Step 3: Restrict dual-orientation wrapping** to second-attempt width/height constraint failure only.
- [ ] **Step 4: Run package tests** and confirm the edge case and all existing orientation tests pass.

### Task 5: Playground and full verification

**Files:**
- No Playground production change unless verification exposes a projection defect.
- Update PR description with RED/GREEN evidence only after exact-head verification.

- [ ] **Step 1: Verify raw settings contract** through the package regression: requested `720×1280` may produce active state with raw actual `1280×720` and no camera error.
- [ ] **Step 2: Run full package verification**: typecheck, unit tests, packed exports, npm tarball verification.
- [ ] **Step 3: Run playground clean-room, typecheck, tests, and GitHub Pages artifact build.**
- [ ] **Step 4: Run Browser Conformance** for Chromium, Firefox, WebKit, and aggregate evidence.
- [ ] **Step 5: Review PR diff** for scope, no UA detection, no public API expansion, and no unrelated refactor.
- [ ] **Step 6: Leave integration decision at the PR gate unless merge into `master` has been explicitly authorized for this fix.**
