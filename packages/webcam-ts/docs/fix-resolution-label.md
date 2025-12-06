# การแก้ไข getCurrentResolution() ให้คืนค่า Label ที่ถูกต้อง

## 🔍 ปัญหาที่พบ

เมื่อเปิดกล้องด้วย `preferredResolutions` ที่มี label กำหนดเอง เช่น:

```typescript
preferredResolutions: [
	{ label: "S1920", width: 1920, height: 1920 },
	{ label: "S1080", width: 1080, height: 1080 },
	{ label: "S720", width: 720, height: 720 },
];
```

แล้วเรียก `getCurrentResolution()` จะได้ผลลัพธ์เป็น:

```typescript
{
  width: 720,
  height: 720,
  label: "720x720"  // ❌ ไม่ใช่ "S720" ที่เราต้องการ
}
```

## 🎯 สาเหตุ

`getCurrentResolution()` อ่านค่าจาก `track.getSettings()` ซึ่งได้เฉพาะ `width` และ `height` เท่านั้น แล้วสร้าง label ใหม่เป็น `"${width}x${height}"` แทนที่จะใช้ label เดิมที่ผู้ใช้กำหนด

**ไม่มีการเก็บค่า `preferredResolutions` ที่ใช้เปิดกล้องจริงๆ ไว้ใน state**

## ✅ วิธีแก้ไข

### 1. เพิ่ม `activeResolution` ใน `WebcamStateInternal`

**ไฟล์:** `src/types/index.ts`

```typescript
export interface WebcamStateInternal {
	status: WebcamStatus;
	activeStream: MediaStream | null;
	permissions: Record<string, PermissionState>;
	videoElement?: HTMLVideoElement;
	device?: MediaDeviceInfo;
	error?: Error | null;
	zoomLevel?: number;
	focusMode?: FocusMode;
	torchEnabled?: boolean;
	activeResolution?: Resolution; // ✅ เพิ่มฟิลด์นี้
}
```

### 2. แก้ไข `Stream.startStream()` ให้คืนค่า resolution ที่ใช้จริง

**ไฟล์:** `src/core/stream.ts`

```typescript
async startStream(config: WebcamConfiguration): Promise<{
  stream: MediaStream;
  usedResolution: Resolution | null;
}> {
  try {
    let stream: MediaStream | null = null;
    let usedResolution: Resolution | null = null;

    if (Array.isArray(config.preferredResolutions)) {
      // ลองแต่ละ resolution จนกว่าจะสำเร็จ
      for (const resolution of config.preferredResolutions) {
        try {
          const constraints = await this._buildConstraints({
            ...config,
            preferredResolutions: resolution,
          });
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          usedResolution = resolution; // ✅ เก็บ resolution ที่ใช้สำเร็จ
          break;
        } catch (error) {
          continue;
        }
      }
    } else {
      const constraints = await this._buildConstraints(config);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      usedResolution = config.preferredResolutions || null; // ✅ เก็บ resolution เดียว
    }

    this.activeStream = stream;
    return { stream, usedResolution }; // ✅ คืนค่าทั้งคู่
  } catch (error) {
    throw this._handleStartError(error, config);
  }
}
```

### 3. แก้ไข `Webcam.start()` ให้เก็บ resolution ที่ใช้

**ไฟล์:** `src/core/webcam.ts`

```typescript
async start(config?: WebcamConfiguration): Promise<void> {
  // ... code อื่นๆ ...

  try {
    this._updateStatus("initializing");

    // ✅ รับทั้ง stream และ usedResolution
    const { stream, usedResolution } = await this.stream.startStream(this.config);
    this.state.activeStream = stream;
    this.state.activeResolution = usedResolution || undefined; // ✅ เก็บไว้ใน state

    // Setup video element
    if (this.videoElement) {
      this.videoElement.srcObject = stream;
      if (this.config.enableMirror) {
        this.setMirror(true);
      }
    }

    this._updateStatus("ready");
    this.config.onStreamStart?.(stream);
  } catch (error) {
    // ... error handling ...
  }
}
```

### 4. แก้ไข `getCurrentResolution()` ให้คืนค่า label ที่ถูกต้อง

**ไฟล์:** `src/core/webcam.ts`

```typescript
/**
 * Get current resolution
 * Returns the resolution that was used to start the camera with the original label
 */
getCurrentResolution(): Resolution | null {
  if (!this.state.activeStream) return null;

  // ✅ ถ้ามี activeResolution ที่เก็บไว้ ให้คืนค่านั้น (มี label เดิม)
  if (this.state.activeResolution) {
    return this.state.activeResolution;
  }

  // Fallback: อ่านจาก track settings (กรณีไม่มี activeResolution)
  const tracks = this.state.activeStream.getVideoTracks();
  if (tracks.length === 0) return null;

  const track = tracks[0];
  const settings = track.getSettings();
  const width = settings.width || 0;
  const height = settings.height || 0;

  return {
    width,
    height,
    label: `${width}x${height}`,
  };
}
```

### 5. แก้ไข `stop()` ให้ล้างค่า `activeResolution`

**ไฟล์:** `src/core/webcam.ts`

```typescript
stop(): void {
  this.stream.stopStream();
  this.state.activeStream = null;
  this.state.activeResolution = undefined; // ✅ ล้างค่า
  if (this.videoElement) {
    this.videoElement.srcObject = null;
  }

  this._updateStatus("idle");
  this.config?.onStreamStop?.();
}
```

## 🧪 วิธีทดสอบ

### วิธีที่ 1: ใช้ไฟล์ทดสอบ

เปิดไฟล์ `examples/test-resolution-label.html` ในเบราว์เซอร์:

```bash
cd packages/webcam-ts
open examples/test-resolution-label.html
```

กดปุ่มเปิดกล้องด้วย resolution ต่างๆ แล้วดูว่า label ตรงกับที่กำหนดหรือไม่

### วิธีที่ 2: ทดสอบด้วยโค้ด

```typescript
import { Webcam } from "webcam-ts";

const webcam = new Webcam();
const videoElement = document.getElementById("video") as HTMLVideoElement;

// เปิดกล้องด้วย S720
await webcam.start({
	videoElement,
	preferredResolutions: [{ label: "S720", width: 720, height: 720 }],
});

// ตรวจสอบ resolution
const resolution = webcam.getCurrentResolution();
console.log(resolution);
// ✅ ผลลัพธ์ที่ถูกต้อง:
// {
//   width: 720,
//   height: 720,
//   label: "S720"  // ✅ ได้ label ที่กำหนดไว้
// }
```

## 📊 ผลลัพธ์

### ก่อนแก้ไข ❌

```typescript
getCurrentResolution();
// {
//   width: 720,
//   height: 720,
//   label: "720x720"  // ❌ ไม่ตรงกับที่กำหนด
// }
```

### หลังแก้ไข ✅

```typescript
getCurrentResolution();
// {
//   width: 720,
//   height: 720,
//   label: "S720"  // ✅ ตรงกับที่กำหนด
// }
```

## 🎓 สรุป

การแก้ไขนี้ทำให้:

1. **เก็บ resolution ที่ใช้จริง** - เมื่อเปิดกล้องสำเร็จ จะเก็บ `Resolution` object ที่ใช้ไว้ใน `state.activeResolution`
2. **คืนค่า label ที่ถูกต้อง** - `getCurrentResolution()` จะคืนค่า label เดิมที่ผู้ใช้กำหนด แทนที่จะสร้างใหม่
3. **รองรับทั้ง array และ single resolution** - ทำงานได้ทั้งกรณีส่ง array หลาย resolution และส่ง resolution เดียว
4. **มี fallback** - ถ้าไม่มี `activeResolution` (เช่น กรณีเก่าๆ) ก็จะสร้าง label แบบเดิม
5. **ล้างค่าเมื่อปิดกล้อง** - เมื่อเรียก `stop()` จะล้างค่า `activeResolution` ด้วย

## 🔗 ไฟล์ที่แก้ไข

1. `src/types/index.ts` - เพิ่ม `activeResolution` ใน `WebcamStateInternal`
2. `src/core/stream.ts` - แก้ `startStream()` ให้คืนค่า resolution ที่ใช้
3. `src/core/webcam.ts` - แก้ `start()`, `stop()`, และ `getCurrentResolution()`
4. `examples/test-resolution-label.html` - ไฟล์ทดสอบ

## 💡 Use Case

การแก้ไขนี้มีประโยชน์เมื่อ:

- ต้องการแสดง label ที่เข้าใจง่ายให้ผู้ใช้เห็น (เช่น "HD", "4K", "Square HD")
- ต้องการเก็บ log หรือ analytics ว่าใช้ resolution ไหน
- ต้องการตรวจสอบว่ากล้องเปิดด้วย resolution ที่ถูกต้องหรือไม่
- ต้องการแสดง UI ที่บอกว่ากำลังใช้ resolution preset ไหนอยู่
