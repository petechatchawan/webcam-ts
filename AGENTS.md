# AGENTS.md — webcam-ts monorepo

## Stack
TypeScript 5 (strict) · Node >=18 · pnpm 8 workspaces + turbo · Vite playground · `node:test` (.mjs)

## โครงสร้าง
```
packages/webcam-ts/src/camera.ts        แกน lifecycle + ownership (อ่านไฟล์นี้ก่อนเสมอ)
packages/webcam-ts/src/domain/          types + ตรรกะ pure (request, error, state, event, lifecycle)
packages/webcam-ts/src/platform/        adapter ของ browser + port (seam จริง: browser + fakes)
packages/webcam-ts/src/{capture,controls,devices,preview}/  บริการแยกตาม entrypoint
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
- ห้าม `any`; cast ได้เฉพาะที่ boundary ของ browser และต้องมี comment
- public API ทุกตัวต้องมี test ที่ import จาก entrypoint (`webcam-ts`, `webcam-ts/testing`, …) — ห้าม import ลึกเข้า `dist/`
- error ทุกตัวที่โยนออก public ต้องเป็น `CameraError`
- `Camera` เท่านั้นที่แตะ MediaStream lifecycle; บริการอื่น (preview/capture/controls/devices) ห้าม stop/เก็บ stream
- concept และชื่อ ตาม `CONTEXT.md` — เพิ่ม/แก้คำต้องอัปเดต CONTEXT.md ใน commit เดียวกัน
- 1 commit = 1 การเปลี่ยนแปลงที่ verify ได้; commit message conventional
