import { sanitizeCameraError, sanitizeEvidenceValue } from "./privacy-sanitizer.js";
import type {
	ConformanceAssertion,
	ConformanceEnvironment,
	ConformanceObservation,
	ConformanceScenarioResult,
} from "./types.js";

export interface ConformanceEvidenceInput {
	readonly schemaVersion: number;
	readonly generatedAt: string;
	readonly packageVersion: string;
	readonly gitSha: string;
	readonly environment: ConformanceEnvironment;
	readonly results: readonly ConformanceScenarioResult[];
}

export interface ConformanceEvidenceDocument {
	readonly schemaVersion: number;
	readonly generatedAt: string;
	readonly packageVersion: string;
	readonly gitSha: string;
	readonly environment: ConformanceEnvironment;
	readonly results: readonly ConformanceScenarioResult[];
}

function sanitizeObservation(observation: ConformanceObservation): ConformanceObservation {
	return Object.freeze({
		key: observation.key,
		value: sanitizeEvidenceValue(observation.value) ?? null,
	});
}

function sanitizeAssertion(assertion: ConformanceAssertion): ConformanceAssertion {
	return Object.freeze({
		id: assertion.id,
		passed: assertion.passed,
		...(assertion.expected !== undefined
			? { expected: sanitizeEvidenceValue(assertion.expected) ?? null }
			: {}),
		...(assertion.actual !== undefined
			? { actual: sanitizeEvidenceValue(assertion.actual) ?? null }
			: {}),
		message: assertion.message,
	});
}

function sanitizeResult(result: ConformanceScenarioResult): ConformanceScenarioResult {
	return Object.freeze({
		scenarioId: result.scenarioId,
		status: result.status,
		startedAt: result.startedAt,
		completedAt: result.completedAt,
		environment: result.environment,
		observations: Object.freeze(result.observations.map(sanitizeObservation)),
		assertions: Object.freeze(result.assertions.map(sanitizeAssertion)),
		...(result.error ? { error: sanitizeCameraError(result.error) } : {}),
	});
}

export function createEvidenceDocument(
	input: ConformanceEvidenceInput,
): ConformanceEvidenceDocument {
	return Object.freeze({
		schemaVersion: input.schemaVersion,
		generatedAt: input.generatedAt,
		packageVersion: input.packageVersion,
		gitSha: input.gitSha,
		environment: Object.freeze({
			...input.environment,
			browser: Object.freeze({ ...input.environment.browser }),
			os: Object.freeze({ ...input.environment.os }),
		}),
		results: Object.freeze(input.results.map(sanitizeResult)),
	});
}

export function exportEvidenceJson(document: ConformanceEvidenceDocument): string {
	return `${JSON.stringify(document, null, 2)}\n`;
}
