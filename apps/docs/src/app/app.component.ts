import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  Camera,
  CameraError,
  type CameraState,
} from "webcam-ts";
import { CameraCapture } from "webcam-ts/capture";
import {
  CameraDeviceManager,
  CameraPermissionService,
  type CameraDevice,
} from "webcam-ts/devices";
import { VideoPreview } from "webcam-ts/preview";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild("video", { static: true })
  private videoRef!: ElementRef<HTMLVideoElement>;

  readonly title = "Webcam-TS v4 Playground";
  readonly camera = new Camera();
  readonly capture = new CameraCapture(this.camera);
  readonly deviceManager = new CameraDeviceManager();
  readonly permissionService = new CameraPermissionService();

  state: CameraState = this.camera.getState();
  devices: readonly CameraDevice[] = [];
  selectedDeviceId = "";
  mirror = true;
  permissionState = "unknown";
  errorMessage = "";
  photoUrl: string | null = null;

  private preview: VideoPreview | null = null;
  private readonly unsubscribeCamera = this.camera.subscribe((event) => {
    if (event.type === "state-changed") this.state = event.state;
    if (event.type === "operation-failed") this.showError(event.error);
  });

  ngAfterViewInit(): void {
    this.preview = new VideoPreview(this.videoRef.nativeElement, {
      mirror: this.mirror,
    });
    this.preview.bind(this.camera);
    void this.refreshDevices();
  }

  async requestPermission(): Promise<void> {
    this.clearError();
    try {
      const permissions = await this.permissionService.request({ video: true });
      this.permissionState = permissions.camera;
      await this.refreshDevices();
    } catch (error) {
      this.showError(error);
    }
  }

  async refreshDevices(): Promise<void> {
    try {
      this.devices = await this.deviceManager.list();
      if (!this.selectedDeviceId && this.devices[0]) {
        this.selectedDeviceId = this.devices[0].deviceId;
      }
    } catch (error) {
      this.showError(error);
    }
  }

  async start(): Promise<void> {
    this.clearError();
    try {
      await this.camera.start({
        ...(this.selectedDeviceId ? { deviceId: this.selectedDeviceId } : {}),
        resolution: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (error) {
      this.showError(error);
    }
  }

  async switchCamera(): Promise<void> {
    this.clearError();
    if (!this.selectedDeviceId) return;
    try {
      await this.camera.switch({ deviceId: this.selectedDeviceId });
    } catch (error) {
      this.showError(error);
    }
  }

  async stop(): Promise<void> {
    this.clearError();
    try {
      await this.camera.stop();
    } catch (error) {
      this.showError(error);
    }
  }

  async capturePhoto(): Promise<void> {
    this.clearError();
    try {
      const result = await this.capture.toBlob({ type: "image/jpeg", quality: 0.92 });
      if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
      this.photoUrl = URL.createObjectURL(result.blob);
    } catch (error) {
      this.showError(error);
    }
  }

  setMirror(enabled: boolean): void {
    this.mirror = enabled;
    this.preview?.setMirror(enabled);
  }

  ngOnDestroy(): void {
    this.unsubscribeCamera();
    this.preview?.dispose();
    this.capture.dispose();
    this.deviceManager.dispose();
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    void this.camera.dispose();
  }

  private clearError(): void {
    this.errorMessage = "";
  }

  private showError(error: unknown): void {
    this.errorMessage =
      error instanceof CameraError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown camera error";
  }
}
