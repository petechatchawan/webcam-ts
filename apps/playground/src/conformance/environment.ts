import type {
	ConformanceBrowserInfo,
	ConformanceEnvironment,
	ConformanceOsInfo,
	FormFactor,
	HardwareClass,
} from "./types.js";

export interface ConformanceNavigatorLike {
	readonly userAgent?: string;
}

export interface CollectConformanceEnvironmentOptions {
	readonly navigatorLike?: ConformanceNavigatorLike | null;
	readonly secureContext?: boolean;
	readonly packageVersion: string;
	readonly gitSha: string;
	readonly hardwareClass?: HardwareClass;
}

function normalizeVersion(value: string): string {
	return value.replaceAll("_", ".");
}

function parseBrowser(userAgent: string): {
	browser: ConformanceBrowserInfo;
	engine: string;
} {
	const firefox = /Firefox\/([\d.]+)/.exec(userAgent);
	if (firefox) {
		return {
			browser: { family: "Firefox", version: firefox[1] ?? "unknown" },
			engine: "Gecko",
		};
	}

	const edge = /Edg\/([\d.]+)/.exec(userAgent);
	if (edge) {
		return {
			browser: { family: "Edge", version: edge[1] ?? "unknown" },
			engine: "Blink",
		};
	}

	const chromium = /(?:Chrome|CriOS)\/([\d.]+)/.exec(userAgent);
	if (chromium) {
		return {
			browser: { family: "Chromium", version: chromium[1] ?? "unknown" },
			engine: "Blink",
		};
	}

	const safari = /Version\/([\d.]+).*Safari\//.exec(userAgent);
	if (safari) {
		return {
			browser: { family: "Safari", version: safari[1] ?? "unknown" },
			engine: "WebKit",
		};
	}

	return {
		browser: { family: "unknown", version: "unknown" },
		engine: "unknown",
	};
}

function parseOs(userAgent: string): ConformanceOsInfo {
	const ios = /(?:iPhone OS|CPU(?: iPhone)? OS) ([\d_]+)/.exec(userAgent);
	if (ios) return { family: "iOS", version: normalizeVersion(ios[1] ?? "unknown") };

	const android = /Android ([\d.]+)/.exec(userAgent);
	if (android) return { family: "Android", version: android[1] ?? "unknown" };

	const macos = /Mac OS X ([\d_]+)/.exec(userAgent);
	if (macos) return { family: "macOS", version: normalizeVersion(macos[1] ?? "unknown") };

	const windows = /Windows NT ([\d.]+)/.exec(userAgent);
	if (windows) return { family: "Windows", version: windows[1] ?? "unknown" };

	return { family: "unknown", version: "unknown" };
}

function parseFormFactor(userAgent: string): FormFactor {
	if (/Mobile|iPhone|iPad|Android/i.test(userAgent)) return "mobile";
	return userAgent.length > 0 ? "desktop" : "unknown";
}

export function collectConformanceEnvironment(
	options: CollectConformanceEnvironmentOptions,
): ConformanceEnvironment {
	const navigatorLike = options.navigatorLike ?? globalThis.navigator;
	const userAgent = navigatorLike?.userAgent ?? "";
	const { browser, engine } = parseBrowser(userAgent);

	return Object.freeze({
		browser: Object.freeze(browser),
		engine,
		os: Object.freeze(parseOs(userAgent)),
		formFactor: parseFormFactor(userAgent),
		secureContext: options.secureContext ?? globalThis.isSecureContext ?? false,
		packageVersion: options.packageVersion,
		gitSha: options.gitSha,
		hardwareClass: options.hardwareClass ?? "unknown",
	});
}
