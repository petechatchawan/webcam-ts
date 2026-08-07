# Webcam-TS

Webcam-TS is a framework-agnostic TypeScript camera library built around deterministic lifecycle management and explicit `MediaStream` ownership.

## Live playground

**https://petechatchawan.github.io/webcam-ts/**

The playground is implemented with Vite and Vanilla TypeScript. It consumes only the declared public package entrypoints and demonstrates permissions, device discovery, atomic switching, preview, capture, hardware controls, immutable state, typed events, and typed errors.

## Real Browser & Device Conformance

**https://petechatchawan.github.io/webcam-ts/?conformance=1**

Conformance mode is a separate evidence runner for the v4 stabilization milestone. It records assertion-based scenario outcomes and privacy-safe browser/device evidence without exporting raw camera device IDs, group IDs, labels, or captured frames. Scenarios that are not implemented yet remain explicitly blocked rather than reporting a false pass.

Physical testing follows:

- `docs/superpowers/conformance/webcam-ts-v4-manual-runbook.md`
- `docs/superpowers/conformance/webcam-ts-v4-tier1-matrix.md`

Automated browser evidence does not replace required iOS Safari, Android Chrome, integrated-camera, or external-USB physical verification.

## Repository

```text
packages/webcam-ts   public npm package
apps/playground      framework-free browser playground
docs/superpowers     architecture specifications, implementation plans, and conformance evidence contracts
```

## Development

```bash
pnpm install --frozen-lockfile
pnpm start:playground
```

Verification:

```bash
pnpm verify:playground
pnpm --dir packages/webcam-ts test
pnpm --dir apps/playground typecheck
pnpm --dir apps/playground test
GITHUB_ACTIONS=true pnpm --dir apps/playground build
```

GitHub Actions verifies pull requests. Pushes to `master` deploy `apps/playground/dist` to GitHub Pages.
