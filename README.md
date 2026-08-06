# Webcam-TS

Webcam-TS is a framework-agnostic TypeScript camera library built around deterministic lifecycle management and explicit stream ownership.

## Repository

```text
packages/webcam-ts   public npm package
apps/docs            Angular consumer playground using only public v4 exports
docs/superpowers     architecture specifications and implementation plans
```

## v4 architecture

- One `Camera` instance owns at most one active session.
- `CameraSession` is the sole owner of active and candidate streams.
- `start()` and `switch()` have separate semantics.
- Switching is atomic and latest-command-wins.
- `stop()` and `dispose()` preempt pending operations.
- Preview, capture, devices, permissions, and controls are separate services.
- Imports and constructors are safe during SSR.
- There is no legacy v3 compatibility facade.

See `packages/webcam-ts/README.md` for the public API and `docs/superpowers/specs/2026-08-06-webcam-ts-v4-architecture-design.md` for the complete design.

## Development

```bash
pnpm install
pnpm --dir packages/webcam-ts test
pnpm start:docs
```

## License

MIT
