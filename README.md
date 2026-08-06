# Webcam-TS

Webcam-TS is a framework-agnostic TypeScript camera library built around deterministic lifecycle management and explicit `MediaStream` ownership.

## Live playground

**https://petechatchawan.github.io/webcam-ts/**

The playground is implemented with Vite and Vanilla TypeScript. It consumes only the declared public package entrypoints and demonstrates permissions, device discovery, atomic switching, preview, capture, hardware controls, immutable state, typed events, and typed errors.

## Repository

```text
packages/webcam-ts   public npm package
apps/playground      framework-free browser playground
docs/superpowers     architecture specifications and implementation plans
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
