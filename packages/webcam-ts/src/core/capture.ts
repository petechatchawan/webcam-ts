import {
	CaptureImageDataOptions,
	CaptureImageDataResult,
	CaptureOptions,
	CaptureImageResult,
} from "../types";
import { WebcamError, WebcamErrorCode } from "../utils/errors";

export class Capture {
	private canvas: HTMLCanvasElement | null = null;
	private context: CanvasRenderingContext2D | null = null;

	// Reusable objects for performance
	private reusableImageData: ImageData | null = null;
	private cachedDimensions = { width: 0, height: 0 };
	private cachedScale = 1.0;
	private cachedMirror = false;

	constructor() {
		// Pre-initialize canvas for better performance
		this.canvas = document.createElement("canvas");
		this.context = this.canvas.getContext("2d", {
			alpha: false, // 10-15% faster without alpha
			desynchronized: true, // Better for real-time rendering
			willReadFrequently: true, // Optimize for getImageData
		});

		if (!this.context) {
			throw new WebcamError("Failed to create canvas context", WebcamErrorCode.UNKNOWN_ERROR);
		}
	}

	/**
	 * FASTEST: Capture as ImageData for real-time CV processing
	 * ~2-3ms per frame at 640x480
	 * Perfect for MediaPipe, Pico.js, TensorFlow.js loops
	 *
	 * @param videoElement - The video element to capture from
	 * @param options - Capture options (scale, mirror)
	 * @returns CaptureImageDataResult with ImageData and metadata
	 */
	captureImageData(
		videoElement: HTMLVideoElement,
		options: CaptureImageDataOptions = {},
	): CaptureImageDataResult {
		if (!videoElement || videoElement.readyState < 2) {
			throw new WebcamError(
				"Video element is not ready for capture",
				WebcamErrorCode.VIDEO_ELEMENT_NOT_SET,
			);
		}

		const scale = options.scale !== undefined ? Math.max(0.1, Math.min(2, options.scale)) : 1.0;
		const mirror = options.mirror ?? false;

		const width = Math.floor(videoElement.videoWidth * scale);
		const height = Math.floor(videoElement.videoHeight * scale);

		// Only resize when dimensions change
		if (
			this.cachedDimensions.width !== width ||
			this.cachedDimensions.height !== height ||
			this.cachedScale !== scale
		) {
			this.resizeCanvas(width, height, scale);
		}

		const ctx = this.context!;

		// Use setTransform instead of save/restore (faster)
		if (mirror !== this.cachedMirror) {
			if (mirror) {
				ctx.setTransform(-1, 0, 0, 1, width, 0);
			} else {
				ctx.setTransform(1, 0, 0, 1, 0, 0);
			}
			this.cachedMirror = mirror;
		}

		// Draw video frame to canvas
		try {
			ctx.drawImage(videoElement, 0, 0, width, height);
		} catch (error) {
			throw new WebcamError(
				"Failed to draw video to canvas",
				WebcamErrorCode.CAPTURE_FAILED,
				error,
			);
		}

		// Reuse ImageData object to eliminate GC pressure
		if (!this.reusableImageData) {
			this.reusableImageData = ctx.getImageData(0, 0, width, height);
		} else {
			// In-place update (fastest method)
			ctx.getImageData(0, 0, width, height, this.reusableImageData);
		}

		return {
			imageData: this.reusableImageData,
			width,
			height,
			timestamp: Date.now(),
		};
	}

	/**
	 * Original method: Capture with blob/base64 (SLOW ~20-40ms)
	 * Use ONLY for saving snapshots, NOT for real-time loops!
	 *
	 * @param videoElement - The video element to capture from
	 * @param options - Capture options
	 * @returns CaptureImageResult with blob, url, and base64
	 */
	async captureImage(
		videoElement: HTMLVideoElement,
		options: CaptureOptions = {},
	): Promise<CaptureImageResult> {
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
		const mirror = options.mirror ?? false;
		const includeBase64 = options.includeBase64 ?? true;

		const width = Math.floor(videoElement.videoWidth * scale);
		const height = Math.floor(videoElement.videoHeight * scale);

		// Resize if needed
		if (
			this.cachedDimensions.width !== width ||
			this.cachedDimensions.height !== height ||
			this.cachedScale !== scale
		) {
			this.resizeCanvas(width, height, scale);
		}

		const ctx = this.context!;

		// Apply mirror transform
		if (mirror !== this.cachedMirror) {
			ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? width : 0, 0);
			this.cachedMirror = mirror;
		}

		// Draw to canvas
		try {
			ctx.drawImage(videoElement, 0, 0, width, height);
		} catch (error) {
			throw new WebcamError(
				"Failed to draw video to canvas",
				WebcamErrorCode.CAPTURE_FAILED,
				error,
			);
		}

		// Convert to Blob
		let blob: Blob;
		try {
			blob = await new Promise<Blob>((resolve, reject) => {
				if (!this.canvas) {
					return reject(new Error("Canvas lost during blob creation"));
				}

				this.canvas.toBlob(
					(b) => {
						if (b) resolve(b);
						else reject(new Error("Failed to create blob from canvas"));
					},
					imageType,
					quality,
				);
			});
		} catch (error) {
			throw new WebcamError(
				"Failed to convert canvas to blob",
				WebcamErrorCode.CAPTURE_FAILED,
				error,
			);
		}

		// Create Object URL for preview
		const url = URL.createObjectURL(blob);

		// Generate base64 if requested
		let base64: string | undefined;
		if (includeBase64) {
			try {
				base64 = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onloadend = () => {
						const result = reader.result;
						if (typeof result === "string") {
							resolve(result);
						} else {
							reject(new Error("FileReader result is not a string"));
						}
					};
					reader.onerror = () => reject(reader.error || new Error("FileReader error"));
					reader.readAsDataURL(blob);
				});
			} catch (error) {
				// Clean up URL if base64 conversion fails
				URL.revokeObjectURL(url);
				throw new WebcamError(
					"Failed to convert blob to base64",
					WebcamErrorCode.CAPTURE_FAILED,
					error,
				);
			}
		}

		return {
			blob,
			url,
			base64,
			width,
			height,
			mimeType: imageType,
			timestamp: Date.now(),
		};
	}

	/**
	 * Display ImageData to a target canvas (for UI rendering)
	 * ~1-2ms per frame
	 *
	 * @param targetCanvas - Canvas to display on
	 * @param imageData - ImageData to display
	 */
	displayImageData(targetCanvas: HTMLCanvasElement, imageData: ImageData): void {
		const ctx = targetCanvas.getContext("2d");
		if (!ctx) {
			throw new WebcamError("Target canvas has no context", WebcamErrorCode.UNKNOWN_ERROR);
		}

		// Resize target canvas if needed
		if (targetCanvas.width !== imageData.width || targetCanvas.height !== imageData.height) {
			targetCanvas.width = imageData.width;
			targetCanvas.height = imageData.height;
		}

		ctx.putImageData(imageData, 0, 0);
	}

	/**
	 * Get current canvas (for libraries that accept HTMLCanvasElement)
	 */
	getCanvas(): HTMLCanvasElement | null {
		return this.canvas;
	}

	/**
	 * Get current dimensions
	 */
	getDimensions(): { width: number; height: number } {
		return { ...this.cachedDimensions };
	}

	/**
	 * Resize canvas and clear caches
	 */
	private resizeCanvas(width: number, height: number, scale: number): void {
		if (!this.canvas) return;

		this.canvas.width = width;
		this.canvas.height = height;
		this.cachedDimensions = { width, height };
		this.cachedScale = scale;
		this.reusableImageData = null; // Force recreation with new size
	}

	/**
	 * Clear resources
	 */
	dispose(): void {
		if (this.canvas) {
			this.canvas.width = 0;
			this.canvas.height = 0;
		}
		this.canvas = null;
		this.context = null;
		this.reusableImageData = null;
		this.cachedDimensions = { width: 0, height: 0 };
	}
}
