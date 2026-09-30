# Webcam-TS — Context & Domain Language

Authority: `packages/webcam-ts/README.md`, `packages/webcam-ts/test`, และ `CONTEXT.md` ฉบับนี้
แกนของ library: กล้องหนึ่งตัว (`Webcam`) เป็นเจ้าของ lifecycle และ `MediaStream` หนึ่งอันต่อหนึ่งช่วงเวลา

## Ubiquitous language

| คำ                 | ความหมาย                                                                                                                | ห้ามใช้แทน               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Webcam             | core facade ผู้ถือ state และเจ้าของ stream                                                                              | client, manager, service |
| session            | ช่วงเวลาที่กล้อง active ตั้งแต่ start สำเร็จจนหยุด (มี `sessionId`)                                                     | connection, instance     |
| operation          | คำสั่งที่กำลังทำงาน: `start` \| `stop` \| `dispose`                                                                     | action, job              |
| pending start      | `start` ที่กำลังวิ่งอยู่ตัวเดียว; มี id และเหตุผลเมื่อถูกยกเลิก                                                         | token, lease, lock       |
| candidate          | stream ที่เปิดได้แล้วแต่ยังไม่ commit เป็น active                                                                       | pending, temp            |
| active stream      | stream ที่ session เป็นเจ้าของอยู่ — ตัวเดียวเท่านั้น                                                                   | current, live            |
| webcam request     | คำขอเปิดเว็บแคม (`WebcamRequest`)                                                                                       | config, options          |
| permission request | คำขอสิทธิ์ใช้อุปกรณ์ (`PermissionRequest`)                                                                              | webcam request           |
| device info        | ข้อมูลอุปกรณ์ที่ browser ให้ผ่าน `MediaDeviceInfo`; ส่งทั้งก้อนใน request ได้ (`device?`)                               | duplicate device wrapper |
| permission map     | สถานะกล้องและไมโครโฟน (`PermissionMap`, `MediaPermissionState`)                                                         | `PermissionService`      |
| constraint         | ข้อจำกัดของ track (width/height/frameRate/facingMode/deviceId)                                                          | setting                  |
| track ended        | อีเวนต์จาก browser ว่า track ตาย — จบ session ด้วย `TRACK_ENDED`                                                        | disconnect               |
| dispose            | จบถาวร ใช้ต่อไม่ได้ (`DISPOSED`)                                                                                        | close, destroy           |
| capability info    | ค่า settings และ capabilities ที่ browser รายงานสำหรับอุปกรณ์ (`DeviceCapabilityInfo` เก็บ `device` ทั้งก้อนแบบ frozen) | probe, inspect           |

## Public API naming

ชื่อ API ที่ root entrypoint ใช้ `Webcam` สำหรับ facade และ domain types
(`Webcam`, `WebcamError`, `WebcamRequest`); API ใน subpath ใช้ชื่อสั้นตามหน้าที่
เพราะ import path บอกขอบเขตอยู่แล้ว (`Preview`, `Capture`, `Controls`,
`DeviceManager`, `PermissionService`, `EventHub`).

## Lifecycle (แหล่งความจริงเดียว)

| status   | start            | stop        | dispose    |
| -------- | ---------------- | ----------- | ---------- |
| idle     | → starting       | no-op       | → disposed |
| starting | ❌ INVALID_STATE | → idle      | → disposed |
| active   | → starting       | → idle      | → disposed |
| stopping | ❌ INVALID_STATE | no-op       | → disposed |
| disposed | ❌ DISPOSED      | ❌ DISPOSED | no-op      |

`start` จาก `idle` คือเปิดครั้งแรก; `start` จาก `active` คือแทน stream แบบ atomic ถ้า fail stream เก่ายังอยู่
Track ended ระหว่าง `active` → หยุด stream, emit `stream-changed(reason:"ended")` + `session-ended(TRACK_ENDED)`, กลับ `idle`
Track ended ระหว่าง replacement → หยุด stream เก่า, session แจ้ง `ended`, `start` ที่ค้างอยู่ยัง commit ได้ตามปกติ

## Ownership ของ MediaStream

| ช่วง                         | ใครถือ                 | หมายเหตุ                                               |
| ---------------------------- | ---------------------- | ------------------------------------------------------ |
| ระหว่างเปิด                  | Webcam (candidate)     | ถ้า `start` ตาย/ถูก abort/preempt → `stopStream` ทันที |
| commit สำเร็จ                | Webcam (active stream) | candidate → active ในจังหวะเดียว                       |
| แทน stream สำเร็จ            | Webcam (active ใหม่)   | stream เก่าถูก `stopStream` หลัง emit event            |
| stop / dispose / track ended | —                      | `stopStream` ทั้ง candidate และ active                 |

## Error codes → เกิดเมื่อไหร่

- `INVALID_REQUEST` — request ผิด (device ว่าง/ไม่มี deviceId, exact ≤ 0, exact+exact ชนกัน)
- `INVALID_STATE` — คำสั่งไม่ถูกตาม lifecycle table
- `DISPOSED` — ใช้หลัง dispose (recoverable: false)
- `PERMISSION_DENIED` / `DEVICE_NOT_FOUND` / `DEVICE_BUSY` / `CONSTRAINT_UNSATISFIED` / `SECURITY_RESTRICTION` — map จาก browser error name ที่ platform boundary
- `OPERATION_ABORTED` — `request.signal` abort หรือ `stop()` preempt `start` ที่ค้างอยู่
- `STREAM_OPEN_FAILED` / `STREAM_INVALID` / `TRACK_ENDED` — ระดับ stream/track
- `UNSUPPORTED_RUNTIME` / `UNSUPPORTED_BROWSER` — ไม่มี browser API (recoverable: false)
