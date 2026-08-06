export function byId<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing required element #${id}`);
	return element as T;
}

export function readResolution(value: string): Readonly<{ width: number; height: number }> {
	if (!value) return Object.freeze({ width: 0, height: 0 });
	const [widthText, heightText] = value.split("x");
	const width = Number(widthText);
	const height = Number(heightText);
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		return Object.freeze({ width: 0, height: 0 });
	}
	return Object.freeze({ width, height });
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
