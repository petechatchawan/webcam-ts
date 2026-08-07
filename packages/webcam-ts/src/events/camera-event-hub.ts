import type { CameraEvent, CameraEventListener } from "../domain/camera-event.js";

export class CameraEventHub {
  private readonly listeners = new Set<CameraEventListener>();

  subscribe(listener: CameraEventListener): () => void {
    this.listeners.add(listener);
    let active = true;

    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
    };
  }

  emit(event: CameraEvent): void {
    const snapshot = Object.freeze({ ...event }) as CameraEvent;
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot);
      } catch {
        // Consumer listeners are isolated from camera lifecycle outcomes.
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
