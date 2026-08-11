# Webcam-TS v4 Orientation-Equivalent Exact Resolution Design

## Problem

Mobile and tablet browsers may deliver the same camera resolution with width and height swapped when device/video orientation differs from the requested presentation orientation. Today an exact request such as `720×1280` is rejected when the track reports `1280×720`, producing `CONSTRAINT_UNSATISFIED` even though the delivered resolution is the same exact dimension pair rotated by 90°.

## Decision

When both exact width and exact height are present, Webcam-TS treats `W×H` and `H×W` as orientation-equivalent exact resolutions. Exact remains strict: dimensions may only match directly or as the swapped pair. No tolerance, nearest-resolution fallback, scaling, or implicit crop is introduced.

Examples:

- requested `720×1280`, actual `720×1280` → verified
- requested `720×1280`, actual `1280×720` → verified
- requested `720×1280`, actual `1920×1080` → `CONSTRAINT_UNSATISFIED`
- requested `720×720`, actual `720×720` → verified; square requests do not need an orientation retry

## Acquisition

For a non-square request with both width and height exact:

1. Open media with the request exactly as supplied.
2. If browser acquisition fails with a resolution constraint failure, confirm the operation lease/signal is still current.
3. Retry once with only exact width and exact height swapped. Preserve every other request field unchanged.
4. Never retry for permission, device, security, busy, abort, dispose, invalid request, or generic open failures.

The retry remains inside the same `start` or `switch` operation lease. `stop()`, `dispose()`, signal abort, or a newer operation preempts the retry and prevents late commit.

`ideal`/Prefer closest requests are unchanged and never use the swapped exact retry.

## Postcondition

Authoritative `MediaStreamTrack.getSettings()` values remain raw. Validation accepts:

- direct exact match: `actualW === requestedW && actualH === requestedH`
- rotated exact match: `actualW === requestedH && actualH === requestedW`, only when both requested dimensions are exact

Partial exact constraints retain existing per-axis semantics. Missing authoritative dimensions retain the existing `unobservable` behavior.

## Start semantics

If either exact orientation succeeds and validates, commit the candidate and transition to `active`. If both eligible acquisition attempts fail, return `CONSTRAINT_UNSATISFIED` and roll back to `idle`. Any rejected candidate or late stream is stopped.

## Switch semantics

Candidate-first switching remains unchanged. The previous active stream stays live while the new camera attempts direct then eligible swapped exact acquisition. Only after a candidate validates is it committed and the previous stream stopped. If both attempts fail, the previous stream remains active.

## Error contract

No new public API is required. `CONSTRAINT_UNSATISFIED` remains the public error code. When an orientation retry is attempted and final failure is resolution-related, error context should retain the requested dimensions and include `orientationRetryAttempted: true`. Diagnostics must not rewrite actual track settings.

## Scope exclusions

- no UA/mobile/tablet detection
- no automatic square crop
- no tolerance-based matching
- no browser-specific switch fallback
- no public state/type expansion solely for orientation metadata

## Verification

TDD must cover direct and swapped postcondition matches, genuine mismatch, partial exact, square exact, direct acquisition, one swapped retry, retry exclusion for non-resolution errors, start rollback, candidate-first switch preservation, and operation invalidation/abort during retry. Full package/playground verification and Chromium/Firefox/WebKit conformance must pass before merge.