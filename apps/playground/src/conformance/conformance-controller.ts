import {
	createEvidenceDocument,
	type ConformanceEvidenceDocument,
} from "./evidence-exporter.js";
import { sanitizeCameraError } from "./privacy-sanitizer.js";
import {
	createScenarioResult,
	type ConformanceScenarioExecution,
} from "./scenario-runner.js";
import {
	getConformanceScenario,
	type ConformanceScenarioDefinition,
} from "./scenarios.js";
import type {
	ConformanceEnvironment,
	ConformanceScenarioResult,
	HardwareClass,
} from "./types.js";

export type ConformanceControllerStatus =
	| "idle"
	| "running"
	| "awaiting-confirmation"
	| "complete";

export interface ConformanceControllerState {
	readonly status: ConformanceControllerStatus;
	readonly scenarioId?: string;
	readonly confirmationPrompt?: string;
}

export interface ConformanceScenarioExecutor {
	execute(definition: ConformanceScenarioDefinition): Promise<ConformanceScenarioExecution>;
	dispose?(): void | Promise<void>;
}

export type PrerequisiteCheckResult =
	| { readonly status: "ready" }
	| { readonly status: "blocked" | "skipped"; readonly reason: string };

export interface ConformanceControllerOptions {
	readonly executor: ConformanceScenarioExecutor;
	readonly environmentFactory: (hardwareClass: HardwareClass) => ConformanceEnvironment;
	readonly prerequisiteChecker: (
		definition: ConformanceScenarioDefinition,
	) => PrerequisiteCheckResult;
	readonly now?: () => Date;
	readonly packageVersion: string;
	readonly gitSha: string;
}

interface PendingConfirmation {
	readonly definition: ConformanceScenarioDefinition;
	readonly environment: ConformanceEnvironment;
	readonly execution: ConformanceScenarioExecution;
	readonly startedAt: string;
	readonly completedAt: string;
}

const RAW_DEVICE_IDENTITY_OBSERVATION_KEYS = new Set([
	"deviceid",
	"groupid",
	"label",
	"devicelabel",
]);

function freezeState(state: ConformanceControllerState): ConformanceControllerState {
	return Object.freeze({ ...state });
}

function normalizedObservationKey(key: string): string {
	return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function stripRawDeviceIdentity(
	definition: ConformanceScenarioDefinition,
	execution: ConformanceScenarioExecution,
): ConformanceScenarioExecution {
	if (!definition.deviceEvidence) return execution;

	return Object.freeze({
		...execution,
		observations: Object.freeze(
			execution.observations.filter(
				(observation) =>
					!RAW_DEVICE_IDENTITY_OBSERVATION_KEYS.has(
						normalizedObservationKey(observation.key),
					),
			),
		),
		assertions: Object.freeze([...execution.assertions]),
	});
}

export class ConformanceController {
	private readonly executor: ConformanceScenarioExecutor;
	private readonly environmentFactory: (
		hardwareClass: HardwareClass,
	) => ConformanceEnvironment;
	private readonly prerequisiteChecker: (
		definition: ConformanceScenarioDefinition,
	) => PrerequisiteCheckResult;
	private readonly now: () => Date;
	private readonly packageVersion: string;
	private readonly gitSha: string;
	private state: ConformanceControllerState = freezeState({ status: "idle" });
	private results: ConformanceScenarioResult[] = [];
	private hardwareClass: HardwareClass = "unknown";
	private pendingConfirmation: PendingConfirmation | null = null;
	private disposed = false;
	private executorDisposed = false;

	constructor(options: ConformanceControllerOptions) {
		this.executor = options.executor;
		this.environmentFactory = options.environmentFactory;
		this.prerequisiteChecker = options.prerequisiteChecker;
		this.now = options.now ?? (() => new Date());
		this.packageVersion = options.packageVersion;
		this.gitSha = options.gitSha;
	}

	getState(): ConformanceControllerState {
		return this.state;
	}

	getResults(): readonly ConformanceScenarioResult[] {
		return Object.freeze([...this.results]);
	}

	setHardwareClass(hardwareClass: HardwareClass): void {
		this.assertUsable();
		this.hardwareClass = hardwareClass;
	}

	async run(scenarioId: string): Promise<ConformanceScenarioResult | null> {
		this.assertUsable();
		if (this.state.status === "running" || this.state.status === "awaiting-confirmation") {
			throw new Error("A conformance scenario is already in progress");
		}

		const definition = getConformanceScenario(scenarioId);
		const environment = this.environmentFactory(this.hardwareClass);
		const startedAt = this.now().toISOString();
		const evidencePrerequisite = this.checkEvidencePrerequisite(definition);
		const prerequisite =
			evidencePrerequisite.status === "ready"
				? this.prerequisiteChecker(definition)
				: evidencePrerequisite;

		if (prerequisite.status !== "ready") {
			const result = createScenarioResult({
				scenarioId: definition.id,
				startedAt,
				completedAt: this.now().toISOString(),
				environment,
				observations: [
					{ key: "prerequisite.reason", value: prerequisite.reason },
				],
				assertions: [],
				statusOverride: prerequisite.status,
			});
			this.appendResult(result);
			return result;
		}

		this.state = freezeState({ status: "running", scenarioId: definition.id });
		let execution: ConformanceScenarioExecution;
		try {
			execution = stripRawDeviceIdentity(
				definition,
				await this.executor.execute(definition),
			);
		} catch (error) {
			const result = createScenarioResult({
				scenarioId: definition.id,
				startedAt,
				completedAt: this.now().toISOString(),
				environment,
				observations: [],
				assertions: [
					{
						id: "execution-error",
						passed: false,
						message: "Scenario execution failed",
					},
				],
				error: sanitizeCameraError(error),
			});
			this.appendResult(result);
			return result;
		}

		const completedAt = this.now().toISOString();
		if (definition.physicalConfirmation) {
			this.pendingConfirmation = Object.freeze({
				definition,
				environment,
				execution,
				startedAt,
				completedAt,
			});
			this.state = freezeState({
				status: "awaiting-confirmation",
				scenarioId: definition.id,
				confirmationPrompt: definition.physicalConfirmation.prompt,
			});
			return null;
		}

		const result = createScenarioResult({
			scenarioId: definition.id,
			startedAt,
			completedAt,
			environment,
			observations: execution.observations,
			assertions: execution.assertions,
			...(execution.error ? { error: execution.error } : {}),
			...(execution.statusOverride
				? { statusOverride: execution.statusOverride }
				: {}),
		});
		this.appendResult(result);
		return result;
	}

	confirmPhysicalObservation(passed: boolean): ConformanceScenarioResult {
		this.assertUsable();
		const pending = this.pendingConfirmation;
		if (!pending) throw new Error("No physical confirmation is pending");

		const prompt = pending.definition.physicalConfirmation?.prompt ?? "Physical confirmation";
		const result = createScenarioResult({
			scenarioId: pending.definition.id,
			startedAt: pending.startedAt,
			completedAt: pending.completedAt,
			environment: pending.environment,
			observations: pending.execution.observations,
			assertions: [
				...pending.execution.assertions,
				{
					id: "physical-confirmation",
					passed,
					expected: true,
					actual: passed,
					message: prompt,
				},
			],
			...(pending.execution.error ? { error: pending.execution.error } : {}),
		});

		this.pendingConfirmation = null;
		this.appendResult(result);
		return result;
	}

	getEvidenceDocument(generatedAt: string): ConformanceEvidenceDocument {
		this.assertUsable();
		return createEvidenceDocument({
			schemaVersion: 1,
			generatedAt,
			packageVersion: this.packageVersion,
			gitSha: this.gitSha,
			environment: this.environmentFactory(this.hardwareClass),
			results: this.results,
		});
	}

	reset(): void {
		this.assertUsable();
		if (this.state.status === "running") {
			throw new Error("Cannot reset while a conformance scenario is running");
		}
		this.results = [];
		this.pendingConfirmation = null;
		this.state = freezeState({ status: "idle" });
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.pendingConfirmation = null;
		this.results = [];
		this.state = freezeState({ status: "idle" });
		if (!this.executorDisposed) {
			this.executorDisposed = true;
			await this.executor.dispose?.();
		}
	}

	private checkEvidencePrerequisite(
		definition: ConformanceScenarioDefinition,
	): PrerequisiteCheckResult {
		const requiredScenario = definition.deviceEvidence?.requiresPassedScenario;
		if (!requiredScenario) return { status: "ready" };
		const satisfied = this.results.some(
			(result) => result.scenarioId === requiredScenario && result.status === "pass",
		);
		return satisfied
			? { status: "ready" }
			: {
					status: "blocked",
					reason: `Scenario requires passing ${requiredScenario} evidence first.`,
				};
	}

	private appendResult(result: ConformanceScenarioResult): void {
		this.results = [...this.results, result];
		this.state = freezeState({ status: "complete", scenarioId: result.scenarioId });
	}

	private assertUsable(): void {
		if (this.disposed) throw new Error("ConformanceController is disposed");
	}
}
