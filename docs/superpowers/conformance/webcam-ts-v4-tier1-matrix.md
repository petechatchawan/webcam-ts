# Webcam-TS v4 Tier-1 Physical Conformance Matrix

**Status:** Not yet complete  
**Stable release rule:** every mandatory row must reach PASS on retained evidence from the exact release candidate/stable source SHA.

## Matrix

| Tier-1 requirement | Required scenarios | Status | Evidence |
|---|---|---:|---|
| macOS Chromium — integrated camera | permission allow/deny; enumerate; start; exact supported/unsupported; ideal; stop; preview; JPEG/PNG; controls when supported | BLOCKED | Pending physical run |
| macOS Chromium — external USB camera | enumerate/select; start; exact/ideal; integrated ↔ external switch; disconnect/reconnect; track ended; explicit recovery; JPEG/PNG | BLOCKED | Pending physical run |
| macOS Firefox — integrated camera | permission; enumerate; start; exact/ideal; stop; capture; error normalization | BLOCKED | Pending physical run |
| macOS Safari — integrated camera | permission; enumerate; start; exact/ideal; stop; capture; switch when alternate camera is available | BLOCKED | Pending physical run |
| iOS Safari — front camera | permission; start; front/rear switching; exact/ideal; stop; preview; capture; interruption/recovery | BLOCKED | Pending physical run |
| iOS Safari — rear camera | permission; start; rear/front switching; exact/ideal; stop; preview; capture; interruption/recovery | BLOCKED | Pending physical run |
| Android Chrome — front camera | permission; start; front/rear switching; exact/ideal; stop; capture; optional controls | BLOCKED | Pending physical run |
| Android Chrome — rear camera | permission; start; rear/front switching; exact/ideal; stop; capture; optional controls | BLOCKED | Pending physical run |

**BLOCKED remains a release blocker and never satisfies a mandatory Tier-1 row.** The external USB row is mandatory; missing external hardware does not downgrade the gate.

## Evidence requirements

Each PASS row must reference one or more privacy-safe evidence files named:

```text
<date>-<platform>-<browser>-<hardware>-<sha>.json
```

The retained evidence must record:

- browser family and version;
- OS family and version when observable;
- secure-context state;
- package version;
- exact tested/deployed git SHA;
- tester-selected hardware class;
- requested camera constraints relevant to the scenario;
- authoritative delivered settings/capabilities when observable;
- assertion results and normalized Webcam-TS errors;
- required physical confirmations.

Raw `deviceId`, `groupId`, camera labels, captured frames, and unrestricted error causes are prohibited from default evidence.

## Physical switching checkpoint

Do not change candidate-first switching architecture until the following evidence exists:

- iOS Safari front → rear → front;
- Android Chrome front → rear → front;
- macOS Safari multi-camera when a second camera is available;
- macOS Chromium integrated ↔ external USB.

If simultaneous candidate acquisition repeatedly fails with a normalized `DEVICE_BUSY` or equivalent platform limitation, record the evidence first, then amend the architecture before implementing any break-before-make strategy.

## Release defect gate

- Open P0 defects: **0 required for RC/stable**.
- Open P1 defects: **0 required for stable**.
- Open architecture contradictions: **0 required for RC/stable**.
- Mandatory Tier-1 rows with BLOCKED status: **0 required for stable**.
- Mandatory Tier-1 rows with FAIL status: **0 required for stable**.

Optional absence of torch, zoom, or focus capability is not a platform failure; those scenarios are SKIPPED when the active camera does not expose the capability.

## Stable completion

The matrix is complete only when every row above is PASS against the intended release source, the support matrix and known limitations agree with the retained evidence, and GitHub Pages deployment SHA matches the tested source SHA.
