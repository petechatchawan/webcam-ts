import type { Webcam } from "../webcam.js";
import { WebcamError } from "../domain/error.js";

interface ExtendedCapabilities extends MediaTrackCapabilities {
	torch?: boolean;
	zoom?: { min: number; max: number; step?: number };
	focusMode?: string[];
}

interface ExtendedConstraintSet extends MediaTrackConstraintSet {
	torch?: boolean;
	zoom?: number;
	focusMode?: string;
}

export interface ControlUpdate {
	readonly torch?: boolean;
	readonly zoom?: number;
	readonly focusMode?: string;
}

export class Controls {
	public constructor(private readonly webcam: Webcam) {}

	public getCapabilities(): Readonly<ExtendedCapabilities> {
		const track = this.requireTrack();
		return Object.freeze(this.readCapabilities(track));
	}

	public async set(update: ControlUpdate): Promise<Readonly<MediaTrackSettings>> {
		const track = this.requireTrack();
		const capabilities = this.readCapabilities(track);
		const constraints: ExtendedConstraintSet = {};

		if (update.torch !== undefined) {
			if (!("torch" in capabilities)) this.unsupported("torch");
			constraints.torch = update.torch;
		}

		if (update.zoom !== undefined) {
			const range = capabilities.zoom;
			if (!range) this.unsupported("zoom");
			if (!Number.isFinite(update.zoom) || update.zoom < range.min || update.zoom > range.max) {
				throw new WebcamError("Zoom is outside the supported range", {
					code: "INVALID_REQUEST",
					recoverable: true,
					context: { min: range.min, max: range.max },
				});
			}
			constraints.zoom = update.zoom;
		}

		if (update.focusMode !== undefined) {
			const modes = capabilities.focusMode;
			if (!modes?.includes(update.focusMode)) this.unsupported("focusMode");
			constraints.focusMode = update.focusMode;
		}

		if (Object.keys(constraints).length === 0) {
			throw new WebcamError("At least one camera control must be supplied", {
				code: "INVALID_REQUEST",
				recoverable: true,
			});
		}

		try {
			await track.applyConstraints({ advanced: [constraints] });
			return Object.freeze({ ...track.getSettings() });
		} catch (error) {
			throw new WebcamError("Failed to apply camera controls", {
				code: "CONTROL_FAILED",
				recoverable: true,
				cause: error,
			});
		}
	}

	private requireTrack(): MediaStreamTrack {
		const track = this.webcam.getActiveTrack();
		if (!track) {
			throw new WebcamError("Webcam must be active before using controls", {
				code: "INVALID_STATE",
				recoverable: true,
			});
		}
		return track;
	}

	private readCapabilities(track: MediaStreamTrack): ExtendedCapabilities {
		try {
			return { ...(track.getCapabilities() as ExtendedCapabilities) };
		} catch (error) {
			if (error instanceof WebcamError) throw error;
			throw new WebcamError("Failed to read camera control capabilities", {
				code: "CONTROL_FAILED",
				recoverable: true,
				cause: error,
			});
		}
	}

	private unsupported(control: string): never {
		throw new WebcamError(`${control} is not supported by the active camera`, {
			code: "CONTROL_UNSUPPORTED",
			recoverable: true,
			context: { control },
		});
	}
}
