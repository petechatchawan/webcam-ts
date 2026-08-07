import type {
	ConformanceAssertion,
	ConformanceEnvironment,
	ConformanceScenarioResult,
	ConformanceScenarioResultInput,
	ConformanceStatus,
} from "./types.js";

function freezeRecords<T extends object>(values: readonly T[]): readonly Readonly<T>[] {
	return Object.freeze(values.map((value) => Object.freeze({ ...value })));
}

export function deriveScenarioStatus(
	assertions: readonly ConformanceAssertion[],
): Extract<ConformanceStatus, "pass" | "fail" | "blocked"> {
	if (assertions.length === 0) return "blocked";
	return assertions.every((assertion) => assertion.passed) ? "pass" : "fail";
}

export function createScenarioResult(
	input: ConformanceScenarioResultInput,
): ConformanceScenarioResult {
	const observations = freezeRecords(input.observations);
	const assertions = freezeRecords(input.assertions);
	const status = input.statusOverride ?? deriveScenarioStatus(assertions);

	return Object.freeze({
		scenarioId: input.scenarioId,
		status,
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		environment: Object.freeze({
			...input.environment,
			browser: Object.freeze({ ...input.environment.browser }),
			os: Object.freeze({ ...input.environment.os }),
		}),
		observations,
		assertions,
		...(input.error ? { error: Object.freeze({ ...input.error }) } : {}),
	});
}

export interface ConformanceScenarioExecution {
	readonly observations: ConformanceScenarioResultInput["observations"];
	readonly assertions: ConformanceScenarioResultInput["assertions"];
	readonly error?: ConformanceScenarioResultInput["error"];
	readonly statusOverride?: ConformanceScenarioResultInput["statusOverride"];
}

export interface ConformanceScenario {
	readonly id: string;
	run(): Promise<ConformanceScenarioExecution>;
}

export interface ScenarioRunnerOptions {
	readonly now?: () => Date;
}

export class ScenarioRunner {
	private readonly now: () => Date;

	constructor(options: ScenarioRunnerOptions = {}) {
		this.now = options.now ?? (() => new Date());
	}

	async run(
		scenario: ConformanceScenario,
		environment: ConformanceEnvironment,
	): Promise<ConformanceScenarioResult> {
		const startedAt = this.now().toISOString();
		const execution = await scenario.run();
		const completedAt = this.now().toISOString();

		return createScenarioResult({
			scenarioId: scenario.id,
			startedAt,
			completedAt,
			environment,
			observations: execution.observations,
			assertions: execution.assertions,
			...(execution.error ? { error: execution.error } : {}),
			...(execution.statusOverride ? { statusOverride: execution.statusOverride } : {}),
		});
	}
}
