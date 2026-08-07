import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ENGINES = Object.freeze(["chromium", "firefox", "webkit"]);

function requireNonNegativeCount(stats, key, engine) {
	const value = stats?.[key];
	if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
		throw new Error(`${engine} browser evidence has invalid ${key} count`);
	}
	return value;
}

async function readEvidence(directory, engine) {
	const path = join(directory, `browser-evidence-${engine}.json`);
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (error && typeof error === "object" && error.code === "ENOENT") {
			throw new Error(`Missing required browser evidence for ${engine}`);
		}
		throw error;
	}

	let report;
	try {
		report = JSON.parse(text);
	} catch {
		throw new Error(`${engine} browser evidence is not valid JSON`);
	}

	const projects = report?.config?.projects;
	if (!Array.isArray(projects) || !projects.some((project) => project?.name === engine)) {
		throw new Error(`${engine} browser evidence does not identify the required project`);
	}

	const expected = requireNonNegativeCount(report.stats, "expected", engine);
	const skipped = requireNonNegativeCount(report.stats, "skipped", engine);
	const unexpected = requireNonNegativeCount(report.stats, "unexpected", engine);
	const flaky = requireNonNegativeCount(report.stats, "flaky", engine);
	if (expected === 0) {
		throw new Error(`${engine} browser evidence contains zero expected tests`);
	}
	if (unexpected !== 0) {
		throw new Error(`${engine} browser evidence has unexpected failures: ${unexpected}`);
	}
	if (Array.isArray(report.errors) && report.errors.length > 0) {
		throw new Error(`${engine} browser evidence contains ${report.errors.length} top-level error(s)`);
	}

	return Object.freeze({ engine, expected, skipped, unexpected, flaky });
}

export async function verifyBrowserConformanceArtifacts(
	directory,
	requiredEngines = DEFAULT_ENGINES,
) {
	const engines = [...requiredEngines];
	const reports = [];
	for (const engine of engines) {
		reports.push(await readEvidence(directory, engine));
	}

	return Object.freeze({
		engines: Object.freeze(engines),
		totalExpected: reports.reduce((sum, report) => sum + report.expected, 0),
		totalSkipped: reports.reduce((sum, report) => sum + report.skipped, 0),
		totalUnexpected: reports.reduce((sum, report) => sum + report.unexpected, 0),
		totalFlaky: reports.reduce((sum, report) => sum + report.flaky, 0),
	});
}

async function main() {
	const directory = process.argv[2] ?? "browser-evidence";
	const summary = await verifyBrowserConformanceArtifacts(directory);
	console.log(
		`Browser conformance evidence PASS: ${summary.engines.join(", ")} — expected ${summary.totalExpected}, skipped ${summary.totalSkipped}, flaky ${summary.totalFlaky}, unexpected ${summary.totalUnexpected}`,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
