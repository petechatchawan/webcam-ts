import type { Camera } from "../camera.js";
import { CameraError } from "../domain/camera-error.js";

export interface VideoPreviewOptions {
  readonly autoplay?: boolean;
  readonly muted?: boolean;
  readonly playsInline?: boolean;
  readonly mirror?: boolean;
}

export class VideoPreview {
  private camera: Camera | null = null;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  private mirror: boolean;
  private element: HTMLVideoElement | null;
  private readonly autoplay: boolean;
  private readonly muted: boolean;
  private readonly playsInline: boolean;

  constructor(element: HTMLVideoElement, options: VideoPreviewOptions = {}) {
    this.element = element;
    this.autoplay = options.autoplay ?? true;
    this.muted = options.muted ?? true;
    this.playsInline = options.playsInline ?? true;
    this.mirror = options.mirror ?? false;
    this.applyElementOptions();
  }

  bind(camera: Camera): void {
    this.assertUsable();
    this.detach();
    this.camera = camera;
    this.unsubscribe = camera.subscribe((event) => {
      if (event.type !== "stream-changed") return;
      this.applyStream(event.stream);
    });
    this.applyStream(camera.getActiveStream());
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.camera = null;
    if (this.element) this.element.srcObject = null;
  }

  setElement(element: HTMLVideoElement): void {
    this.assertUsable();
    if (this.element) this.element.srcObject = null;
    this.element = element;
    this.applyElementOptions();
    this.applyStream(this.camera?.getActiveStream() ?? null);
  }

  setMirror(mirror: boolean): void {
    this.assertUsable();
    this.mirror = mirror;
    this.applyMirror();
  }

  dispose(): void {
    if (this.disposed) return;
    this.detach();
    if (this.element) this.element.style.transform = "";
    this.element = null;
    this.disposed = true;
  }

  private applyElementOptions(): void {
    if (!this.element) return;
    this.element.autoplay = this.autoplay;
    this.element.muted = this.muted;
    this.element.playsInline = this.playsInline;
    this.applyMirror();
  }

  private applyMirror(): void {
    if (!this.element) return;
    this.element.style.transform = this.mirror ? "scaleX(-1)" : "";
  }

  private applyStream(stream: MediaStream | null): void {
    if (!this.element) return;
    this.element.srcObject = stream;
    if (stream && this.autoplay) {
      void this.element.play().catch(() => undefined);
    }
  }

  private assertUsable(): void {
    if (!this.disposed) return;
    throw new CameraError("VideoPreview has been disposed", {
      code: "DISPOSED",
      recoverable: false,
    });
  }
}
