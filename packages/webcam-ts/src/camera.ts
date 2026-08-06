import type { CameraEvent, CameraEventListener } from "./domain/camera-event.js";
import { CameraEventHub } from "./events/camera-event-hub.js";
import type { CameraRequest } from "./domain/camera-request.js";
import type { CameraState, CameraStatus } from "./domain/camera-state.js";
import type { CameraError, CameraOperation } from "./domain/camera-error.js";
import { BrowserMediaDevicesAdapter } from "./platform/browser-media-devices-adapter.js";
import type { MediaDevicesPort } from "./platform/media-devices-port.js";
import {
  CameraSession,
  type CameraSessionObserver,
  type StreamChangeReason,
} from "./session/camera-session.js";

export interface CameraOptions {
  readonly mediaDevices?: MediaDevicesPort;
  readonly now?: () => number;
  readonly createSessionId?: () => string;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item))) as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = cloneAndFreeze(nested);
  }
  return Object.freeze(clone) as T;
}

function initialState(): CameraState {
  return deepFreeze({
    status: "idle" as const,
    sessionId: null,
    deviceId: null,
    trackLabel: null,
    settings: null,
    capabilities: null,
    startedAt: null,
    lastError: null,
  });
}

export class Camera {
  private readonly events = new CameraEventHub();
  private readonly session: CameraSession;
  private readonly now: () => number;
  private readonly createSessionId: () => string;
  private state: CameraState = initialState();

  constructor(options: CameraOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createSessionId = options.createSessionId ?? (() => `camera-${this.now()}-${Math.random().toString(36).slice(2)}`);

    const observer: CameraSessionObserver = {
      onStatusChanged: (status) => this.onStatusChanged(status),
      onStreamChanged: (stream, previous, reason) => this.onStreamChanged(stream, previous, reason),
      onOperationStarted: (operation, operationId) => {
        this.events.emit({ type: "operation-started", operation, operationId });
      },
      onOperationCompleted: (operation, operationId) => this.onOperationCompleted(operation, operationId),
      onOperationFailed: (operation, operationId, error) => this.onOperationFailed(operation, operationId, error),
      onSessionEnded: (error) => this.onSessionEnded(error),
    };

    this.session = new CameraSession(options.mediaDevices ?? new BrowserMediaDevicesAdapter(), observer);
  }

  start(request: CameraRequest = {}): Promise<void> {
    return this.session.start(request);
  }

  switch(request: CameraRequest): Promise<void> {
    return this.session.switch(request);
  }

  stop(): Promise<void> {
    return this.session.stop();
  }

  async dispose(): Promise<void> {
    if (this.state.status === "disposed") return;
    await this.session.dispose();
    this.events.clear();
  }

  getState(): CameraState {
    return this.state;
  }

  getActiveStream(): MediaStream | null {
    return this.session.getActiveStream();
  }

  getActiveTrack(): MediaStreamTrack | null {
    return this.session.getActiveTrack();
  }

  subscribe(listener: CameraEventListener): () => void {
    return this.events.subscribe(listener);
  }

  private onStatusChanged(status: CameraStatus): void {
    this.updateState({ status });
  }

  private onStreamChanged(
    stream: MediaStream | null,
    previousStream: MediaStream | null,
    reason: StreamChangeReason,
  ): void {
    if (stream) {
      const track = stream.getVideoTracks()[0] ?? null;
      const settings = track ? cloneAndFreeze(track.getSettings()) : null;
      const capabilities = track ? cloneAndFreeze(track.getCapabilities()) : null;
      const beginsSession = reason === "started" || this.state.sessionId === null;
      this.updateState({
        sessionId: beginsSession ? this.createSessionId() : this.state.sessionId,
        deviceId: settings?.deviceId ?? null,
        trackLabel: track?.label ?? null,
        settings,
        capabilities,
        startedAt: beginsSession ? this.now() : this.state.startedAt,
      });
    } else {
      this.updateState({
        sessionId: null,
        deviceId: null,
        trackLabel: null,
        settings: null,
        capabilities: null,
        startedAt: null,
      });
    }

    this.events.emit({
      type: "stream-changed",
      stream,
      previousStream,
      reason,
    });
  }


  private onSessionEnded(error: CameraError): void {
    this.updateState({ lastError: error.toSnapshot() });
    this.events.emit({ type: "session-ended", error });
  }

  private onOperationCompleted(operation: CameraOperation, operationId: number): void {
    if (this.state.lastError) this.updateState({ lastError: null });
    this.events.emit({ type: "operation-completed", operation, operationId });
  }

  private onOperationFailed(operation: CameraOperation, operationId: number, error: CameraError): void {
    this.updateState({ lastError: error.toSnapshot() });
    this.events.emit({ type: "operation-failed", operation, operationId, error });
  }

  private updateState(patch: Partial<CameraState>): void {
    this.state = deepFreeze({ ...this.state, ...patch });
    const event: CameraEvent = { type: "state-changed", state: this.state };
    this.events.emit(event);
  }
}
