import { WebcamError, type WebcamErrorCode, type WebcamOperation } from "./domain/error.js";
import type { WebcamEvent, WebcamEventListener } from "./domain/event.js";
import { assertCommandAllowed } from "./domain/lifecycle.js";
import { buildMediaStreamConstraints, type WebcamRequest } from "./domain/request.js";
import type { WebcamState, WebcamStatus } from "./domain/state.js";
import { EventHub } from "./events/event-hub.js";
import { BrowserMediaDevicesAdapter } from "./platform/browser-media-devices-adapter.js";
import { normalizeBrowserError } from "./platform/browser-error-normalizer.js";
import type { MediaDevicesPort } from "./platform/media-devices-port.js";
import { stopStream } from "./platform/stream-cleanup.js";

export interface WebcamOptions {
	readonly mediaDevices?: MediaDevicesPort;
	readonly now?: () => number;
	readonly createSessionId?: () => string;
}

interface PendingStart {
	readonly id: number;
	invalidCode: Extract<WebcamErrorCode, "OPERATION_ABORTED" | "DISPOSED"> | null;
}

function projectActiveStatePatch(
	track: MediaStreamTrack,
	previousStream: MediaStream | null,
	state: WebcamState,
	now: () => number,
	createSessionId: () => string,
): Partial<WebcamState> {
	const settings = cloneAndFreeze(track.getSettings());
	const capabilities = cloneAndFreeze(track.getCapabilities());
	const beginsSession = previousStream === null || state.sessionId === null;
	return {
		sessionId: beginsSession ? createSessionId() : state.sessionId,
		deviceId: settings.deviceId ?? null,
		trackLabel: track.label ?? null,
		settings,
		capabilities,
		startedAt: beginsSession ? now() : state.startedAt,
	};
}

function relabelStartError(error: WebcamError): WebcamError {
	if (error.operation === "start") return error;
	return new WebcamError(error.message, {
		code: error.code,
		operation: "start",
		recoverable: error.recoverable,
		cause: error.cause ?? error,
		...(error.context ? { context: error.context } : {}),
	});
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

function initialState(): WebcamState {
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

export class Webcam {
	private readonly events = new EventHub();
	private readonly mediaDevices: MediaDevicesPort;
	private readonly now: () => number;
	private readonly createSessionId: () => string;
	private state: WebcamState = initialState();
	private activeStream: MediaStream | null = null;
	private activeTrack: MediaStreamTrack | null = null;
	private activeTrackEndedListener: (() => void) | null = null;
	private candidateStream: MediaStream | null = null;
	private nextOperationId = 0;
	private pendingStart: PendingStart | null = null;

	public constructor(options: WebcamOptions = {}) {
		this.now = options.now ?? Date.now;
		this.createSessionId =
			options.createSessionId ??
			(() => `webcam-${this.now()}-${Math.random().toString(36).slice(2)}`);
		this.mediaDevices = options.mediaDevices ?? new BrowserMediaDevicesAdapter();
	}

	public start(request: WebcamRequest = {}): Promise<void> {
		return this.runStart(request);
	}

	public stop(): Promise<void> {
		return this.runStop();
	}

	public async dispose(): Promise<void> {
		if (this.state.status === "disposed") return;
		await this.runDispose();
		this.events.clear();
	}

	public getState(): WebcamState {
		return this.state;
	}

	public getActiveStream(): MediaStream | null {
		return this.activeStream;
	}

	public getActiveTrack(): MediaStreamTrack | null {
		return this.activeTrack;
	}

	public subscribe(listener: WebcamEventListener): () => void {
		return this.events.subscribe(listener);
	}

	private async runStart(request: WebcamRequest = {}): Promise<void> {
		assertCommandAllowed(this.state.status, "start");
		const start = this.beginStart();
		this.setStatus("starting");
		this.events.emit({ type: "operation-started", operation: "start", operationId: start.id });

		let candidate: MediaStream | null = null;
		try {
			const constraints = buildMediaStreamConstraints(request);
			candidate = await this.mediaDevices.open(constraints);
			this.candidateStream = candidate;
			this.assertStartCurrent(request, start);
			const track = this.validateCandidate(candidate);
			this.assertStartCurrent(request, start);

			const previousStream = this.activeStream;
			this.commitStream(candidate, track);
			this.pendingStart = null;
			this.setStatus("active");
			if (previousStream) stopStream(previousStream);
			this.completeOperation("start", start.id);
		} catch (error) {
			this.releaseCandidateStream(candidate);
			const operationError = this.resolveOperationError(error, start);
			if (this.pendingStart === start && this.state.status === "starting") {
				this.setStatus(this.activeStream ? "active" : "idle");
			}
			if (this.pendingStart === start) this.pendingStart = null;
			this.failOperation("start", start.id, operationError);
			throw operationError;
		}
	}

	private async runStop(): Promise<void> {
		assertCommandAllowed(this.state.status, "stop");
		if (this.state.status === "idle" || this.state.status === "stopping") return;

		const operationId = ++this.nextOperationId;
		this.invalidatePendingStart("OPERATION_ABORTED");
		this.setStatus("stopping");
		this.events.emit({ type: "operation-started", operation: "stop", operationId });

		this.releaseStream("stopped");
		this.setStatus("idle");
		this.completeOperation("stop", operationId);
	}

	private async runDispose(): Promise<void> {
		assertCommandAllowed(this.state.status, "dispose");
		const operationId = ++this.nextOperationId;
		this.invalidatePendingStart("DISPOSED");
		this.events.emit({ type: "operation-started", operation: "dispose", operationId });

		this.releaseStream("disposed");
		this.setStatus("disposed");
		this.completeOperation("dispose", operationId);
	}

	private commitStream(stream: MediaStream, track: MediaStreamTrack): void {
		const previousStream = this.activeStream;
		const statePatch = projectActiveStatePatch(
			track,
			previousStream,
			this.state,
			this.now,
			this.createSessionId,
		);
		const endedListener = this.installActiveTrackEndedListener(track);

		this.candidateStream = null;
		this.detachActiveTrackEndedListener();
		this.activeStream = stream;
		this.activeTrack = track;
		this.activeTrackEndedListener = endedListener;
		this.updateState(statePatch);

		this.events.emit({ type: "stream-changed", stream, previousStream, reason: "started" });
	}

	private releaseStream(reason: "stopped" | "disposed" | "ended"): void {
		const previousStream = this.activeStream;
		this.detachActiveTrackEndedListener();
		this.activeStream = null;
		this.activeTrack = null;
		// A candidate is assigned after open and cleared synchronously on commit or failure.
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

	private installActiveTrackEndedListener(track: MediaStreamTrack): () => void {
		const listener = () => this.handleActiveTrackEnded(track);
		track.addEventListener?.("ended", listener);
		return listener;
	}

	private detachActiveTrackEndedListener(): void {
		if (this.activeTrack && this.activeTrackEndedListener) {
			this.activeTrack.removeEventListener?.("ended", this.activeTrackEndedListener);
		}
		this.activeTrackEndedListener = null;
	}

	private handleActiveTrackEnded(track: MediaStreamTrack): void {
		if (
			track !== this.activeTrack ||
			this.state.status === "disposed" ||
			this.state.status === "stopping"
		) {
			return;
		}

		const wasActive = this.state.status === "active";
		if (wasActive) this.setStatus("stopping");
		this.releaseStream("ended");

		const error = new WebcamError("The active camera track ended unexpectedly", {
			code: "TRACK_ENDED",
			recoverable: true,
		});
		this.updateState({ lastError: error.toSnapshot() });
		this.events.emit({ type: "session-ended", error });
		if (wasActive) this.setStatus("idle");
	}

	private setStatus(status: WebcamStatus): void {
		this.updateState({ status });
	}

	private beginStart(): PendingStart {
		const start: PendingStart = { id: ++this.nextOperationId, invalidCode: null };
		this.pendingStart = start;
		return start;
	}

	private invalidatePendingStart(
		code: Extract<WebcamErrorCode, "OPERATION_ABORTED" | "DISPOSED">,
	): void {
		if (this.pendingStart && !this.pendingStart.invalidCode) {
			this.pendingStart.invalidCode = code;
		}
		this.pendingStart = null;
	}

	private pendingStartError(start: PendingStart): WebcamError {
		const code = start.invalidCode ?? "OPERATION_ABORTED";
		const message =
			code === "DISPOSED"
				? "Webcam was disposed while the operation was running"
				: "start operation was aborted";
		return new WebcamError(message, {
			code,
			operation: "start",
			recoverable: code !== "DISPOSED",
			context: { operationId: start.id },
		});
	}

	private assertStartCurrent(request: WebcamRequest, start: PendingStart): void {
		if (request.signal?.aborted && !start.invalidCode) {
			start.invalidCode = "OPERATION_ABORTED";
		}
		if (start.invalidCode) throw this.pendingStartError(start);
	}

	private validateCandidate(stream: MediaStream): MediaStreamTrack {
		const track = stream.getVideoTracks()[0];
		if (!track || track.readyState === "ended") {
			throw new WebcamError("Webcam stream does not contain a live video track", {
				code: "STREAM_INVALID",
				operation: "start",
				recoverable: true,
			});
		}
		return track;
	}

	private resolveOperationError(error: unknown, start: PendingStart): WebcamError {
		if (start.invalidCode) return this.pendingStartError(start);
		if (error instanceof WebcamError) return relabelStartError(error);
		return normalizeBrowserError(error, "start");
	}

	private completeOperation(operation: WebcamOperation, operationId: number): void {
		if (this.state.lastError) this.updateState({ lastError: null });
		this.events.emit({ type: "operation-completed", operation, operationId });
	}

	private failOperation(operation: WebcamOperation, operationId: number, error: WebcamError): void {
		this.updateState({ lastError: error.toSnapshot() });
		this.events.emit({ type: "operation-failed", operation, operationId, error });
	}

	private updateState(patch: Partial<WebcamState>): void {
		this.state = deepFreeze({ ...this.state, ...patch });
		const event: WebcamEvent = { type: "state-changed", state: this.state };
		this.events.emit(event);
	}
}
