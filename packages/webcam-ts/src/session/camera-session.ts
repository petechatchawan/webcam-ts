import { CameraError, type CameraOperation } from "../domain/camera-error.js";
import { buildMediaStreamConstraints, type CameraRequest } from "../domain/camera-request.js";
import type { CameraStatus } from "../domain/camera-state.js";
import type { MediaDevicesPort } from "../platform/media-devices-port.js";
import { normalizeBrowserError } from "../platform/browser-error-normalizer.js";
import { assertCommandAllowed } from "./lifecycle-machine.js";
import { OperationController, type OperationToken } from "./operation-controller.js";
import { stopStream } from "./stream-cleanup.js";

export type StreamChangeReason = "started" | "switched" | "stopped" | "disposed" | "ended";

export interface CameraSessionObserver {
  onStatusChanged(status: CameraStatus): void;
  onStreamChanged(
    stream: MediaStream | null,
    previousStream: MediaStream | null,
    reason: StreamChangeReason,
  ): void;
  onOperationStarted(operation: CameraOperation, operationId: number): void;
  onOperationCompleted(operation: CameraOperation, operationId: number): void;
  onOperationFailed(operation: CameraOperation, operationId: number, error: CameraError): void;
  onSessionEnded(error: CameraError): void;
}

export class CameraSession {
  private status: CameraStatus = "idle";
  private activeStream: MediaStream | null = null;
  private activeTrack: MediaStreamTrack | null = null;
  private activeTrackEndedListener: (() => void) | null = null;
  private readonly candidates = new Set<MediaStream>();
  private readonly operations = new OperationController();

  constructor(
    private readonly mediaDevices: MediaDevicesPort,
    private readonly observer: CameraSessionObserver,
  ) {}

  getStatus(): CameraStatus {
    return this.status;
  }

  getActiveStream(): MediaStream | null {
    return this.activeStream;
  }

  getActiveTrack(): MediaStreamTrack | null {
    return this.activeTrack;
  }

  async start(request: CameraRequest = {}): Promise<void> {
    assertCommandAllowed(this.status, "start");
    const token = this.operations.begin("start");
    this.setStatus("starting");
    this.observer.onOperationStarted("start", token.id);

    let candidate: MediaStream | null = null;
    try {
      const constraints = buildMediaStreamConstraints(request);
      candidate = await this.mediaDevices.open(constraints);
      this.candidates.add(candidate);
      this.assertRequestCurrent(request, token);
      const track = this.validateCandidate(candidate, "start");
      this.assertRequestCurrent(request, token);

      this.candidates.delete(candidate);
      this.activeStream = candidate;
      this.activeTrack = track;
      this.attachActiveTrackEndedListener(track);
      this.observer.onStreamChanged(candidate, null, "started");
      this.setStatus("active");
      this.observer.onOperationCompleted("start", token.id);
    } catch (error) {
      if (candidate && candidate !== this.activeStream) {
        this.candidates.delete(candidate);
        stopStream(candidate);
      }
      const cameraError = this.resolveOperationError(error, token, "start");
      if (token.isCurrent() && this.status === "starting") this.setStatus("idle");
      this.observer.onOperationFailed("start", token.id, cameraError);
      throw cameraError;
    }
  }

  async switch(request: CameraRequest): Promise<void> {
    assertCommandAllowed(this.status, "switch");
    const token = this.operations.begin("switch");
    this.setStatus("switching");
    this.observer.onOperationStarted("switch", token.id);

    let candidate: MediaStream | null = null;
    try {
      const constraints = buildMediaStreamConstraints(request);
      candidate = await this.mediaDevices.open(constraints);
      this.candidates.add(candidate);
      this.assertRequestCurrent(request, token);
      const track = this.validateCandidate(candidate, "switch");
      this.assertRequestCurrent(request, token);

      const previousStream = this.activeStream;
      this.candidates.delete(candidate);
      this.detachActiveTrackEndedListener();
      this.activeStream = candidate;
      this.activeTrack = track;
      this.attachActiveTrackEndedListener(track);
      this.observer.onStreamChanged(candidate, previousStream, "switched");
      this.setStatus("active");
      if (previousStream) stopStream(previousStream);
      this.observer.onOperationCompleted("switch", token.id);
    } catch (error) {
      if (candidate && candidate !== this.activeStream) {
        this.candidates.delete(candidate);
        stopStream(candidate);
      }
      const cameraError = this.resolveOperationError(error, token, "switch");
      if (token.isCurrent() && this.status === "switching") {
        this.setStatus(this.activeStream ? "active" : "idle");
      }
      this.observer.onOperationFailed("switch", token.id, cameraError);
      throw cameraError;
    }
  }

  async stop(): Promise<void> {
    assertCommandAllowed(this.status, "stop");
    if (this.status === "idle") return;

    const operationId = this.operations.nextOperationId();
    this.operations.invalidate("OPERATION_ABORTED");
    this.setStatus("stopping");
    this.observer.onOperationStarted("stop", operationId);

    const previousStream = this.activeStream;
    this.detachActiveTrackEndedListener();
    this.activeStream = null;
    this.activeTrack = null;
    this.stopCandidates();
    if (previousStream) stopStream(previousStream);

    if (previousStream) this.observer.onStreamChanged(null, previousStream, "stopped");
    this.setStatus("idle");
    this.observer.onOperationCompleted("stop", operationId);
  }

  async dispose(): Promise<void> {
    if (this.status === "disposed") return;

    const operationId = this.operations.nextOperationId();
    this.operations.invalidate("DISPOSED");
    this.observer.onOperationStarted("dispose", operationId);

    const previousStream = this.activeStream;
    this.detachActiveTrackEndedListener();
    this.activeStream = null;
    this.activeTrack = null;
    this.stopCandidates();
    if (previousStream) stopStream(previousStream);

    if (previousStream) this.observer.onStreamChanged(null, previousStream, "disposed");
    this.setStatus("disposed");
    this.observer.onOperationCompleted("dispose", operationId);
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
    if (track !== this.activeTrack || this.status === "disposed" || this.status === "stopping") {
      return;
    }

    const previousStream = this.activeStream;
    const wasActive = this.status === "active";
    if (wasActive) this.setStatus("stopping");
    this.detachActiveTrackEndedListener();
    this.activeStream = null;
    this.activeTrack = null;
    if (previousStream) stopStream(previousStream);
    if (previousStream) this.observer.onStreamChanged(null, previousStream, "ended");

    const error = new CameraError("The active camera track ended unexpectedly", {
      code: "TRACK_ENDED",
      recoverable: true,
    });
    this.observer.onSessionEnded(error);
    if (wasActive) this.setStatus("idle");
  }

  private setStatus(status: CameraStatus): void {
    this.status = status;
    this.observer.onStatusChanged(status);
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

  private stopCandidates(): void {
    for (const candidate of this.candidates) stopStream(candidate);
    this.candidates.clear();
  }
}
