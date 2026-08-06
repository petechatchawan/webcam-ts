# Webcam-TS v4 Exact Resolution Behavior

## Decision

The mobile playground exposes two explicit resolution constraint modes:

- `exact` — default; the selected width and height are mandatory.
- `ideal` — optional best-effort mode; the browser may negotiate another size.

## Request mapping

For a selected preset `(width, height)`:

```ts
// exact
{
  resolution: {
    width: { exact: width },
    height: { exact: height },
  },
}

// ideal
{
  resolution: {
    width: { ideal: width },
    height: { ideal: height },
  },
}
```

## Failure behavior

When an exact request cannot be satisfied:

- `start()` rejects with `CONSTRAINT_UNSATISFIED` and returns to `idle`.
- `switch()` rejects with `CONSTRAINT_UNSATISFIED` and preserves the previous active stream and committed requested resolution.
- The browser `OverconstrainedError.constraint` value is retained when available.
- The playground error includes the preset id, requested dimensions, constraint mode, and failed constraint.

Example message:

```text
SQUARE-1920 requires exactly 1920×1920, but the selected camera cannot satisfy the width constraint. Choose another preset or use Prefer closest.
```

## Overlay

The preview overlay identifies the committed request mode and dimensions:

```text
Requested Exact SQUARE-1920 · 1920×1920
Actual 1920×1920
```

In `ideal` mode, requested and actual values may differ and both remain visible.

## Verification contracts

- Browser normalization preserves `OverconstrainedError.constraint`.
- Exact mode maps presets to mandatory width and height constraints.
- Ideal mode remains available explicitly.
- Exact failures are projected with actionable diagnostics.
- Failed switches retain the previous active session.
