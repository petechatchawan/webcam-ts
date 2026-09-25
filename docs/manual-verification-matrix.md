# Manual device verification matrix — v4 stable gate

Open the playground (deployed Pages URL or `pnpm start:playground:https` for LAN) on each device below and walk every row. Mark ✅/❌ with browser + OS version.

## Matrix

| #   | Device  | Browser           | Camera       |
| --- | ------- | ----------------- | ------------ |
| 1   | iPhone  | Safari            | front        |
| 2   | iPhone  | Safari            | rear         |
| 3   | Android | Chrome            | front        |
| 4   | Android | Chrome            | rear         |
| 5   | Desktop | Chromium          | integrated   |
| 6   | Desktop | Chromium          | external USB |
| 7   | Desktop | Firefox or Safari | integrated   |

## Steps per row (all must pass)

1. **Permission gate** — Allow camera access appears first; after allow, Start enables.
2. **Start** — preview goes live, status `active`, resolution overlay shows actual dimensions.
3. **Replace** — change device or resolution, press Start again: stream swaps atomically, no frozen frame.
4. **Failed replace** — pick an impossible exact resolution: typed error appears, previous stream keeps running.
5. **Capture** — shutter produces a thumbnail with correct dimensions.
6. **Controls** — zoom/torch/focus controls appear only if the device supports them; setting zoom applies visibly.
7. **Stop** — preview clears, status `idle`.
8. **Track ended** (USB row only) — unplug the camera mid-stream: status returns to `idle` with a `TRACK_ENDED` error, no hang.
9. **Console** — no errors or unhandled rejections during the whole run.

## Sign-off

All 7 rows green → v4 stable gates pass → proceed to `4.0.0` release (`latest` tag).
Any ❌ → file the device/browser/error code here before releasing.
