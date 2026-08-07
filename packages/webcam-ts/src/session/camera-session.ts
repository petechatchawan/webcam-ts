import { CameraError, type CameraOperation } from "../domain/camera-error.js";
import { buildMediaStreamConstraints, type CameraRequest } from "../domain/camera-request.js";
import type { CameraStatus } from "../domain/camera-state.js";
import type { MediaDevicesPort } from "../platform/media-devices-port.js";
import { normalizeBrowserError } from "../platform/browser-error-normalizer.js";
import { assertCommandAllowed } from "./lifecycle-machine.js";
import { OperationController, type OperationLease } from "./operation-controller.js";
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

type MediaOpenOutcome =
  | Readonly<{ kind: "opened"; stream: MediaStream }>
  | Readonly<{ kind: "failed"; error: unknown }>
  | Readonly<{ kind: "invalidated"; error: CameraError }>;

export class CameraSession {
  private status: CameraStatus = "idle";
  private activeStream: MediaStream | null = null;
  private activeTrack: MediaStreamTrack | null = null;
  private activeTrackEndedListener: (() => void) | null = null;
  private readonly candidates = new Set<MediaStream>();
  private readonly operations = new OperationController();
  private nextAdministrativeOperationId = 10_000;

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
    const lease = this.operations.begin("start");
    this.setStatus("starting");
    this.observer.onOperationStarted("start", lease.id);

    let candidate: MediaStream | null = null;
    try {
      const constraints = buildMediaStreamConstraints(request);
      candidate = await this.openMedia(constraints, lease);
      this.candidates.add(candidate);
      this.assertRequestCurrent(request, lease);
      const track = this.validateCandidate(candidate, "start");
      this.assertRequestCurrent(request, lease);

      this.candidates.delete(candidate);
      this.activeStream = candidate;
      this.activeTrack = track;
      this.attachActiveTrackEndedListener(track);
      this.observer.onStreamChanged(candidate, null, "started");
      this.setStatus("active");
      this.observer.onOperationCompleted("start", lease.id);
    } catch (error) {
      if (candidate && candidate !== this.activeStream) {
        this.candidates.delete(candidate);
        stopStream(candidate);
      }
      const cameraError = this.resolveOperationError(error, lease, "start");
      if (lease.isCurrent() && this.status === "starting") this.setStatus("idle");
      this.observer.onOperationFailed("start", lease.id, cameraError);
      throw cameraError;
    }
  }

  async switch(request: CameraRequest): Promise<void> {
    assertCommandAllowed(this.status, "switch");
    const lease = this.operations.begin("switch");
    this.setStatus("switching");
    this.observer.onOperationStarted("switch", lease.id);

    let candidate: MediaStream | null = null;
    try {
      const constraints = buildMediaStreamConstraints(request);
      candidate = await this.openMedia(constraints, lease);
      this.candidates.add(candidate);
      this.assertRequestCurrent(request, lease);
      const track = this.validateCandidate(candidate, "switch");
      this.assertRequestCurrent(request, lease);

      const previousStream = this.activeStream;
      this.candidates.delete(candidate);
      this.detachActiveTrackEndedListener();
      this.activeStream = candidate;
      this.activeTrack = track;
      this.attachActiveTrackEndedListener(track);
      this.observer.onStreamChanged(candidate, previousStream, "switched");
      this.setStatus("active");
      if (previousStream) stopStream(previousStream);
      this.observer.onOperationCompleted("switch", lease.id);
    } catch (error) {
      if (candidate && candidate !== this.activeStream) {
        this.candidates.delete(candidate);
        stopStream(candidate);
      }
      const cameraError = this.resolveOperationError(error, lease, "switch");
      if (lease.isCurrent() && this.status === "switching") {
        this.setStatus(this.activeStream ? "active" : "idle");
      }
      this.observer.onOperationFailed("switch", lease.id, cameraError);
      throw cameraError;
    }
  }

  async stop(): Promise<void> {
    assertCommandAllowed(this.status, "stop");
    if (this.status === "idle") return;

    const operationId = ++this.nextAdministrativeOperationId;
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

    const operationId = ++this.nextAdministrativeOperationId;
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

  private async openMedia(
    constraints: MediaStreamConstraints,
    lease: OperationLease,
  ): Promise<MediaStream> {
    const openPromise = Promise.resolve().then(() => this.mediaDevices.open(constraints));
    const outcome = await Promise.race<MediaOpenOutcome>([
      openPromise.then<MediaOpenOutcome>(
        (stream) => ({ kind: "opened", stream }),
        (error) => ({ kind: "failed", error }),
      ),
      lease.whenInvalidated().then<MediaOpenOutcome>((error) => ({ kind: "invalidated", error })),
    ]);

    if (outcome.kind === "opened") return outcome.stream;
    if (outcome.kind === "failed") throw outcome.error;

    void openPromise.then(
      (stream) => stopStream(stream),
      () => undefined,
    );
    throw outcome.error;
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

  private assertRequestCurrent(request: CameraRequest, lease: OperationLease): void {
    if (request.signal?.aborted) {
      throw new CameraError(`${lease.operation} operation was aborted`, {
        code: "OPERATION_ABORTED",
        operation: lease.operation,
        recoverable: true,
        context: { operationId: lease.id },
      });
    }
    lease.throwIfInvalid();
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
    lease: OperationLease,
    operation: "start" | "switch",
  ): CameraError {
    if (!lease.isCurrent()) return lease.toInvalidError();
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
