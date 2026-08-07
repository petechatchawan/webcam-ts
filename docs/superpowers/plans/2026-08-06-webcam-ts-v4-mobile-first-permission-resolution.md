# Webcam-TS v4 Mobile-First Permission and Resolution Plan

## Task 1 — RED contracts

Files:
- `apps/playground/test/playground-logic.test.mjs`
- `apps/playground/test/camera-controller.test.mjs`
- `apps/playground/test/source-contract.test.mjs`

Add failing contracts for:
- 19 immutable grouped resolution presets
- permission-gated start behavior
- requested and actual resolution overlays
- mobile-first preview/layout hooks

Verify the playground test job fails only on the new requirements.

## Task 2 — Resolution domain

Files:
- `apps/playground/src/models.ts`
- `apps/playground/src/playground-logic.ts`
- `apps/playground/src/dom.ts`

Implement typed resolution presets, lookup/parsing helpers, permission predicate, and requested-resolution snapshot projection.

## Task 3 — Controller permission and request state

Files:
- `apps/playground/src/camera-controller.ts`

Block start/switch until camera permission is granted, project `PERMISSION_REQUIRED`, and commit requested resolution only after a successful start/switch. Clear it on stop.

## Task 4 — Mobile-first UI

Files:
- `apps/playground/index.html`
- `apps/playground/src/ui-renderer.ts`
- `apps/playground/src/styles.css`

Implement:
- preview permission overlay and primary allow action
- grouped resolution options
- requested/actual resolution badges
- dynamic preview aspect ratio
- mobile-first single-column spacing and touch targets
- non-cropping portrait/square video

## Task 5 — GREEN verification

Run through GitHub CI:
- frozen lockfile install
- package typecheck and 40 tests
- playground typecheck
- playground tests
- Pages-path build

Keep PR #2 in Draft for real-device verification.
