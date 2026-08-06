import {
  Camera,
  type CameraEvent,
  type CameraEventListener,
  type CameraRequest,
  type CameraState,
} from "webcam-ts";
import {
  CameraCapture,
  type CaptureBlobOptions,
  type CapturedBlob,
} from "webcam-ts/capture";
import {
  CameraControls,
  type CameraControlUpdate,
} from "webcam-ts/controls";
import {
  CameraDeviceManager,
  CameraPermissionService,
  type CameraDevice,
  type CameraPermissionMap,
} from "webcam-ts/devices";
import { VideoPreview } from "webcam-ts/preview";
import {
  appendEventLog,
  buildCameraRequest,
  deriveCommandAvailability,
  hasCameraPermission,
  projectCameraError,
  projectRequestedResolution,
  projectResolutionSelectionError,
  replaceObjectUrl,
} from "./playground-logic.js";
import type {
  CameraSelection,
  CaptureSnapshot,
  ControlSnapshot,
  PlaygroundEventEntry,
  PlaygroundSnapshot,
  UrlPort,
} from "./models.js";

interface ExtendedCapabilities extends MediaTrackCapabilities {
  readonly torch?: boolean;
  readonly zoom?: Readonly<{ min: number; max: number; step?: number }>;
  readonly focusMode?: readonly string[];
}

interface ExtendedSettings extends MediaTrackSettings {
  readonly zoom?: number;
  readonly torch?: boolean;
  readonly focusMode?: string;
}

export interface CameraPort {
  start(request?: CameraRequest): Promise<void>;
  switch(request: CameraRequest): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  getState(): CameraState;
  subscribe(listener: CameraEventListener): () => void;
}

export interface PreviewPort {
  setMirror(mirror: boolean): void;
  dispose(): void;
}

export interface CapturePort {
  toBlob(options?: CaptureBlobOptions): Promise<CapturedBlob>;
  dispose(): void;
}

export interface DeviceManagerPort {
  list(): Promise<readonly CameraDevice[]>;
  subscribe(listener: (devices: readonly CameraDevice[]) => void): () => void;
  dispose(): void;
}

export interface PermissionPort {
  query(): Promise<CameraPermissionMap>;
  request(request?: Readonly<{ video?: boolean; audio?: boolean }>): Promise<CameraPermissionMap>;
}

export interface ControlsPort {
  getCapabilities(): Readonly<MediaTrackCapabilities>;
  set(update: CameraControlUpdate): Promise<Readonly<MediaTrackSettings>>;
}

export interface CameraControllerDependencies {
  readonly camera: CameraPort;
  readonly preview: PreviewPort;
  readonly capture: CapturePort;
  readonly devices: DeviceManagerPort;
  readonly permissions: PermissionPort;
  readonly controls: ControlsPort;
  readonly urlPort?: UrlPort;
  readonly now?: () => number;
}

export type PlaygroundListener = (snapshot: PlaygroundSnapshot) => void;

const unknownPermissions: CameraPermissionMap = Object.freeze({
  camera: "unknown",
  microphone: "unknown",
});

const PERMISSION_GRANT_KEY = "webcam-ts.permission-granted";

function readCameraGrant(): boolean {
  try {
    return globalThis.localStorage?.getItem(PERMISSION_GRANT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCameraGrant(): void {
  try {
    globalThis.localStorage?.setItem(PERMISSION_GRANT_KEY, "1");
  } catch {
    // Storage is best-effort; the prompt can reappear if it is unavailable.
  }
}

function rememberGrantedCamera(query: CameraPermissionMap): CameraPermissionMap {
  return readCameraGrant() && query.camera !== "denied"
    ? Object.freeze({ ...query, camera: "granted" })
    : query;
}

const emptyControls: ControlSnapshot = Object.freeze({
  torchSupported: false,
  zoom: null,
  focusModes: Object.freeze([]),
  settings: Object.freeze({}),
});

export class CameraController {
  private readonly camera: CameraPort;
  private readonly preview: PreviewPort;
  private readonly captureService: CapturePort;
  private readonly deviceManager: DeviceManagerPort;
  private readonly permissionService: PermissionPort;
  private readonly controlsService: ControlsPort;
  private readonly urlPort: UrlPort;
  private readonly now: () => number;
  private readonly listeners = new Set<PlaygroundListener>();
  private cameraUnsubscribe: (() => void) | null = null;
  private deviceUnsubscribe: (() => void) | null = null;
  private eventId = 0;
  private captureUrl: string | null = null;
  private disposed = false;
  private snapshot: PlaygroundSnapshot;

  constructor(dependencies: CameraControllerDependencies) {
    this.camera = dependencies.camera;
    this.preview = dependencies.preview;
    this.captureService = dependencies.capture;
    this.deviceManager = dependencies.devices;
    this.permissionService = dependencies.permissions;
    this.controlsService = dependencies.controls;
    this.urlPort = dependencies.urlPort ?? URL;
    this.now = dependencies.now ?? Date.now;

    const cameraState = this.camera.getState();
    this.snapshot = Object.freeze({
      camera: cameraState,
      permissions: readCameraGrant()
        ? Object.freeze({ camera: "granted", microphone: "unknown" })
        : unknownPermissions,
      devices: Object.freeze([]),
      availability: deriveCommandAvailability(cameraState.status),
      controls: emptyControls,
      requestedResolution: null,
      capture: null,
      error: null,
      events: Object.freeze([]),
    });
  }

  async initialize(): Promise<void> {
    this.assertUsable();
    if (!this.cameraUnsubscribe) {
      this.cameraUnsubscribe = this.camera.subscribe((event) => this.onCameraEvent(event));
    }
    if (!this.deviceUnsubscribe) {
      this.deviceUnsubscribe = this.deviceManager.subscribe((devices) => {
        this.patch({ devices: Object.freeze([...devices]) });
      });
    }

    const [permissions, devices] = await Promise.allSettled([
      this.permissionService.query(),
      this.deviceManager.list(),
    ]);

    if (permissions.status === "fulfilled") {
      this.patch({ permissions: rememberGrantedCamera(permissions.value) });
    } else {
      this.recordFailure(permissions.reason);
    }

    if (devices.status === "fulfilled") {
      this.patch({ devices: Object.freeze([...devices.value]) });
    } else {
      this.recordFailure(devices.reason);
    }
  }

  getSnapshot(): PlaygroundSnapshot {
    return this.snapshot;
  }

  subscribe(listener: PlaygroundListener): () => void {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
    };
  }

  async start(selection: CameraSelection): Promise<void> {
    this.assertCameraPermission("start");
    this.preview.setMirror(selection.mirror);
    await this.runResolutionOperation(selection, () =>
      this.camera.start(buildCameraRequest(selection)),
    );
    this.patch({ requestedResolution: projectRequestedResolution(selection) });
    await this.refreshAfterStreamChange();
  }

  async switch(selection: CameraSelection): Promise<void> {
    this.assertCameraPermission("switch");
    this.preview.setMirror(selection.mirror);
    await this.runResolutionOperation(selection, () =>
      this.camera.switch(buildCameraRequest(selection)),
    );
    this.patch({ requestedResolution: projectRequestedResolution(selection) });
    await this.refreshAfterStreamChange();
  }

  async stop(): Promise<void> {
    await this.run(() => this.camera.stop());
    this.patch({ controls: emptyControls, requestedResolution: null });
  }

  async requestPermissions(audio: boolean): Promise<void> {
    await this.run(async () => {
      const permissions = await this.permissionService.request({ video: true, audio });
      if (permissions.camera === "granted") writeCameraGrant();
      this.patch({ permissions });
      await this.refreshDevices();
    });
  }

  async refreshDevices(): Promise<void> {
    await this.run(async () => {
      const devices = await this.deviceManager.list();
      this.patch({ devices: Object.freeze([...devices]) });
    });
  }

  async capture(options: CaptureBlobOptions): Promise<CaptureSnapshot> {
    const result = await this.run(() => this.captureService.toBlob(options));

    this.captureUrl = replaceObjectUrl(this.captureUrl, result.blob, this.urlPort);
    const capture = Object.freeze({
      url: this.captureUrl ?? "",
      width: result.width,
      height: result.height,
      type: result.type,
      size: result.blob.size,
      timestamp: result.timestamp,
    });
    this.patch({ capture });
    return capture;
  }

  async applyControls(update: CameraControlUpdate): Promise<void> {
    await this.run(async () => {
      const settings = await this.controlsService.set(update);
      this.patch({ controls: this.buildControls(settings) });
    });
  }

  setMirror(mirror: boolean): void {
    this.assertUsable();
    this.preview.setMirror(mirror);
  }

  clearError(): void {
    this.assertUsable();
    this.patch({ error: null });
  }

  clearEvents(): void {
    this.assertUsable();
    this.patch({ events: Object.freeze([]) });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.cameraUnsubscribe?.();
    this.deviceUnsubscribe?.();
    this.cameraUnsubscribe = null;
    this.deviceUnsubscribe = null;
    this.listeners.clear();
    this.captureUrl = replaceObjectUrl(this.captureUrl, null, this.urlPort);
    this.preview.dispose();
    this.captureService.dispose();
    this.deviceManager.dispose();
    await this.camera.dispose();
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertUsable();
    this.patch({ error: null });
    try {
      return await operation();
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  private async runResolutionOperation<T>(
    selection: CameraSelection,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.run(operation);
    } catch (error) {
      this.patch({ error: projectResolutionSelectionError(error, selection) });
      throw error;
    }
  }

  private assertCameraPermission(operation: "start" | "switch"): void {
    this.assertUsable();
    if (hasCameraPermission(this.snapshot.permissions.camera) || readCameraGrant()) return;

    const error = Object.assign(
      new Error("Allow camera access before starting or switching a camera session."),
      {
        code: "PERMISSION_REQUIRED",
        operation,
        recoverable: true,
        context: Object.freeze({ permission: this.snapshot.permissions.camera }),
      },
    );
    this.recordFailure(error);
    throw error;
  }

  private async refreshAfterStreamChange(): Promise<void> {
    this.refreshControls();
    try {
      const devices = await this.deviceManager.list();
      this.patch({ devices: Object.freeze([...devices]) });
    } catch (error) {
      this.recordFailure(error);
    }
  }

  private refreshControls(): void {
    if (this.camera.getState().status !== "active") {
      this.patch({ controls: emptyControls });
      return;
    }
    try {
      this.patch({ controls: this.buildControls(this.camera.getState().settings ?? {}) });
    } catch (error) {
      this.recordFailure(error);
      this.patch({ controls: emptyControls });
    }
  }

  private buildControls(settingsInput: Readonly<MediaTrackSettings>): ControlSnapshot {
    const capabilities = this.controlsService.getCapabilities() as ExtendedCapabilities;
    const settings = settingsInput as ExtendedSettings;
    const zoom = capabilities.zoom
      ? Object.freeze({
          min: capabilities.zoom.min,
          max: capabilities.zoom.max,
          step: capabilities.zoom.step ?? 0.1,
          value:
            typeof settings.zoom === "number"
              ? settings.zoom
              : capabilities.zoom.min,
        })
      : null;

    return Object.freeze({
      torchSupported: typeof capabilities.torch === "boolean",
      zoom,
      focusModes: Object.freeze([...(capabilities.focusMode ?? [])]),
      settings: Object.freeze({ ...settings }),
    });
  }

  private onCameraEvent(event: CameraEvent): void {
    if (event.type === "state-changed") {
      const stableWithoutStream = event.state.status === "idle" || event.state.status === "disposed";
      this.patch({
        camera: event.state,
        availability: deriveCommandAvailability(event.state.status),
        ...(stableWithoutStream ? { requestedResolution: null } : {}),
      });
    }
    if (event.type === "operation-failed" || event.type === "session-ended") {
      this.patch({ error: projectCameraError(event.error) });
    }
    if (event.type === "stream-changed") {
      this.refreshControls();
    }

    const entry: PlaygroundEventEntry = Object.freeze({
      id: ++this.eventId,
      timestamp: this.now(),
      type: event.type,
      summary: summarizeEvent(event),
    });
    this.patch({ events: appendEventLog(this.snapshot.events, entry) });
  }

  private recordFailure(error: unknown): void {
    this.patch({ error: projectCameraError(error) });
  }

  private patch(patch: Partial<PlaygroundSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    for (const listener of [...this.listeners]) {
      try {
        listener(this.snapshot);
      } catch {
        // Consumer rendering failures cannot alter camera lifecycle.
      }
    }
  }

  private assertUsable(): void {
    if (!this.disposed) return;
    throw new Error("CameraController has been disposed");
  }
}

export function createBrowserCameraController(videoElement: HTMLVideoElement): CameraController {
  const camera = new Camera();
  const preview = new VideoPreview(videoElement, {
    autoplay: true,
    muted: true,
    playsInline: true,
    mirror: true,
  });
  preview.bind(camera);

  return new CameraController({
    camera,
    preview,
    capture: new CameraCapture(camera),
    devices: new CameraDeviceManager(),
    permissions: new CameraPermissionService(),
    controls: new CameraControls(camera),
  });
}

function summarizeEvent(event: CameraEvent): string {
  switch (event.type) {
    case "state-changed":
      return `State → ${event.state.status}`;
    case "stream-changed":
      return `Stream ${event.reason}`;
    case "operation-started":
      return `${event.operation} #${event.operationId} started`;
    case "operation-completed":
      return `${event.operation} #${event.operationId} completed`;
    case "operation-failed":
      return `${event.operation} #${event.operationId} failed: ${event.error.code}`;
    case "session-ended":
      return `Session ended: ${event.error.code}`;
  }
}
