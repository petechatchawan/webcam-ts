import {
	Webcam,
	type WebcamEvent,
	type WebcamEventListener,
	type WebcamRequest,
	type WebcamState,
} from "webcam-ts";
import { Capture, type CaptureBlobOptions, type CapturedBlob } from "webcam-ts/capture";
import { Controls, type ControlUpdate } from "webcam-ts/controls";
import {
	DeviceManager,
	PermissionService,
	type DeviceListChangeListener,
	type PermissionMap,
	type PermissionRequest,
} from "webcam-ts/devices";
import { Preview } from "webcam-ts/preview";
import {
	appendEventLog,
	buildWebcamRequest,
	deriveCommandAvailability,
	hasWebcamPermission,
	projectWebcamError,
	projectRequestedResolution,
	projectResolutionSelectionError,
	replaceObjectUrl,
} from "./playground-logic.js";
import type {
	WebcamSelection,
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

export interface WebcamPort {
	start(request?: WebcamRequest): Promise<void>;
	stop(): Promise<void>;
	dispose(): Promise<void>;
	getState(): WebcamState;
	subscribe(listener: WebcamEventListener): () => void;
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
	listDevices(): Promise<readonly MediaDeviceInfo[]>;
	subscribeToDeviceListChanges(listener: DeviceListChangeListener): () => void;
	dispose(): void;
}

export interface PermissionPort {
	query(): Promise<PermissionMap>;
	request(request?: PermissionRequest): Promise<PermissionMap>;
}

export interface ControlsPort {
	getCapabilities(): Readonly<MediaTrackCapabilities>;
	set(update: ControlUpdate): Promise<Readonly<MediaTrackSettings>>;
}

export interface WebcamControllerDependencies {
	readonly webcam: WebcamPort;
	readonly preview: PreviewPort;
	readonly capture: CapturePort;
	readonly devices: DeviceManagerPort;
	readonly permissions: PermissionPort;
	readonly controls: ControlsPort;
	readonly urlPort?: UrlPort;
	readonly now?: () => number;
}

export type PlaygroundListener = (snapshot: PlaygroundSnapshot) => void;

const unknownPermissions: PermissionMap = Object.freeze({
	camera: "unknown",
	microphone: "unknown",
});

const PERMISSION_GRANT_KEY = "webcam-ts.permission-granted";

function readWebcamGrant(): boolean {
	try {
		return globalThis.localStorage?.getItem(PERMISSION_GRANT_KEY) === "1";
	} catch {
		return false;
	}
}

function writeWebcamGrant(): void {
	try {
		globalThis.localStorage?.setItem(PERMISSION_GRANT_KEY, "1");
	} catch {
		// Storage is best-effort; the prompt can reappear if it is unavailable.
	}
}

function rememberGrantedWebcam(query: PermissionMap): PermissionMap {
	return readWebcamGrant() && query.camera !== "denied"
		? Object.freeze({ ...query, camera: "granted" })
		: query;
}

const emptyControls: ControlSnapshot = Object.freeze({
	torchSupported: false,
	zoom: null,
	focusModes: Object.freeze([]),
	settings: Object.freeze({}),
});

export class WebcamController {
	private readonly webcam: WebcamPort;
	private readonly preview: PreviewPort;
	private readonly captureService: CapturePort;
	private readonly deviceManager: DeviceManagerPort;
	private readonly permissionService: PermissionPort;
	private readonly controlsService: ControlsPort;
	private readonly urlPort: UrlPort;
	private readonly now: () => number;
	private readonly listeners = new Set<PlaygroundListener>();
	private webcamUnsubscribe: (() => void) | null = null;
	private deviceUnsubscribe: (() => void) | null = null;
	private eventId = 0;
	private captureUrl: string | null = null;
	private disposed = false;
	private snapshot: PlaygroundSnapshot;

	public constructor(dependencies: WebcamControllerDependencies) {
		this.webcam = dependencies.webcam;
		this.preview = dependencies.preview;
		this.captureService = dependencies.capture;
		this.deviceManager = dependencies.devices;
		this.permissionService = dependencies.permissions;
		this.controlsService = dependencies.controls;
		this.urlPort = dependencies.urlPort ?? URL;
		this.now = dependencies.now ?? Date.now;

		const webcamState = this.webcam.getState();
		this.snapshot = Object.freeze({
			webcam: webcamState,
			permissions: readWebcamGrant()
				? Object.freeze({ camera: "granted", microphone: "unknown" })
				: unknownPermissions,
			devices: Object.freeze([]),
			availability: deriveCommandAvailability(webcamState.status),
			controls: emptyControls,
			requestedResolution: null,
			capture: null,
			error: null,
			events: Object.freeze([]),
		});
	}

	public async initialize(): Promise<void> {
		this.assertUsable();
		if (!this.webcamUnsubscribe) {
			this.webcamUnsubscribe = this.webcam.subscribe((event) => this.onWebcamEvent(event));
		}
		if (!this.deviceUnsubscribe) {
			this.deviceUnsubscribe = this.deviceManager.subscribeToDeviceListChanges((devices) => {
				this.patch({ devices: Object.freeze([...devices]) });
			});
		}

		const [permissions, devices] = await Promise.allSettled([
			this.permissionService.query(),
			this.deviceManager.listDevices(),
		]);

		if (permissions.status === "fulfilled") {
			this.patch({ permissions: rememberGrantedWebcam(permissions.value) });
		} else {
			this.recordFailure(permissions.reason);
		}

		if (devices.status === "fulfilled") {
			this.patch({ devices: Object.freeze([...devices.value]) });
		} else {
			this.recordFailure(devices.reason);
		}
	}

	public getSnapshot(): PlaygroundSnapshot {
		return this.snapshot;
	}

	public subscribe(listener: PlaygroundListener): () => void {
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

	public async start(selection: WebcamSelection): Promise<void> {
		this.assertWebcamPermission("start");
		this.preview.setMirror(selection.mirror);
		await this.runResolutionOperation(selection, () =>
			this.webcam.start(buildWebcamRequest(selection)),
		);
		this.patch({ requestedResolution: projectRequestedResolution(selection) });
		await this.refreshAfterStreamChange();
	}

	public async stop(): Promise<void> {
		await this.run(() => this.webcam.stop());
		this.patch({ controls: emptyControls, requestedResolution: null });
	}

	public async requestPermissions(audio: boolean): Promise<void> {
		await this.run(async () => {
			const permissions = await this.permissionService.request({ video: true, audio });
			if (permissions.camera === "granted") writeWebcamGrant();
			this.patch({ permissions });
			await this.refreshDevices();
		});
	}

	public async refreshDevices(): Promise<void> {
		await this.run(async () => {
			const devices = await this.deviceManager.listDevices();
			this.patch({ devices: Object.freeze([...devices]) });
		});
	}

	public async capture(options: CaptureBlobOptions): Promise<CaptureSnapshot> {
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

	public async applyControls(update: ControlUpdate): Promise<void> {
		await this.run(async () => {
			const settings = await this.controlsService.set(update);
			this.patch({ controls: this.buildControls(settings) });
		});
	}

	public setMirror(mirror: boolean): void {
		this.assertUsable();
		this.preview.setMirror(mirror);
	}

	public clearError(): void {
		this.assertUsable();
		this.patch({ error: null });
	}

	public clearEvents(): void {
		this.assertUsable();
		this.patch({ events: Object.freeze([]) });
	}

	public async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.webcamUnsubscribe?.();
		this.deviceUnsubscribe?.();
		this.webcamUnsubscribe = null;
		this.deviceUnsubscribe = null;
		this.listeners.clear();
		this.captureUrl = replaceObjectUrl(this.captureUrl, null, this.urlPort);
		this.preview.dispose();
		this.captureService.dispose();
		this.deviceManager.dispose();
		await this.webcam.dispose();
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
		selection: WebcamSelection,
		operation: () => Promise<T>,
	): Promise<T> {
		try {
			return await this.run(operation);
		} catch (error) {
			this.patch({ error: projectResolutionSelectionError(error, selection) });
			throw error;
		}
	}

	private assertWebcamPermission(operation: "start"): void {
		this.assertUsable();
		if (hasWebcamPermission(this.snapshot.permissions.camera) || readWebcamGrant()) return;

		const error = Object.assign(
			new Error("Allow camera access before starting a camera session."),
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
			const devices = await this.deviceManager.listDevices();
			this.patch({ devices: Object.freeze([...devices]) });
		} catch (error) {
			this.recordFailure(error);
		}
	}

	private refreshControls(): void {
		if (this.webcam.getState().status !== "active") {
			this.patch({ controls: emptyControls });
			return;
		}
		try {
			this.patch({ controls: this.buildControls(this.webcam.getState().settings ?? {}) });
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
					value: typeof settings.zoom === "number" ? settings.zoom : capabilities.zoom.min,
			  })
			: null;

		return Object.freeze({
			torchSupported: typeof capabilities.torch === "boolean",
			zoom,
			focusModes: Object.freeze([...(capabilities.focusMode ?? [])]),
			settings: Object.freeze({ ...settings }),
		});
	}

	private onWebcamEvent(event: WebcamEvent): void {
		if (event.type === "state-changed") {
			const stableWithoutStream =
				event.state.status === "idle" || event.state.status === "disposed";
			this.patch({
				webcam: event.state,
				availability: deriveCommandAvailability(event.state.status),
				...(stableWithoutStream ? { requestedResolution: null } : {}),
			});
		}
		if (event.type === "operation-failed" || event.type === "session-ended") {
			this.patch({ error: projectWebcamError(event.error) });
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
		this.patch({ error: projectWebcamError(error) });
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
		throw new Error("WebcamController has been disposed");
	}
}

export function createBrowserWebcamController(videoElement: HTMLVideoElement): WebcamController {
	const webcam = new Webcam();
	const preview = new Preview(videoElement, {
		autoplay: true,
		muted: true,
		playsInline: true,
		mirror: true,
	});
	preview.bind(webcam);

	return new WebcamController({
		webcam,
		preview,
		capture: new Capture(webcam),
		devices: new DeviceManager(),
		permissions: new PermissionService(),
		controls: new Controls(webcam),
	});
}

function summarizeEvent(event: WebcamEvent): string {
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
