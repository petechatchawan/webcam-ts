import type { Webcam } from "../webcam.js";
import { WebcamError } from "../domain/error.js";

function withPreviewError<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		if (error instanceof WebcamError) throw error;
		throw new WebcamError("Webcam preview operation failed", {
			code: "PREVIEW_FAILED",
			recoverable: true,
			cause: error,
		});
	}
}

export interface PreviewOptions {
	readonly autoplay?: boolean;
	readonly muted?: boolean;
	readonly playsInline?: boolean;
	readonly mirror?: boolean;
}

export class Preview {
	private webcam: Webcam | null = null;
	private unsubscribe: (() => void) | null = null;
	private disposed = false;
	private mirror: boolean;
	private element: HTMLVideoElement | null;
	private readonly autoplay: boolean;
	private readonly muted: boolean;
	private readonly playsInline: boolean;

	public constructor(element: HTMLVideoElement, options: PreviewOptions = {}) {
		this.element = element;
		this.autoplay = options.autoplay ?? true;
		this.muted = options.muted ?? true;
		this.playsInline = options.playsInline ?? true;
		this.mirror = options.mirror ?? false;
		withPreviewError(() => this.applyOptions());
	}

	public bind(webcam: Webcam): void {
		withPreviewError(() => {
			this.assertUsable();
			this.detach();
			this.webcam = webcam;
			this.unsubscribe = webcam.subscribe((event) => {
				if (event.type !== "stream-changed") return;
				withPreviewError(() => this.applyStream(event.stream));
			});
			this.applyStream(webcam.getActiveStream());
		});
	}

	public detach(): void {
		withPreviewError(() => {
			this.unsubscribe?.();
			this.unsubscribe = null;
			this.webcam = null;
			if (this.element) this.element.srcObject = null;
		});
	}

	public setElement(element: HTMLVideoElement): void {
		withPreviewError(() => {
			this.assertUsable();
			if (this.element) this.element.srcObject = null;
			this.element = element;
			this.applyOptions();
			this.applyStream(this.webcam?.getActiveStream() ?? null);
		});
	}

	public setMirror(mirror: boolean): void {
		withPreviewError(() => {
			this.assertUsable();
			this.mirror = mirror;
			this.applyMirror();
		});
	}

	public dispose(): void {
		withPreviewError(() => {
			if (this.disposed) return;
			this.detach();
			if (this.element) this.element.style.transform = "";
			this.element = null;
			this.disposed = true;
		});
	}

	private applyOptions(): void {
		if (!this.element) return;
		this.element.autoplay = this.autoplay;
		this.element.muted = this.muted;
		this.element.playsInline = this.playsInline;
		this.applyMirror();
	}

	private applyMirror(): void {
		if (!this.element) return;
		this.element.style.transform = this.mirror ? "scaleX(-1)" : "";
	}

	private applyStream(stream: MediaStream | null): void {
		if (!this.element) return;
		this.element.srcObject = stream;
		if (stream && this.autoplay) {
			// Autoplay rejection is a browser policy outcome, not a preview failure.
			void this.element.play().catch(() => undefined);
		}
	}

	private assertUsable(): void {
		if (!this.disposed) return;
		throw new WebcamError("Preview has been disposed", {
			code: "DISPOSED",
			recoverable: false,
		});
	}
}
