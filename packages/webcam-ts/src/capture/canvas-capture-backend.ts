import { CameraError } from "../domain/camera-error.js";
import type {
  CaptureBlobOptions,
  CaptureFrameOptions,
  CapturedBlob,
  CapturedImageBitmap,
  CapturedImageData,
  FrameCaptureBackend,
} from "./camera-capture.js";

interface DrawnFrame {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export class CanvasCaptureBackend implements FrameCaptureBackend {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private disposed = false;

  async toBlob(stream: MediaStream, options: CaptureBlobOptions = {}): Promise<CapturedBlob> {
    const frame = await this.draw(stream, options);
    const type = options.type ?? "image/jpeg";
    const quality = options.quality === undefined ? 0.92 : Math.max(0, Math.min(1, options.quality));
    const blob = await new Promise<Blob>((resolve, reject) => {
      frame.canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Canvas returned an empty blob"))),
        type,
        quality,
      );
    });
    return Object.freeze({ blob, width: frame.width, height: frame.height, type, timestamp: Date.now() });
  }

  async toImageData(stream: MediaStream, options: CaptureFrameOptions = {}): Promise<CapturedImageData> {
    const frame = await this.draw(stream, options);
    return Object.freeze({
      imageData: frame.context.getImageData(0, 0, frame.width, frame.height),
      width: frame.width,
      height: frame.height,
      timestamp: Date.now(),
    });
  }

  async toImageBitmap(stream: MediaStream, options: CaptureFrameOptions = {}): Promise<CapturedImageBitmap> {
    const frame = await this.draw(stream, options);
    if (typeof globalThis.createImageBitmap !== "function") {
      throw new CameraError("ImageBitmap capture is not supported by this browser", {
        code: "UNSUPPORTED_BROWSER",
        recoverable: false,
      });
    }
    const imageBitmap = await globalThis.createImageBitmap(frame.canvas);
    return Object.freeze({ imageBitmap, width: frame.width, height: frame.height, timestamp: Date.now() });
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.video) this.video.srcObject = null;
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.video = null;
    this.canvas = null;
    this.context = null;
    this.disposed = true;
  }

  private async draw(stream: MediaStream, options: CaptureFrameOptions): Promise<DrawnFrame> {
    this.assertUsable();
    this.validateOptions(options);
    const video = await this.ensureVideo(stream);
    const source = options.crop ?? { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
    if (source.width <= 0 || source.height <= 0) {
      throw new CameraError("Camera frame dimensions are not available", {
        code: "CAPTURE_FAILED",
        recoverable: true,
      });
    }

    const scale = options.scale ?? 1;
    const width = Math.max(1, Math.floor(source.width * scale));
    const height = Math.max(1, Math.floor(source.height * scale));
    const { canvas, context } = this.ensureCanvas();
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    context.setTransform(options.mirror ? -1 : 1, 0, 0, 1, options.mirror ? width : 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(
      video,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      width,
      height,
    );
    context.setTransform(1, 0, 0, 1, 0, 0);
    return { canvas, context, width, height };
  }

  private async ensureVideo(stream: MediaStream): Promise<HTMLVideoElement> {
    const documentValue = globalThis.document;
    if (!documentValue?.createElement) {
      throw new CameraError("Canvas capture requires a browser document", {
        code: "UNSUPPORTED_RUNTIME",
        recoverable: false,
      });
    }

    const video = this.video ?? (this.video = documentValue.createElement("video"));
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (video.readyState < 2) {
      await video.play();
      if (video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const timeout = globalThis.setTimeout(() => {
            cleanup();
            reject(new Error("Timed out waiting for a camera frame"));
          }, 2_000);
          const onReady = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            globalThis.clearTimeout(timeout);
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("canplay", onReady);
          };
          video.addEventListener("loadeddata", onReady, { once: true });
          video.addEventListener("canplay", onReady, { once: true });
        });
      }
    }
    return video;
  }

  private ensureCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
    const documentValue = globalThis.document;
    if (!documentValue?.createElement) {
      throw new CameraError("Canvas capture requires a browser document", {
        code: "UNSUPPORTED_RUNTIME",
        recoverable: false,
      });
    }
    const canvas = this.canvas ?? (this.canvas = documentValue.createElement("canvas"));
    const context = this.context ?? (this.context = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    }));
    if (!context) {
      throw new CameraError("Unable to create a 2D capture context", {
        code: "CAPTURE_FAILED",
        recoverable: false,
      });
    }
    return { canvas, context };
  }

  private validateOptions(options: CaptureFrameOptions): void {
    if (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0)) {
      throw new CameraError("Capture scale must be greater than zero", {
        code: "INVALID_REQUEST",
        recoverable: true,
      });
    }
    if (options.crop && [options.crop.x, options.crop.y, options.crop.width, options.crop.height].some((value) => !Number.isFinite(value))) {
      throw new CameraError("Capture crop values must be finite", {
        code: "INVALID_REQUEST",
        recoverable: true,
      });
    }
    if (options.crop && (options.crop.x < 0 || options.crop.y < 0 || options.crop.width <= 0 || options.crop.height <= 0)) {
      throw new CameraError("Capture crop must have non-negative coordinates and positive dimensions", {
        code: "INVALID_REQUEST",
        recoverable: true,
      });
    }
  }

  private assertUsable(): void {
    if (!this.disposed) return;
    throw new CameraError("Capture backend has been disposed", {
      code: "DISPOSED",
      recoverable: false,
    });
  }
}
