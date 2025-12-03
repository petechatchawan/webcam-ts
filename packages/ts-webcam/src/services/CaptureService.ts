import { WebcamError, WebcamErrorCode } from "../utils/errors";
import { CaptureOptions, CaptureResult } from "../types";

export class CaptureService {
	private canvas: HTMLCanvasElement | null = null;
	private context: CanvasRenderingContext2D | null = null;

	/**
	 * Capture an image from the video element
	 */
	async captureImage(
		videoElement: HTMLVideoElement,
		options: CaptureOptions = {},
	): Promise<CaptureResult> {
		if (!videoElement || videoElement.readyState < 2) {
			throw new WebcamError(
				"Video element is not ready for capture",
				WebcamErrorCode.VIDEO_ELEMENT_NOT_SET,
			);
		}

		// Default options
		const imageType = options.imageType || "image/jpeg";
		const quality =
			options.quality !== undefined ? Math.max(0, Math.min(1, options.quality)) : 0.92;
		const scale = options.scale !== undefined ? Math.max(0.1, Math.min(2, options.scale)) : 1.0;
		const mirror = options.mirror !== undefined ? options.mirror : false;

		// Initialize canvas if needed (Singleton pattern)
		if (!this.canvas) {
			this.canvas = document.createElement("canvas");
			this.context = this.canvas.getContext("2d", { willReadFrequently: true });
		}

		if (!this.context || !this.canvas) {
			throw new WebcamError("Failed to create canvas context", WebcamErrorCode.UNKNOWN_ERROR);
		}

		// Calculate dimensions
		const width = Math.floor(videoElement.videoWidth * scale);
		const height = Math.floor(videoElement.videoHeight * scale);

		// Resize canvas
		this.canvas.width = width;
		this.canvas.height = height;

		// Draw to canvas
		try {
			this.context.save(); // Save state

			if (mirror) {
				// Flip horizontally
				this.context.translate(width, 0);
				this.context.scale(-1, 1);
			}

			this.context.drawImage(
				videoElement,
				0,
				0,
				videoElement.videoWidth,
				videoElement.videoHeight,
				0,
				0,
				width,
				height,
			);

			this.context.restore(); // Restore state
		} catch (error) {
			throw new WebcamError(
				"Failed to draw video to canvas",
				WebcamErrorCode.CAPTURE_FAILED,
				error,
			);
		}

		// Convert to Blob
		const blob = await new Promise<Blob>((resolve, reject) => {
			if (!this.canvas) return reject(new Error("Canvas lost"));

			this.canvas.toBlob(
				(b) => {
					if (b) resolve(b);
					else reject(new Error("Failed to create blob"));
				},
				imageType,
				quality,
			);
		});

		// Convert to Base64
		const base64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});

		return {
			blob,
			base64,
			width,
			height,
			mimeType: imageType,
			timestamp: Date.now(),
		};
	}

	/**
	 * Clear resources
	 */
	dispose(): void {
		this.canvas = null;
		this.context = null;
	}
}
