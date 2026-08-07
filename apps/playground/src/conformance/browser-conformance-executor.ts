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
import { sanitizeCameraError } from "./privacy-sanitizer.js";
import type { ConformanceScenarioExecution } from "./scenario-runner.js";
import type { ConformanceScenarioDefinition } from "./scenarios.js";
import type { ConformanceAssertion, ConformanceObservation } from "./types.js";

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

const SUPPORTED_SCENARIOS = new Set([
	"runtime-secure-context",
	"permission-request",
	"device-enumeration-before-permission",
	"device-enumeration-after-permission",
	"camera-start",
	"camera-switch",
	"rapid-switch",
	"track-ended",
	"devicechange-advisory",
	"external-disconnect",
	"external-reconnect-explicit-restart",
]);

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

function assertion(
	id: string,
	passed: boolean,
	message: string,
	expected: unknown = true,
	actual: unknown = passed,
): ConformanceAssertion {
	return Object.freeze({ id, passed, expected, actual, message });
}

function requestFor(deviceId: string): CameraRequest {
	return Object.freeze({ deviceId });
}

function blocked(reason: string): PrerequisiteCheckResult {
	return { status: "blocked", reason };
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
	private deviceChangeCount = 0;
	private sessionEndedObserved = false;
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
			this.deviceChangeCount += 1;
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
		if (!(globalThis.isSecureContext ?? false)) {
			return blocked("Conformance mode requires a secure browser context.");
		}
		if (!SUPPORTED_SCENARIOS.has(definition.id)) {
			return blocked("Scenario execution belongs to a later stabilization PR.");
		}

		const status = this.camera.getState().status;
		switch (definition.id) {
			case "camera-start":
			case "external-reconnect-explicit-restart":
				if (!this.primaryDeviceId) {
					return blocked("Select a primary camera before running this scenario.");
				}
				return status === "idle"
					? { status: "ready" }
					: blocked("Camera must be idle before starting a new session.");
			case "camera-switch":
			case "rapid-switch":
				if (!this.primaryDeviceId || !this.alternateDeviceId) {
					return blocked("Select both primary and alternate cameras before switching.");
				}
				return status === "active"
					? { status: "ready" }
					: blocked("Start the primary camera before switching.");
			default:
				return { status: "ready" };
		}
	}

	async execute(definition: ConformanceScenarioDefinition): Promise<ConformanceScenarioExecution> {
		this.assertUsable();
		switch (definition.id) {
			case "runtime-secure-context":
				return this.executeSecureContext();
			case "permission-request":
				return this.executePermissionRequest();
			case "device-enumeration-before-permission":
				return this.executeDeviceEnumeration(false);
			case "device-enumeration-after-permission":
				return this.executeDeviceEnumeration(true);
			case "camera-start":
				return this.executeStart();
			case "camera-switch":
				return this.executeSwitch();
			case "rapid-switch":
				return this.executeRapidSwitch();
			case "track-ended":
				return this.executeSessionLoss("track-ended");
			case "devicechange-advisory":
				return this.executeDeviceChange();
			case "external-disconnect":
				return this.executeSessionLoss("external-disconnect");
			case "external-reconnect-explicit-restart":
				return this.executeExplicitRestart();
			default:
				return this.blockedExecution();
		}
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

	private executeSecureContext(): ConformanceScenarioExecution {
		const secureContext = globalThis.isSecureContext ?? false;
		return {
			observations: [{ key: "secureContext", value: secureContext }],
			assertions: [
				assertion(
					"secure-context",
					secureContext,
					"Conformance mode requires a secure browser context.",
				),
			],
		};
	}

	private async executePermissionRequest(): Promise<ConformanceScenarioExecution> {
		try {
			const permission = await this.permissions.request({ video: true, audio: false });
			const granted = permission.camera === "granted";
			return {
				observations: [{ key: "permission.camera", value: permission.camera }],
				assertions: [
					assertion(
						"camera-permission-granted",
						granted,
						"Camera permission request must be granted for physical camera scenarios.",
						"granted",
						permission.camera,
					),
				],
			};
		} catch (error) {
			return this.failedExecution(
				"camera-permission-granted",
				"Camera permission request failed.",
				error,
			);
		}
	}

	private async executeDeviceEnumeration(afterPermission: boolean): Promise<ConformanceScenarioExecution> {
		try {
			const devices = await this.devices.list();
			this.deviceOptions = freezeOptions(devices);
			const passed = afterPermission ? devices.length > 0 : true;
			return {
				observations: [
					{ key: "device.count", value: devices.length },
					{ key: "permissionPhase", value: afterPermission ? "after" : "before" },
				],
				assertions: [
					assertion(
						afterPermission ? "camera-devices-visible" : "device-enumeration-completed",
						passed,
						afterPermission
							? "At least one camera must be enumerable after permission is granted."
							: "Device enumeration before permission must complete without opening a camera.",
					),
				],
			};
		} catch (error) {
			return this.failedExecution(
				"device-enumeration-completed",
				"Camera device enumeration failed.",
				error,
			);
		}
	}

	private async executeStart(): Promise<ConformanceScenarioExecution> {
		if (!this.primaryDeviceId) return this.missingSelection("primary");
		try {
			await this.camera.start(requestFor(this.primaryDeviceId));
			this.activeRole = "primary";
			this.sessionEndedObserved = false;
			return this.activeExecution("camera-started", "Camera start must produce an active session.");
		} catch (error) {
			return this.failedExecution("camera-started", "Camera start failed.", error);
		}
	}

	private async executeSwitch(): Promise<ConformanceScenarioExecution> {
		if (!this.primaryDeviceId || !this.alternateDeviceId) {
			return this.missingSelection("alternate");
		}
		if (this.activeRole !== "primary" && this.activeRole !== "alternate") {
			return this.failedAssertionExecution(
				"camera-switch-active",
				"Start the primary camera before switching.",
			);
		}

		const from = this.activeRole;
		const targetRole: Exclude<ActiveRole, "unknown"> = from === "primary" ? "alternate" : "primary";
		const targetId = targetRole === "primary" ? this.primaryDeviceId : this.alternateDeviceId;
		const direction = `${from}-to-${targetRole}`;
		try {
			await this.camera.switch(requestFor(targetId));
			this.activeRole = targetRole;
			return this.activeExecution(
				"camera-switch-active",
				"Candidate-first switch must commit the selected camera.",
				[{ key: "direction", value: direction }],
			);
		} catch (error) {
			return this.failedExecution(
				"camera-switch-active",
				"Candidate-first camera switch failed.",
				error,
				[{ key: "direction", value: direction }, ...this.stateObservations()],
			);
		}
	}

	private async executeRapidSwitch(): Promise<ConformanceScenarioExecution> {
		if (!this.primaryDeviceId || !this.alternateDeviceId) {
			return this.missingSelection("alternate");
		}
		if (this.activeRole !== "primary") {
			return this.failedAssertionExecution(
				"rapid-switch-final-primary",
				"Rapid switch starts from the primary camera.",
			);
		}
		try {
			await this.camera.switch(requestFor(this.alternateDeviceId));
			this.activeRole = "alternate";
			await this.camera.switch(requestFor(this.primaryDeviceId));
			this.activeRole = "primary";
			const state = this.camera.getState();
			return {
				observations: this.stateObservations([{ key: "activeRole", value: this.activeRole }]),
				assertions: [
					assertion(
						"rapid-switch-final-primary",
						state.status === "active",
						"Rapid candidate-first switching must finish on an active primary session.",
						"active",
						state.status,
					),
				],
			};
		} catch (error) {
			return this.failedExecution(
				"rapid-switch-final-primary",
				"Rapid candidate-first switching failed.",
				error,
			);
		}
	}

	private executeDeviceChange(): ConformanceScenarioExecution {
		const observed = this.deviceChangeCount > 0;
		return {
			observations: [{ key: "devicechange.count", value: this.deviceChangeCount }],
			assertions: [
				assertion(
					"devicechange-observed",
					observed,
					"devicechange is advisory evidence and must not open a camera automatically.",
				),
			],
		};
	}

	private executeSessionLoss(
		scenario: "track-ended" | "external-disconnect",
	): ConformanceScenarioExecution {
		const state = this.camera.getState();
		const lost = this.sessionEndedObserved && state.status !== "active";
		return {
			observations: this.stateObservations([
				{ key: "sessionEnded", value: this.sessionEndedObserved },
				{ key: "scenario", value: scenario },
			]),
			assertions: [
				assertion(
					"session-ended",
					lost,
					"Session-ended evidence must be observed and public state must no longer be active.",
				),
			],
		};
	}

	private async executeExplicitRestart(): Promise<ConformanceScenarioExecution> {
		if (!this.primaryDeviceId) return this.missingSelection("primary");
		try {
			await this.camera.start(requestFor(this.primaryDeviceId));
			this.activeRole = "primary";
			this.sessionEndedObserved = false;
			return this.activeExecution(
				"explicit-restart-active",
				"Reconnect recovery must occur only when the explicit restart scenario is run.",
			);
		} catch (error) {
			return this.failedExecution(
				"explicit-restart-active",
				"Explicit camera restart failed.",
				error,
			);
		}
	}

	private activeExecution(
		assertionId: string,
		message: string,
		extraObservations: readonly ConformanceObservation[] = [],
	): ConformanceScenarioExecution {
		const state = this.camera.getState();
		return {
			observations: this.stateObservations([
				...extraObservations,
				{ key: "activeRole", value: this.activeRole },
			]),
			assertions: [
				assertion(assertionId, state.status === "active", message, "active", state.status),
			],
		};
	}

	private stateObservations(
		extra: readonly ConformanceObservation[] = [],
	): readonly ConformanceObservation[] {
		const state = this.camera.getState();
		const settings = state.settings;
		return Object.freeze([
			...extra,
			{ key: "status", value: state.status },
			...(typeof settings?.width === "number" ? [{ key: "width", value: settings.width }] : []),
			...(typeof settings?.height === "number" ? [{ key: "height", value: settings.height }] : []),
			...(typeof settings?.facingMode === "string"
				? [{ key: "facingMode", value: settings.facingMode }]
				: []),
		]);
	}

	private failedExecution(
		assertionId: string,
		message: string,
		error: unknown,
		observations: readonly ConformanceObservation[] = [],
	): ConformanceScenarioExecution {
		return {
			observations: Object.freeze([...observations]),
			assertions: [assertion(assertionId, false, message)],
			error: sanitizeCameraError(error),
		};
	}

	private failedAssertionExecution(
		assertionId: string,
		message: string,
	): ConformanceScenarioExecution {
		return {
			observations: [],
			assertions: [assertion(assertionId, false, message)],
		};
	}

	private missingSelection(role: "primary" | "alternate"): ConformanceScenarioExecution {
		return this.failedAssertionExecution(
			`${role}-camera-selected`,
			`Select a ${role} camera before running this scenario.`,
		);
	}

	private blockedExecution(): ConformanceScenarioExecution {
		return {
			observations: [{ key: "scenario.supported", value: false }],
			assertions: [],
			statusOverride: "blocked",
		};
	}

	private onCameraEvent(event: CameraEvent): void {
		if (event.type === "session-ended") {
			this.sessionEndedObserved = true;
			this.activeRole = "unknown";
			return;
		}
		if (event.type !== "state-changed") return;
		if (event.state.status === "idle" || event.state.status === "disposed") {
			this.activeRole = "unknown";
		}
	}

	private assertUsable(): void {
		if (this.disposed) throw new Error("BrowserConformanceExecutor is disposed");
	}
}
