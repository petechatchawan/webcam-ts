import type {
	CameraEvent,
	CameraEventListener,
	CameraRequest,
	CameraState,
} from "webcam-ts";
import type {
	CameraDevice,
	CameraPermissionMap,
} from "webcam-ts/devices";
import type {
	ConformanceScenarioExecutor,
	PrerequisiteCheckResult,
} from "./conformance-controller.js";
import type { ConformanceScenarioExecution } from "./scenario-runner.js";
import type { ConformanceScenarioDefinition } from "./scenarios.js";

export interface ConformanceDeviceOption {
	readonly id: string;
	readonly label: string;
}

export interface ConformanceDeviceRuntime {
	refreshDeviceOptions(): Promise<readonly ConformanceDeviceOption[]>;
	setPrimaryDeviceId(deviceId: string): void;
	setAlternateDeviceId(deviceId: string): void;
}

interface CameraPort {
	start(request?: CameraRequest): Promise<void>;
	switch(request: CameraRequest): Promise<void>;
	getState(): CameraState;
	subscribe(listener: CameraEventListener): () => void;
	dispose(): Promise<void>;
}

interface DeviceManagerPort {
	list(): Promise<readonly CameraDevice[]>;
	subscribe(listener: (devices: readonly CameraDevice[]) => void): () => void;
	dispose(): void;
}

interface PermissionPort {
	query(): Promise<CameraPermissionMap>;
	request(request?: Readonly<{ video?: boolean; audio?: boolean }>): Promise<CameraPermissionMap>;
}

interface PreviewPort {
	dispose(): void;
}

export interface BrowserConformanceExecutorDependencies {
	readonly camera: CameraPort;
	readonly devices: DeviceManagerPort;
	readonly permissions: PermissionPort;
	readonly preview: PreviewPort;
}

type ActiveRole = "primary" | "alternate" | "unknown";

function freezeOptions(devices: readonly CameraDevice[]): readonly ConformanceDeviceOption[] {
	return Object.freeze(
		devices.map((device, index) =>
			Object.freeze({
				id: device.deviceId,
				label: device.label?.trim() || `Camera ${index + 1}`,
			}),
		),
	);
}

export class BrowserConformanceExecutor
	implements ConformanceScenarioExecutor, ConformanceDeviceRuntime
{
	private readonly camera: CameraPort;
	private readonly devices: DeviceManagerPort;
	private readonly permissions: PermissionPort;
	private readonly preview: PreviewPort;
	private primaryDeviceId = "";
	private alternateDeviceId = "";
	private activeRole: ActiveRole = "unknown";
	private deviceOptions: readonly ConformanceDeviceOption[] = Object.freeze([]);
	private cameraUnsubscribe: (() => void) | null = null;
	private deviceUnsubscribe: (() => void) | null = null;
	private disposed = false;

	constructor(dependencies: BrowserConformanceExecutorDependencies) {
		this.camera = dependencies.camera;
		this.devices = dependencies.devices;
		this.permissions = dependencies.permissions;
		this.preview = dependencies.preview;
		this.cameraUnsubscribe = this.camera.subscribe((event) => this.onCameraEvent(event));
		this.deviceUnsubscribe = this.devices.subscribe((devices) => {
			this.deviceOptions = freezeOptions(devices);
		});
	}

	async refreshDeviceOptions(): Promise<readonly ConformanceDeviceOption[]> {
		this.assertUsable();
		this.deviceOptions = freezeOptions(await this.devices.list());
		return this.deviceOptions;
	}

	setPrimaryDeviceId(deviceId: string): void {
		this.assertUsable();
		this.primaryDeviceId = deviceId;
	}

	setAlternateDeviceId(deviceId: string): void {
		this.assertUsable();
		this.alternateDeviceId = deviceId;
	}

	checkPrerequisite(definition: ConformanceScenarioDefinition): PrerequisiteCheckResult {
		this.assertUsable();
		if (definition.id === "runtime-secure-context") {
			return (globalThis.isSecureContext ?? false)
				? { status: "ready" }
				: { status: "blocked", reason: "Conformance mode requires a secure browser context." };
		}
		return { status: "ready" };
	}

	async execute(definition: ConformanceScenarioDefinition): Promise<ConformanceScenarioExecution> {
		this.assertUsable();
		if (definition.id !== "runtime-secure-context") {
			return {
				observations: [{ key: "scenario.supported", value: false }],
				assertions: [],
				statusOverride: "blocked",
			};
		}

		const secureContext = globalThis.isSecureContext ?? false;
		return {
			observations: [{ key: "secureContext", value: secureContext }],
			assertions: [
				{
					id: "secure-context",
					passed: secureContext,
					expected: true,
					actual: secureContext,
					message: "Conformance mode requires a secure browser context.",
				},
			],
		};
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.cameraUnsubscribe?.();
		this.deviceUnsubscribe?.();
		this.cameraUnsubscribe = null;
		this.deviceUnsubscribe = null;
		this.deviceOptions = Object.freeze([]);
		this.primaryDeviceId = "";
		this.alternateDeviceId = "";
		this.activeRole = "unknown";
		this.preview.dispose();
		this.devices.dispose();
		await this.camera.dispose();
	}

	private onCameraEvent(event: CameraEvent): void {
		if (event.type !== "state-changed") return;
		if (event.state.status === "idle" || event.state.status === "disposed") {
			this.activeRole = "unknown";
		}
	}

	private assertUsable(): void {
		if (this.disposed) throw new Error("BrowserConformanceExecutor is disposed");
	}
}
