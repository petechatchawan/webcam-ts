# Webcam-TS v4 Shadcn-Minimal Playground Design

## Status

Approved for implementation on `agent/webcam-ts-v4-clean-architecture`.

## Goal

Replace the current dark glassmorphism playground presentation with a light-first, shadcn-inspired minimal interface that preserves all Webcam-TS v4 behavior, public-package boundaries, accessibility semantics, and GitHub Pages deployment behavior.

## Scope

This change is presentation and interaction-clarity work only. It may restructure playground markup and CSS, but it must not change Camera, CameraSession, capture, device, permission, or control semantics.

## Visual direction

- Light-first neutral palette with system dark-mode support through `prefers-color-scheme`.
- Neutral black primary actions, white/near-white surfaces, muted gray copy, and semantic destructive/success/warning tokens.
- Thin 1px borders, 8-10px radii, restrained shadows, and no gradients, glass blur, neon cyan, or oversized decorative typography.
- System UI font stack with compact shadcn-like type scale and strong information hierarchy.
- Maximum content width of approximately 1280px with generous page whitespace but compact component spacing.

## Information architecture

### Header

Use a compact top bar with product identity, `v4 alpha` badge, short description, and a subtle GitHub source button. Remove the large marketing hero treatment.

### Session workspace

The live camera preview remains the primary visual surface. The session status badge and live status text sit close to the preview. Camera configuration is grouped in a bordered settings card beneath the preview.

Primary lifecycle actions are visually prioritized:

- `Start` is the primary neutral button.
- `Switch` is secondary while active.
- `Stop` is a destructive outline/action.
- Permission and refresh actions are lower-emphasis utility buttons.

### Sidebar

Permission state and hardware controls remain in a right-hand column on desktop. Cards use concise headers, descriptions, and compact metric rows. The column collapses beneath the workspace on tablet/mobile.

### Capture

Capture becomes a compact two-column card: controls and metadata on one side, image result on the other. Empty state uses a subtle bordered surface rather than a large dark well.

### Diagnostics

Diagnostics remain available but are visually secondary. Use a `details`-based disclosure section containing state, devices/capabilities, and event log. It is closed by default to keep the normal camera workflow focused.

## Components and tokens

CSS custom properties define the complete visual contract:

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`
- `--radius`

Dark-mode tokens are overridden only inside `@media (prefers-color-scheme: dark)`.

Reusable presentation classes:

- `.button`, `.button-primary`, `.button-secondary`, `.button-outline`, `.button-ghost`, `.button-destructive`
- `.card`, `.card-header`, `.card-title`, `.card-description`, `.card-content`
- `.badge`
- `.field`, `.field-label`, `.field-description`
- `.switch-control`
- `.alert-destructive`
- `.separator`

Existing DOM IDs required by `UiRenderer` must remain unchanged.

## Accessibility and interaction

- Preserve all current labels and ARIA live/error semantics.
- Every interactive control must retain visible `:focus-visible` treatment using `--ring`.
- Minimum button/input height is 36px on desktop and 40px on mobile.
- Disabled controls remain legible and clearly inactive.
- Status must not be communicated by color alone; text labels remain visible.
- Diagnostics disclosure uses native `details/summary` keyboard semantics.
- Respect `prefers-reduced-motion` and remove nonessential transitions.

## Responsive behavior

- Desktop: workspace plus 320px sidebar.
- Tablet: single-column workspace, permission and controls cards in two columns when space permits.
- Mobile: single column, preview uses 4:3, action buttons wrap into full-width or two-column rows, and form controls do not overflow.

## Non-goals

- No React, shadcn/ui package, Tailwind, Radix, icon package, or runtime theme manager.
- No manual theme toggle in this milestone; system color preference is authoritative.
- No changes to Webcam-TS API behavior or playground controller state.
- No visual snapshot service or third-party browser testing dependency.

## Verification

Automated checks must confirm:

1. The old glassmorphism markers are absent (`backdrop-filter`, radial gradients, cyan neon palette).
2. Required neutral design tokens and dark-mode media query are present.
3. Existing controller-bound DOM IDs are retained.
4. Diagnostics use native progressive disclosure.
5. Playground source still imports only declared Webcam-TS public entrypoints.
6. Package tests, playground tests, typechecks, clean-room guard, frozen lockfile, and Pages-path production build all pass.
