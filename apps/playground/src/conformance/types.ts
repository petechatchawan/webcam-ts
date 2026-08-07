export type ConformanceStatus = "pass" | "fail" | "blocked" | "skipped";
export type HardwareClass = "integrated" | "external" | "front" | "rear" | "unknown";
export type FormFactor = "desktop" | "mobile" | "unknown";

export interface ConformanceBrowserInfo {
	readonly family: string;
	readonly version: string;
}

export interface ConformanceOsInfo {
	readonly family: string;
	readonly version: string;
}

export interface ConformanceEnvironment {
	readonly browser: ConformanceBrowserInfo;
	readonly engine: string;
	readonly os: ConformanceOsInfo;
	readonly formFactor: FormFactor;
	readonly secureContext: boolean;
	readonly packageVersion: string;
	readonly gitSha: string;
	readonly hardwareClass: HardwareClass;
}

export interface ConformanceAssertion {
	readonly id: string;
	readonly passed: boolean;
	readonly expected?: unknown;
	readonly actual?: unknown;
	readonly message: string;
}

export interface ConformanceObservation {
	readonly key: string;
	readonly value: unknown;
}

export interface SanitizedCameraError {
	readonly code: string;
	readonly message: string;
	readonly operation?: string;
	readonly recoverable?: boolean;
	readonly context?: Readonly<Record<string, unknown>>;
}

export interface ConformanceScenarioResult {
	readonly scenarioId: string;
	readonly status: ConformanceStatus;
	readonly startedAt: string;
	readonly completedAt: string;
	readonly environment: ConformanceEnvironment;
	readonly observations: readonly ConformanceObservation[];
	readonly assertions: readonly ConformanceAssertion[];
	readonly error?: SanitizedCameraError;
}

export interface ConformanceScenarioResultInput {
	readonly scenarioId: string;
	readonly startedAt: string;
	readonly completedAt: string;
	readonly environment: ConformanceEnvironment;
	readonly observations: readonly ConformanceObservation[];
	readonly assertions: readonly ConformanceAssertion[];
	readonly error?: SanitizedCameraError;
	readonly statusOverride?: Exclude<ConformanceStatus, "pass" | "fail">;
}
