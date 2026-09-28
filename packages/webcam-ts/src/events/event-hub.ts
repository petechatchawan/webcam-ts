import type { WebcamEvent, WebcamEventListener } from "../domain/event.js";

export class EventHub {
	private readonly listeners = new Set<WebcamEventListener>();

	public subscribe(listener: WebcamEventListener): () => void {
		this.listeners.add(listener);
		let active = true;

		return () => {
			if (!active) return;
			active = false;
			this.listeners.delete(listener);
		};
	}

	public emit(event: WebcamEvent): void {
		const snapshot = Object.freeze({ ...event }) as WebcamEvent;
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
