import type { CameraEvent, CameraEventListener } from "../domain/camera-event.js";

export class CameraEventHub {
	private readonly listeners = new Set<CameraEventListener>();

	public subscribe(listener: CameraEventListener): () => void {
		this.listeners.add(listener);
		let active = true;

		return () => {
			if (!active) return;
			active = false;
			this.listeners.delete(listener);
		};
	}

	public emit(event: CameraEvent): void {
		const snapshot = Object.freeze({ ...event }) as CameraEvent;
		for (const listener of [...this.listeners]) {
			try {
				listener(snapshot);
			} catch {
				// Consumer listeners are isolated from camera lifecycle outcomes.
			}
		}
	}

	public clear(): void {
		this.listeners.clear();
	}
}
