# AGENTS.md — webcam-ts monorepo

## Stack

TypeScript 5 (strict) · Node >=18 · pnpm 8 workspaces + turbo · Vite playground · `node:test` (.mjs)

## โครงสร้าง

```
packages/webcam-ts/src/camera.ts        แกน lifecycle + ownership (อ่านไฟล์นี้ก่อนเสมอ)
packages/webcam-ts/src/domain/          types + ตรรกะ pure (request, error, state, event, lifecycle)
packages/webcam-ts/src/platform/        adapter ของ browser + port (seam จริง: browser + fakes)
packages/webcam-ts/src/{capture,controls,devices,preview}/  บริการแยกตาม entrypoint
packages/webcam-ts/src/testing/          fake port/track/stream สำหรับ test
packages/webcam-ts/src/events/           event hub (pub/sub แยก listener)
apps/playground/                        consumer playground (Vite)
packages/webcam-ts/README.md            public contract ของ library
CONTEXT.md                              ภาษา + lifecycle + ownership (authority)
```

## คำสั่งที่ใช้บ่อย

```bash
pnpm --dir packages/webcam-ts test        # build + node:test บน dist
pnpm --dir apps/playground test
pnpm --dir apps/playground typecheck
pnpm verify:playground
pnpm --dir apps/playground dev            # playground
```

## กฎ

- ห้าม `any`; cast ที่เปลี่ยน semantics หรือ `as unknown as` ต้องมี comment (DOM-lib narrowing cast ทั่วไปไม่ต้อง)
- class member ทุกตัว (รวม field) ต้องมี visibility modifier ชัดเจน (`public`/`private` ห้าม implicit)
- public API ทุกตัวต้องมี test ที่ import จาก entrypoint (`webcam-ts`, `webcam-ts/testing`, …) — ห้าม import ลึกเข้า `dist/`
- error ทุกตัวที่โยนออก public ต้องเป็น `CameraError`
- session-owned stream มีแค่ `Camera` ที่ stop ได้; service ใดเปิด stream เองต้อง stop เองใน `finally` (ห้ามเก็บ active stream ไว้)
- concept และชื่อ ตาม `CONTEXT.md` — เพิ่ม/แก้คำต้องอัปเดต CONTEXT.md ใน commit เดียวกัน
- 1 commit = 1 การเปลี่ยนแปลงที่ verify ได้; commit message conventional
