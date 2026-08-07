# Webcam-TS v4 Mobile-First Permission and Resolution UX

Date: 2026-08-06
Status: Approved

## Objective

Optimize the Vanilla TypeScript playground for camera testing on mobile devices while preserving the v4 public package boundary and GitHub Pages deployment.

## Decisions

### Mobile-first layout

- The base layout targets 320–480 px mobile viewports.
- Live preview remains the first operational surface.
- Lifecycle controls use full-width touch targets and remain easy to reach.
- Desktop layout is an enhancement applied with min-width media queries.
- The preview aspect ratio follows the selected preset while idle and the negotiated stream dimensions while active.
- Video uses `object-fit: contain` so portrait and square streams are not cropped.

### Permission gate

- Camera access is a hard prerequisite for `start()` and `switch()`.
- Unknown, prompt, unsupported, and denied states show a prominent overlay in the preview.
- The overlay contains the primary `Allow camera access` action.
- The existing permission card remains available for diagnostics.
- UI controls and controller commands cannot bypass the permission gate.
- A blocked operation returns a projected recoverable playground error with code `PERMISSION_REQUIRED`.

### Resolution presets

The playground exposes 19 immutable presets grouped as Portrait, Landscape, and Square:

- PORTRAIT-360P 360x640
- PORTRAIT-480P 480x854
- PORTRAIT-720P 720x1280
- PORTRAIT-1080P 1080x1920
- PORTRAIT-2K 1440x2560
- PORTRAIT-4K 2160x3840
- LANDSCAPE-360P 640x360
- LANDSCAPE-480P 854x480
- LANDSCAPE-720P 1280x720
- LANDSCAPE-1080P 1920x1080
- LANDSCAPE-2K 2560x1440
- LANDSCAPE-4K 3840x2160
- SQUARE-360 360x360
- SQUARE-480 480x480
- SQUARE-720 720x720
- SQUARE-1080 1080x1080
- SQUARE-1920 1920x1920
- SQUARE-2K 2048x2048
- SQUARE-4K 4096x4096

Requests continue to use ideal width and height constraints. Browsers may negotiate different dimensions.

### Video resolution overlay

- The preview shows the committed requested preset.
- The preview separately shows actual negotiated `MediaTrackSettings.width` and `height`.
- The actual value is authoritative.
- Before activation, the selected preset controls the preview frame ratio.
- After activation, actual stream dimensions control the preview frame ratio.

## Non-goals

- Do not add a UI framework.
- Do not change Webcam-TS package constraint semantics.
- Do not claim a preset is supported before inspecting actual track settings.
- Do not crop portrait or square streams to a landscape frame.
