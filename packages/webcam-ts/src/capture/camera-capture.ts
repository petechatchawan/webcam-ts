import type { Camera } from "../camera.js";
import { CameraError } from "../domain/camera-error.js";
import { CanvasCaptureBackend } from "./canvas-capture-backend.js";

export interface CropRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CaptureFrameOptions {
  readonly scale?: number;
  readonly mirror?: boolean;
  readonly crop?: CropRegion;
}

export interface CaptureBlobOptions extends CaptureFrameOptions {
  readonly type?: "image/jpeg" | "image/png" | "image/webp";
  readonly quality?: number;
}

export interface CapturedBlob {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly type: string;
  readonly timestamp: number;
}

export interface CapturedImageData {
  readonly imageData: ImageData;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
}

export interface CapturedImageBitmap {
  readonly imageBitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
}

export interface FrameCaptureBackend {
  toBlob(stream: MediaStream, options?: CaptureBlobOptions): Promise<CapturedBlob>;
  toImageData(stream: MediaStream, options?: CaptureFrameOptions): Promise<CapturedImageData>;
  toImageBitmap(stream: MediaStream, options?: CaptureFrameOptions): Promise<CapturedImageBitmap>;
  dispose(): void;
}

export interface CameraCaptureOptions {
  readonly backend?: FrameCaptureBackend;
}

export class CameraCapture {
  private backend: FrameCaptureBackend | null;
  private disposed = false;

  constructor(
    private readonly camera: Camera,
    options: CameraCaptureOptions = {},
  ) {
    this.backend = options.backend ?? null;
  }

  async toBlob(options: CaptureBlobOptions = {}): Promise<CapturedBlob> {
    return this.run((backend, stream) => backend.toBlob(stream, options));
  }

  async toImageData(options: CaptureFrameOptions = {}): Promise<CapturedImageData> {
    return this.run((backend, stream) => backend.toImageData(stream, options));
  }

  async toImageBitmap(options: CaptureFrameOptions = {}): Promise<CapturedImageBitmap> {
    return this.run((backend, stream) => backend.toImageBitmap(stream, options));
  }

  dispose(): void {
    if (this.disposed) return;
    this.backend?.dispose();
    this.backend = null;
    this.disposed = true;
  }

  private async run<T>(
    operation: (backend: FrameCaptureBackend, stream: MediaStream) => Promise<T>,
  ): Promise<T> {
    if (this.disposed) {
      throw new CameraError("CameraCapture has been disposed", {
        code: "DISPOSED",
        recoverable: false,
      });
    }

    const stream = this.camera.getActiveStream();
    if (!stream) {
      throw new CameraError("Camera must be active before capture", {
        code: "INVALID_STATE",
        recoverable: true,
      });
    }

    const backend = this.backend ?? (this.backend = new CanvasCaptureBackend());
    try {
      return await operation(backend, stream);
    } catch (error) {
      if (error instanceof CameraError) throw error;
      throw new CameraError("Camera frame capture failed", {
        code: "CAPTURE_FAILED",
        recoverable: true,
        cause: error,
      });
    }
  }
}
