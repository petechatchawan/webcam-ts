import type { ConformanceStatus } from "./types.js";

export type OptionalCameraCapability = "zoom" | "torch" | "focus";

export interface PhysicalConfirmationRequirement {
	readonly required: true;
	readonly prompt: string;
}

export interface ConformanceScenarioDefinition {
	readonly id: string;
	readonly title: string;
	readonly prerequisites: readonly string[];
	readonly physicalConfirmation?: PhysicalConfirmationRequirement;
	readonly optionalCapability?: OptionalCameraCapability;
	readonly unsupportedStatus?: Extract<ConformanceStatus, "skipped">;
}

function scenario(
	definition: ConformanceScenarioDefinition,
): ConformanceScenarioDefinition {
	return Object.freeze({
		...definition,
		prerequisites: Object.freeze([...definition.prerequisites]),
		...(definition.physicalConfirmation
			? { physicalConfirmation: Object.freeze({ ...definition.physicalConfirmation }) }
			: {}),
	});
}

export const CONFORMANCE_SCENARIOS: readonly ConformanceScenarioDefinition[] = Object.freeze([
	scenario({ id: "runtime-secure-context", title: "Runtime and secure context", prerequisites: [] }),
	scenario({ id: "permission-request", title: "Camera permission request", prerequisites: ["secure-context"] }),
	scenario({ id: "device-enumeration", title: "Camera device enumeration", prerequisites: ["secure-context"] }),
	scenario({ id: "camera-start", title: "Start camera", prerequisites: ["camera-permission"] }),
	scenario({ id: "exact-resolution-supported", title: "Exact resolution — supported", prerequisites: ["active-camera"] }),
	scenario({ id: "exact-resolution-unsupported", title: "Exact resolution — unsupported", prerequisites: ["camera-permission"] }),
	scenario({ id: "ideal-resolution", title: "Prefer closest resolution", prerequisites: ["camera-permission"] }),
	scenario({
		id: "camera-switch",
		title: "Camera switch",
		prerequisites: ["active-camera", "alternate-camera"],
		physicalConfirmation: { required: true, prompt: "Confirm that the preview changed to the intended camera." },
	}),
	scenario({ id: "rapid-switch", title: "Rapid camera switch", prerequisites: ["active-camera", "alternate-camera"] }),
	scenario({ id: "stop-pending-start", title: "Stop during pending start", prerequisites: ["camera-permission-resettable"] }),
	scenario({ id: "dispose-pending-switch", title: "Dispose during pending switch", prerequisites: ["active-camera", "alternate-camera"] }),
	scenario({ id: "track-ended", title: "Unexpected active track end", prerequisites: ["active-camera"] }),
	scenario({
		id: "external-disconnect-reconnect",
		title: "External camera disconnect and reconnect",
		prerequisites: ["external-camera", "active-camera"],
		physicalConfirmation: { required: true, prompt: "Disconnect the selected external camera, then reconnect it when prompted." },
	}),
	scenario({
		id: "preview-integrity",
		title: "Preview integrity",
		prerequisites: ["active-camera"],
		physicalConfirmation: { required: true, prompt: "Confirm that the preview corresponds to the intended physical camera and is not visibly cropped." },
	}),
	scenario({ id: "capture-jpeg", title: "JPEG still capture", prerequisites: ["active-camera"] }),
	scenario({ id: "capture-png", title: "PNG still capture", prerequisites: ["active-camera"] }),
	scenario({ id: "capture-repeated", title: "Repeated capture cleanup", prerequisites: ["active-camera"] }),
	scenario({
		id: "control-zoom",
		title: "Zoom control",
		prerequisites: ["active-camera"],
		optionalCapability: "zoom",
		unsupportedStatus: "skipped",
	}),
	scenario({
		id: "control-torch",
		title: "Torch control",
		prerequisites: ["active-camera"],
		optionalCapability: "torch",
		unsupportedStatus: "skipped",
	}),
	scenario({
		id: "control-focus",
		title: "Focus control",
		prerequisites: ["active-camera"],
		optionalCapability: "focus",
		unsupportedStatus: "skipped",
	}),
]);

const SCENARIOS_BY_ID = new Map(
	CONFORMANCE_SCENARIOS.map((definition) => [definition.id, definition] as const),
);

export function getConformanceScenario(id: string): ConformanceScenarioDefinition {
	const definition = SCENARIOS_BY_ID.get(id);
	if (!definition) throw new Error(`Unknown conformance scenario: ${id}`);
	return definition;
}
