import { CameraError, type CameraOperation } from "./domain/camera-error.js";
import type { CameraEvent, CameraEventListener } from "./domain/camera-event.js";
import { assertCommandAllowed } from "./domain/camera-lifecycle.js";
import { buildMediaStreamConstraints, type CameraRequest } from "./domain/camera-request.js";
import type { CameraState, CameraStatus } from "./domain/camera-state.js";
import { CameraEventHub } from "./events/camera-event-hub.js";
import { OperationController, type OperationToken } from "./operation-token.js";
import { BrowserMediaDevicesAdapter } from "./platform/browser-media-devices-adapter.js";
import { normalizeBrowserError } from "./platform/browser-error-normalizer.js";
import type { MediaDevicesPort } from "./platform/media-devices-port.js";
import { stopStream } from "./platform/stream-cleanup.js";

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
  private readonly mediaDevices: MediaDevicesPort;
  private readonly operations = new OperationController();
  private readonly now: () => number;
  private readonly createSessionId: () => string;
  private state: CameraState = initialState();
  private activeStream: MediaStream | null = null;
  private activeTrack: MediaStreamTrack | null = null;
  private activeTrackEndedListener: (() => void) | null = null;
  private candidateStream: MediaStream | null = null;

  constructor(options: CameraOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createSessionId = options.createSessionId ?? (() => `camera-${this.now()}-${Math.random().toString(36).slice(2)}`);
    this.mediaDevices = options.mediaDevices ?? new BrowserMediaDevicesAdapter();
  }

  start(request: CameraRequest = {}): Promise<void> {
    return this.runStart(request);
  }

  switch(request: CameraRequest): Promise<void> {
    return this.runSwitch(request);
  }

  stop(): Promise<void> {
    return this.runStop();
  }

  async dispose(): Promise<void> {
    if (this.state.status === "disposed") return;
    await this.runDispose();
    this.events.clear();
  }

  getState(): CameraState {
    return this.state;
  }

  getActiveStream(): MediaStream | null {
    return this.activeStream;
  }

  getActiveTrack(): MediaStreamTrack | null {
    return this.activeTrack;
  }

  subscribe(listener: CameraEventListener): () => void {
    return this.events.subscribe(listener);
  }

  private async runStart(request: CameraRequest = {}): Promise<void> {
    assertCommandAllowed(this.state.status, "start");
    const token = this.operations.begin("start");
    this.setStatus("starting");
    this.events.emit({ type: "operation-started", operation: "start", operationId: token.id });

    let candidate: MediaStream | null = null;
    try {
      const constraints = buildMediaStreamConstraints(request);
      candidate = await this.mediaDevices.open(constraints);
      this.candidateStream = candidate;
      this.assertRequestCurrent(request, token);
      const track = this.validateCandidate(candidate, "start");
      this.assertRequestCurrent(request, token);

      this.commitStream(candidate, track, "started");
      this.setStatus("active");
      this.completeOperation("start", token.id);
    } catch (error) {
      this.releaseCandidateStream(candidate);
      const cameraError = this.resolveOperationError(error, token, "start");
      if (this.operations.isCurrent(token) && this.state.status === "starting") this.setStatus("idle");
      this.failOperation("start", token.id, cameraError);
      throw cameraError;
    }
  }

  private async runSwitch(request: CameraRequest): Promise<void> {
    assertCommandAllowed(this.state.status, "switch");
    const token = this.operations.begin("switch");
    this.setStatus("switching");
    this.events.emit({ type: "operation-started", operation: "switch", operationId: token.id });

    let candidate: MediaStream | null = null;
    try {
      const constraints = buildMediaStreamConstraints(request);
      candidate = await this.mediaDevices.open(constraints);
      this.candidateStream = candidate;
      this.assertRequestCurrent(request, token);
      const track = this.validateCandidate(candidate, "switch");
      this.assertRequestCurrent(request, token);

      const previousStream = this.activeStream;
      this.commitStream(candidate, track, "switched");
      this.setStatus("active");
      if (previousStream) stopStream(previousStream);
      this.completeOperation("switch", token.id);
    } catch (error) {
      this.releaseCandidateStream(candidate);
      const cameraError = this.resolveOperationError(error, token, "switch");
      if (this.operations.isCurrent(token) && this.state.status === "switching") {
        this.setStatus(this.activeStream ? "active" : "idle");
      }
      this.failOperation("switch", token.id, cameraError);
      throw cameraError;
    }
  }

  private async runStop(): Promise<void> {
    assertCommandAllowed(this.state.status, "stop");
    if (this.state.status === "idle") return;

    const operationId = this.operations.nextOperationId();
    this.operations.invalidate("OPERATION_ABORTED");
    this.setStatus("stopping");
    this.events.emit({ type: "operation-started", operation: "stop", operationId });

    this.releaseStream("stopped");
    this.setStatus("idle");
    this.completeOperation("stop", operationId);
  }

  private async runDispose(): Promise<void> {
    const operationId = this.operations.nextOperationId();
    this.operations.invalidate("DISPOSED");
    this.events.emit({ type: "operation-started", operation: "dispose", operationId });

    this.releaseStream("disposed");
    this.setStatus("disposed");
    this.completeOperation("dispose", operationId);
  }

  private commitStream(
    stream: MediaStream,
    track: MediaStreamTrack,
    reason: "started" | "switched",
  ): void {
    const previousStream = this.activeStream;
    this.candidateStream = null;
    this.detachActiveTrackEndedListener();
    this.activeStream = stream;
    this.activeTrack = track;
    this.attachActiveTrackEndedListener(track);

    const settings = cloneAndFreeze(track.getSettings());
    const capabilities = cloneAndFreeze(track.getCapabilities());
    const beginsSession = reason === "started" || this.state.sessionId === null;
    this.updateState({
      sessionId: beginsSession ? this.createSessionId() : this.state.sessionId,
      deviceId: settings.deviceId ?? null,
      trackLabel: track.label ?? null,
      settings,
      capabilities,
      startedAt: beginsSession ? this.now() : this.state.startedAt,
    });

    this.events.emit({ type: "stream-changed", stream, previousStream, reason });
  }

  private releaseStream(reason: "stopped" | "disposed" | "ended"): void {
    const previousStream = this.activeStream;
    this.detachActiveTrackEndedListener();
    this.activeStream = null;
    this.activeTrack = null;
    this.releaseCandidateStream(this.candidateStream);
    if (previousStream) stopStream(previousStream);
    if (!previousStream) return;

    this.updateState({
      sessionId: null,
      deviceId: null,
      trackLabel: null,
      settings: null,
      capabilities: null,
      startedAt: null,
    });
    this.events.emit({ type: "stream-changed", stream: null, previousStream, reason });
  }

  private releaseCandidateStream(stream: MediaStream | null): void {
    if (!stream) return;
    if (this.candidateStream === stream) this.candidateStream = null;
    if (stream !== this.activeStream) stopStream(stream);
  }

  private attachActiveTrackEndedListener(track: MediaStreamTrack): void {
    const listener = () => this.handleActiveTrackEnded(track);
    this.activeTrackEndedListener = listener;
    track.addEventListener?.("ended", listener);
  }

  private detachActiveTrackEndedListener(): void {
    if (this.activeTrack && this.activeTrackEndedListener) {
      this.activeTrack.removeEventListener?.("ended", this.activeTrackEndedListener);
    }
    this.activeTrackEndedListener = null;
  }

  private handleActiveTrackEnded(track: MediaStreamTrack): void {
    if (track !== this.activeTrack || this.state.status === "disposed" || this.state.status === "stopping") {
      return;
    }

    const wasActive = this.state.status === "active";
    if (wasActive) this.setStatus("stopping");
    this.releaseStream("ended");

    const error = new CameraError("The active camera track ended unexpectedly", {
      code: "TRACK_ENDED",
      recoverable: true,
    });
    this.updateState({ lastError: error.toSnapshot() });
    this.events.emit({ type: "session-ended", error });
    if (wasActive) this.setStatus("idle");
  }

  private setStatus(status: CameraStatus): void {
    this.updateState({ status });
  }

  private assertRequestCurrent(request: CameraRequest, token: OperationToken): void {
    if (request.signal?.aborted) token.invalidate("OPERATION_ABORTED");
    token.throwIfInvalid();
  }

  private validateCandidate(stream: MediaStream, operation: "start" | "switch"): MediaStreamTrack {
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === "ended") {
      throw new CameraError("Camera stream does not contain a live video track", {
        code: "STREAM_INVALID",
        operation,
        recoverable: true,
      });
    }
    return track;
  }

  private resolveOperationError(
    error: unknown,
    token: OperationToken,
    operation: "start" | "switch",
  ): CameraError {
    if (!token.isCurrent()) return token.toInvalidError();
    if (error instanceof CameraError) {
      if (error.operation === operation) return error;
      return new CameraError(error.message, {
        code: error.code,
        operation,
        recoverable: error.recoverable,
        cause: error.cause ?? error,
        ...(error.context ? { context: error.context } : {}),
      });
    }
    return normalizeBrowserError(error, operation);
  }

  private completeOperation(operation: CameraOperation, operationId: number): void {
    if (this.state.lastError) this.updateState({ lastError: null });
    this.events.emit({ type: "operation-completed", operation, operationId });
  }

  private failOperation(operation: CameraOperation, operationId: number, error: CameraError): void {
    this.updateState({ lastError: error.toSnapshot() });
    this.events.emit({ type: "operation-failed", operation, operationId, error });
  }

  private updateState(patch: Partial<CameraState>): void {
    this.state = deepFreeze({ ...this.state, ...patch });
    const event: CameraEvent = { type: "state-changed", state: this.state };
    this.events.emit(event);
  }
}
