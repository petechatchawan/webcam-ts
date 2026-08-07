# Webcam-TS v4 Playground and GitHub Pages Design

## Status

Approved for implementation on 2026-08-06.

## Goal

Replace the Angular demo application with a framework-agnostic Vite + Vanilla TypeScript playground that exercises only the public Webcam-TS v4 package entrypoints and deploys automatically to GitHub Pages from `master`.

## Decisions

- Remove `apps/docs` completely.
- Create `apps/playground` using Vite and Vanilla TypeScript.
- The playground must import only declared package exports:
  - `webcam-ts`
  - `webcam-ts/preview`
  - `webcam-ts/capture`
  - `webcam-ts/devices`
  - `webcam-ts/controls`
- Do not import source files or undeclared `dist` internals.
- Keep the playground framework-free: no Angular, React, Vue, RxJS, PrimeNG, or UI framework.
- Build for the repository Pages path `/webcam-ts/`.
- Deploy only from `master` using GitHub Actions and the official Pages artifact workflow.
- Pull requests build and test the playground but do not deploy it.

## Information architecture

The playground is a single responsive page with four functional regions:

1. **Camera workspace**
   - Live `VideoPreview` surface.
   - Start, stop, and switch controls.
   - Device, facing mode, resolution, and mirror settings.

2. **Capture workspace**
   - JPEG/PNG selection.
   - Quality control for JPEG.
   - Capture action.
   - Latest captured image preview and metadata.
   - Explicit object URL cleanup when replacing or disposing the result.

3. **Capabilities and controls**
   - Read active track capabilities and settings.
   - Show zoom, torch, and focus controls only when supported.
   - Apply values through `CameraControls`.

4. **Diagnostics**
   - Current immutable `CameraState`.
   - Permission state.
   - Device inventory.
   - Typed event log and typed error details.
   - Clear-log action.

## Application boundaries

```text
apps/playground/src/
  main.ts                 application composition and teardown
  camera-controller.ts    public Webcam-TS orchestration
  ui-renderer.ts          DOM rendering and UI state projection
  dom.ts                  required element lookup and typed helpers
  models.ts               playground-only view models
  styles.css              responsive presentation
```

### CameraController

`CameraController` owns the playground-level service instances:

- `Camera`
- `VideoPreview`
- `CameraCapture`
- `CameraDeviceManager`
- `CameraPermissionService`
- `CameraControls`

It coordinates these objects but never reaches into Webcam-TS internals. It exposes view snapshots and typed command methods to the renderer.

### UiRenderer

`UiRenderer` owns DOM event binding and presentation updates. It does not own camera resources and does not call browser media APIs directly.

### Resource ownership

- `CameraSession` remains the sole owner of active/candidate streams.
- `VideoPreview`, `CameraCapture`, and `CameraControls` borrow stream/track references only.
- The playground owns generated `blob:` URLs and revokes them before replacement and during disposal.
- Page teardown disposes services in dependency order and must be idempotent.

## User flows

### Initial load

1. Import the package without opening camera hardware.
2. Query permission state.
3. Enumerate devices without opening a temporary stream.
4. Render the camera as `idle`.

### Start

1. Build a `CameraRequest` from selected settings.
2. Call `camera.start(request)`.
3. `VideoPreview` updates only after the stream commits.
4. Refresh devices, active settings, and capabilities.

### Switch

1. Build a replacement request.
2. Call `camera.switch(request)`.
3. The previous preview remains active until the candidate commits.
4. A failed switch preserves the previous active stream and displays the typed error.

### Stop

1. Call `camera.stop()`.
2. Preview clears through the `stream-changed` event.
3. Capability controls reset.

### Capture

1. Validate that a camera is active.
2. Call `CameraCapture.toBlob()`.
3. Create a playground-owned object URL.
4. Revoke the previous URL.
5. Render capture dimensions, MIME type, size, and timestamp.

## Error handling

- Display `CameraError.code`, operation, message, and recoverability.
- Never use `alert()` for operational failures.
- Commands disable only while their conflicting lifecycle operation is running.
- Permission denial presents an actionable browser-permission message.
- Unsupported capabilities are hidden or disabled rather than treated as failures.
- Teardown failures are logged but must not prevent remaining cleanup steps.

## Responsive and accessibility requirements

- Mobile-first layout with a single-column flow below 900 px.
- Desktop layout uses camera workspace plus diagnostics side panel.
- All controls have explicit labels.
- Status changes use an `aria-live="polite"` region.
- Buttons and form fields remain keyboard accessible.
- The video area retains a stable aspect ratio and never overflows the viewport.
- Do not communicate state through color alone.

## Build and Pages deployment

`apps/playground/vite.config.ts` uses:

```ts
base: process.env.GITHUB_ACTIONS ? "/webcam-ts/" : "/"
```

The deployment workflow runs on pushes to `master` and manual dispatch:

1. Checkout.
2. Configure pnpm and Node.
3. Install with `pnpm install --frozen-lockfile`.
4. Run package typecheck/tests.
5. Build `apps/playground`.
6. Configure Pages with `actions/configure-pages@v5`.
7. Upload `apps/playground/dist` with `actions/upload-pages-artifact@v4`.
8. Deploy through a separate job using `actions/deploy-pages@v4`.

Required permissions:

```yaml
pages: write
id-token: write
contents: read
```

Deployment environment: `github-pages`.

## CI behavior

The existing Lean CI is updated to:

- typecheck Webcam-TS
- run all package tests and tarball contracts
- verify the package tarball
- typecheck the playground
- build the playground with the GitHub Pages base path

CI must not deploy from pull requests.

## Testing strategy

### Unit tests

Use the Node test runner for playground logic that does not require a browser:

- request construction from form selections
- command availability derived from camera status
- event-log retention and ordering
- error-to-view-model projection
- capture object URL replacement cleanup through injected URL helpers

### Build contract

- Vite production build succeeds.
- Generated `dist/index.html` references assets under `/webcam-ts/` in CI mode.
- The source contains no imports from `packages/webcam-ts/src`, relative `dist` paths, Angular, React, Vue, RxJS, or PrimeNG.

### Manual hardware matrix

Before promoting v4 from alpha to stable:

- Chromium desktop: integrated and external camera
- Firefox desktop
- Safari/WebKit desktop
- Android Chromium: front and rear camera
- iOS Safari: front and rear camera
- camera switch failure preserves active preview
- torch/zoom/focus where exposed by hardware
- capture JPEG and PNG
- device disconnect transitions to idle

## Cleanup

Remove:

- `apps/docs/**`
- Angular-specific workspace dependencies that are no longer used anywhere
- obsolete Vercel configuration or documentation references for the demo

Keep deployment history separate from package CI by using `.github/workflows/pages.yml`.

## Acceptance criteria

- `apps/docs` no longer exists.
- `apps/playground` is Vite + Vanilla TypeScript only.
- The playground imports only public Webcam-TS v4 entrypoints.
- Package tests remain green.
- Playground unit tests, typecheck, and production build pass.
- GitHub Pages workflow deploys only from `master`.
- Pull-request CI builds but does not deploy the site.
- The deployed site path is compatible with `https://petechatchawan.github.io/webcam-ts/`.
- Repository documentation links to the GitHub Pages demo and no longer presents Vercel as the canonical deployment.
