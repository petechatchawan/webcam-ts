# Webcam-TS Reference-Inspired Mobile Shell Design

## Goal

Refine the normal Vite playground so the camera area follows the proven UX pattern from the supplied Webcam-TS reference screenshots while preserving Webcam-TS v4 behavior and public API contracts.

## Scope

This is presentation and interaction placement only. Camera lifecycle, candidate-first switching, typed errors, exact/prefer resolution semantics, capture behavior, permission authority, controls, and conformance mode remain unchanged.

## Approved UX

### Camera card

The camera preview remains the primary surface. Before camera permission is granted, the same surface presents a centered camera-off state with explanatory copy and one prominent **Allow camera access** action. Once permission is granted but the session is idle, the surface presents the idle camera state without hiding the rest of the page. Once active, the video fills the media area using `object-fit: contain`.

A compact information strip belongs directly below the media area and shows the selected/active camera label and actual delivered resolution when available. Requested/actual resolution diagnostics remain available without becoming the primary visual content.

### Sticky footer actions

The mobile page has a persistent safe-area-aware footer modeled after the reference:

- **Start** — primary action; calls the existing `controller.start(...)` path.
- **Capture** — neutral action; enabled only while active; calls the existing capture path.
- **Stop** — destructive action; calls the existing `controller.stop()` path.

The footer reuses the existing element IDs `start-camera`, `capture-photo`, and `stop-camera` so controller bindings remain single-source and no duplicate state is introduced.

### Session configuration

`Switch` is not in the sticky footer. It is placed next to camera selection inside **Session configuration**, because switching is semantically coupled to the target camera selection. The existing `switch-camera` ID and `controller.switch(...)` behavior are preserved.

Session configuration keeps:

- Camera device
- Resolution preset
- Resolution behavior
- Switch camera action
- Mirror preview
- Microphone audio

Facing mode remains absent; device selection is the playground camera-selection authority.

### Permission behavior

The permission gate is rendered within the media area and remains the highest-interaction layer until camera permission is granted. It does not silently call Start after permission. Permission and session start remain separate explicit actions.

### Responsive behavior

The sticky action footer is fixed/sticky at the bottom on mobile and accounts for `env(safe-area-inset-bottom)`. Main content receives enough bottom padding that settings and diagnostics are never hidden behind it. On wider screens the same action bar may remain sticky but is constrained to the playground container width.

## Accessibility

- Existing button IDs and semantic button elements are reused.
- Disabled states continue to come from `PlaygroundSnapshot.availability` and camera status.
- Permission copy remains in a polite live region.
- Focus-visible treatment remains available on all footer and settings actions.
- Sticky footer does not cover focused form controls.

## Non-goals

- No new framework or dependency.
- No public package API changes.
- No lifecycle or switching architecture changes.
- No conformance-mode redesign.
- No automatic start after permission.
- No duplicate session controls.
