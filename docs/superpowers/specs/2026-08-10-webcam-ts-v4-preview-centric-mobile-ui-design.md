# Webcam-TS v4 Preview-Centric Mobile UI Design

## Goal

Simplify the normal playground around the live camera preview so session controls and immediate preview state stay visually attached to the video, while redundant configuration is removed.

## Scope

This is a playground presentation change only. It must not change the public Webcam-TS package API, camera lifecycle semantics, permission semantics, exact/prefer resolution behavior, capture semantics, or conformance mode.

## Approved UI changes

1. Move the existing `idle / starting / active / switching / stopping` status badge from the page heading into the preview as an overlay.
2. Move the existing `Start camera`, `Switch`, and `Stop` controls into the preview as an overlay toolbar and remove the standalone Camera session card.
3. Move the existing `Mirror preview` control into the preview as a compact overlay control and remove its settings-card row.
4. Remove the Facing mode field from the normal playground UI. Camera selection is driven by `Camera device`; no public library capability is removed.
5. Keep `Microphone audio` in Session configuration because it is request configuration rather than a preview action.
6. Keep the requested/actual resolution overlay, permission gate, capture controls, typed error panel, and exact/prefer behavior unchanged.

## Layout

The preview becomes the interaction hub:

```text
┌────────────────────────────────────┐
│ video                       [idle] │
│                                    │
│                        Requested…  │
│                        Actual…     │
│                                    │
│ [Mirror]                           │
│                                    │
│ [ Start camera ]                   │
│ [ Switch ]              [ Stop ]   │
└────────────────────────────────────┘

Session configuration
├─ Resolution preset
├─ Resolution behavior
├─ Camera device
└─ Microphone audio
```

On mobile, overlays must remain touchable and readable without covering the central preview unnecessarily. The permission gate remains interaction-authoritative while permission is not granted.

## DOM and state rules

- Reuse the existing lifecycle button IDs: `start-camera`, `switch-camera`, `stop-camera`.
- Reuse `status-badge` and `mirror-toggle` IDs so controller/renderer bindings do not require duplicate state.
- Do not create a second lifecycle toolbar or mirror control.
- Remove `facing-select` from the normal playground DOM and remove only normal-playground bindings that depend on it.
- Internal/public request support for facing mode remains available in the package; this change only removes the redundant playground selector.
- Existing disable/loading semantics for lifecycle actions remain authoritative.

## Accessibility

- Overlay controls retain explicit accessible names.
- Status remains text-readable and must not rely on color only.
- Buttons keep minimum mobile touch targets and visible `:focus-visible` treatment.
- Mirror remains a native checkbox or equivalent accessible control with a label.
- Permission overlay must continue to take precedence when access is not granted.

## Styling

- Light-theme visual direction remains unchanged.
- Overlays should use compact translucent/light surfaces only where needed for readability against camera content.
- Avoid large cards inside the video.
- No new framework, component library, icon dependency, or design-system abstraction.

## Testing

Add source-contract tests first that fail until:

- `camera-action-panel` is absent;
- lifecycle button IDs live inside `preview-shell`;
- `status-badge` lives inside `preview-shell`;
- `mirror-toggle` lives inside `preview-shell`;
- `facing-select` is absent from the normal playground;
- microphone control remains in Session configuration;
- CSS contains dedicated preview overlay rules and no mobile sticky lifecycle card behavior.

Then run package tests, playground typecheck/tests, clean-room verification, and production Pages build. Existing browser conformance must remain green because no package lifecycle semantics change.

## Non-goals

- No package API redesign.
- No conformance-mode redesign.
- No new camera switching behavior.
- No permission or resolution behavior changes.
- No unrelated settings refactor.
