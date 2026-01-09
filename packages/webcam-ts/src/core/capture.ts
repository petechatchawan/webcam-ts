import {
	CaptureImageBitmapOptions,
	CaptureImageBitmapResult,
	CaptureImageDataOptions,
	CaptureImageDataResult,
	CaptureImageOptions,
	CaptureImageResult,
} from "../types";
import { WebcamError, WebcamErrorCode } from "../utils/errors";

export class Capture {
	private canvas: HTMLCanvasElement | null = null;
	private context: CanvasRenderingContext2D | null = null;

	// Optimized context options for webcam capture (20-30% faster)
	private readonly OPTIMIZED_CONTEXT_OPTIONS = {
		alpha: false,
		desynchronized: true,
		willReadFrequently: true,
	} as const;

	// Reusable objects for performance
	private reusableImageData: ImageData | null = null;
	private cachedDimensions = { width: 0, height: 0 };
	private cachedScale = 1.0;
	private cachedMirror = false;

	// Optimization for captureImageBitmap mirroring (Lazy init)
	private mirrorCanvas: HTMLCanvasElement | null = null;
	private mirrorContext: CanvasRenderingContext2D | null = null;

	// Cache for targetCanvas contexts to avoid repeated getContext() calls
	private targetCanvasContextCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

	constructor() {
		// Pre-initialize canvas for better performance
		this.canvas = document.createElement("canvas");
		this.context = this.canvas.getContext("2d", this.OPTIMIZED_CONTEXT_OPTIONS) as CanvasRenderingContext2D | null;

		if (!this.context) {
			throw new WebcamError("Failed to create canvas context", WebcamErrorCode.UNKNOWN_ERROR);
		}
	}

	/**
	 * Original method: Capture with blob/base64 (SLOW ~20-40ms)
	 * Use ONLY for saving snapshots, NOT for real-time loops!
	 *
	 * @param videoElement - The video element to capture from
	 * @param options - Capture options
	 * @returns CaptureImageResult with blob, url, and base64
	 */
	async captureImageAsBase64(
		videoElement: HTMLVideoElement,
		options: CaptureImageOptions = {},
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
		const crop = options.crop;
		const targetCanvas = options.targetCanvas;

		const sourceWidth = crop ? crop.width : videoElement.videoWidth;
		const sourceHeight = crop ? crop.height : videoElement.videoHeight;
		const width = Math.floor(sourceWidth * scale);
		const height = Math.floor(sourceHeight * scale);

		let canvas = targetCanvas || this.canvas;
		let ctx = targetCanvas ? this.getOrCreateContext(targetCanvas, this.OPTIMIZED_CONTEXT_OPTIONS) : this.context;

		if (!canvas || !ctx) {
			throw new WebcamError("Canvas or context is not available", WebcamErrorCode.UNKNOWN_ERROR);
		}

		// Resize if needed (only for internal canvas)
		if (!targetCanvas) {
			if (
				this.cachedDimensions.width !== width ||
				this.cachedDimensions.height !== height ||
				this.cachedScale !== scale
			) {
				this.resizeCanvas(width, height, scale);
			}
		} else if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		// Apply mirror transform
		if (mirror !== this.cachedMirror || targetCanvas) {
			ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? width : 0, 0);
			if (!targetCanvas) {
				this.cachedMirror = mirror;
			}
		}

		// Draw to canvas
		try {
			if (crop) {
				ctx.drawImage(videoElement, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
			} else {
				ctx.drawImage(videoElement, 0, 0, width, height);
			}
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
				if (!canvas) {
					return reject(new Error("Canvas lost during blob creation"));
				}

				canvas.toBlob(
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
		const crop = options.crop;
		const targetCanvas = options.targetCanvas;

		const sourceWidth = crop ? crop.width : videoElement.videoWidth;
		const sourceHeight = crop ? crop.height : videoElement.videoHeight;
		const width = Math.floor(sourceWidth * scale);
		const height = Math.floor(sourceHeight * scale);

		let canvas = targetCanvas || this.canvas;
		let ctx = targetCanvas ? this.getOrCreateContext(targetCanvas, this.OPTIMIZED_CONTEXT_OPTIONS) : this.context;

		if (!canvas || !ctx) {
			throw new WebcamError("Canvas or context is not available", WebcamErrorCode.UNKNOWN_ERROR);
		}

		// Only resize when dimensions change (only for internal canvas)
		if (!targetCanvas) {
			if (
				this.cachedDimensions.width !== width ||
				this.cachedDimensions.height !== height ||
				this.cachedScale !== scale
			) {
				this.resizeCanvas(width, height, scale);
			}
		} else if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		// Use setTransform instead of save/restore (faster)
		if (mirror !== this.cachedMirror || targetCanvas) {
			if (mirror) {
				ctx.setTransform(-1, 0, 0, 1, width, 0);
			} else {
				ctx.setTransform(1, 0, 0, 1, 0, 0);
			}
			if (!targetCanvas) {
				this.cachedMirror = mirror;
			}
		}

		// Draw video frame to canvas
		try {
			if (crop) {
				ctx.drawImage(videoElement, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
			} else {
				ctx.drawImage(videoElement, 0, 0, width, height);
			}
		} catch (error) {
			throw new WebcamError(
				"Failed to draw video to canvas",
				WebcamErrorCode.CAPTURE_FAILED,
				error,
			);
		}

		// Always get new ImageData as context.getImageData returns a new object
		this.reusableImageData = ctx.getImageData(0, 0, width, height);

		return {
			imageData: this.reusableImageData,
			width,
			height,
			timestamp: Date.now(),
		};
	}

	/**
	 * 🚀 ULTRA FAST: Capture as ImageBitmap
	 * ~0.5-1ms per frame (faster than ImageData!)
	 * Perfect for Tesseract.js, Web Workers, OffscreenCanvas
	 *
	 * ⚠️ IMPORTANT: Remember to call imageBitmap.close() when done!
	 *
	 * @param videoElement - The video element to capture from
	 * @param options - Capture options (scale, mirror, crop)
	 * @returns CaptureImageBitmapResult with ImageBitmap and metadata
	 *
	 * @example
	 * ```ts
	 * const result = await capture.captureImageBitmap(video, {
	 *     scale: 0.5,
	 *     mirror: true,
	 *     crop: { x: 100, y: 100, width: 200, height: 200 }
	 * });
	 *
	 * // Use the bitmap
	 * await tesseract.recognize(result.imageBitmap);
	 *
	 * // IMPORTANT: Free memory when done
	 * result.imageBitmap.close();
	 * ```
	 */
	async captureImageBitmap(
		videoElement: HTMLVideoElement,
		options: CaptureImageBitmapOptions = {},
	): Promise<CaptureImageBitmapResult> {
		if (!videoElement || videoElement.readyState < 2) {
			throw new WebcamError(
				"Video element is not ready for capture",
				WebcamErrorCode.VIDEO_ELEMENT_NOT_SET,
			);
		}

		const scale = options.scale !== undefined ? Math.max(0.1, Math.min(2, options.scale)) : 1.0;
		const mirror = options.mirror ?? false;
		const crop = options.crop;
		const targetCanvas = options.targetCanvas;

		try {
			// Calculate dimensions
			const sourceWidth = crop ? crop.width : videoElement.videoWidth;
			const sourceHeight = crop ? crop.height : videoElement.videoHeight;
			const targetWidth = Math.floor(sourceWidth * scale);
			const targetHeight = Math.floor(sourceHeight * scale);

			// FAST PATH: No mirror (Direct createImageBitmap) 🚀
			if (!mirror) {
				const bitmapOptions: ImageBitmapOptions = {
					resizeWidth: targetWidth,
					resizeHeight: targetHeight,
					resizeQuality: "high",
				};

				let imageBitmap: ImageBitmap;
				if (crop) {
					imageBitmap = await createImageBitmap(
						videoElement,
						crop.x,
						crop.y,
						crop.width,
						crop.height,
						bitmapOptions,
					);
				} else {
					imageBitmap = await createImageBitmap(videoElement, bitmapOptions);
				}

				return {
					imageBitmap,
					width: targetWidth,
					height: targetHeight,
					timestamp: Date.now(),
				};
			}

			// SLOW PATH: Mirroring (Requires Canvas)
			// Using Lazy Initialization & Object Pooling to avoid GC pressure

			// 1. Get or create canvas
			let canvas = targetCanvas || this.mirrorCanvas;
			let ctx: CanvasRenderingContext2D;

			if (targetCanvas) {
				ctx = this.getOrCreateContext(targetCanvas, this.OPTIMIZED_CONTEXT_OPTIONS);
			} else {
				if (!this.mirrorCanvas) {
					this.mirrorCanvas = document.createElement("canvas");
					this.mirrorContext = this.mirrorCanvas.getContext("2d", this.OPTIMIZED_CONTEXT_OPTIONS) as CanvasRenderingContext2D | null;

					if (!this.mirrorContext) {
						throw new WebcamError(
							"Failed to create mirror canvas context",
							WebcamErrorCode.UNKNOWN_ERROR,
						);
					}
				}
				ctx = this.mirrorContext!;
			}

			if (!canvas) {
				throw new WebcamError("Canvas or context is not available", WebcamErrorCode.UNKNOWN_ERROR);
			}

			// 2. Resize if needed (Clears canvas automatically)
			if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
				canvas.width = targetWidth;
				canvas.height = targetHeight;
			}

			// 3. Draw with mirror transform
			ctx.setTransform(-1, 0, 0, 1, targetWidth, 0);

			if (crop) {
				ctx.drawImage(
					videoElement,
					crop.x,
					crop.y,
					crop.width,
					crop.height,
					0,
					0,
					targetWidth,
					targetHeight,
				);
			} else {
				ctx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
			}

			// 4. Create Bitmap from canvas
			const imageBitmap = await createImageBitmap(canvas);

			return {
				imageBitmap,
				width: targetWidth,
				height: targetHeight,
				timestamp: Date.now(),
			};
		} catch (error) {
			throw new WebcamError("Failed to create ImageBitmap", WebcamErrorCode.CAPTURE_FAILED, error);
		}
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
	 * Clear only internal caches (for stop/restart workflow)
	 * Preserves external canvas contexts for performance
	 */
	clearInternalCache(): void {
		if (this.canvas) {
			this.canvas.width = 0;
			this.canvas.height = 0;
		}
		if (this.mirrorCanvas) {
			this.mirrorCanvas.width = 0;
			this.mirrorCanvas.height = 0;
		}

		this.reusableImageData = null;
		this.cachedDimensions = { width: 0, height: 0 };
		this.cachedScale = 1.0;
		this.cachedMirror = false;
	}

	/**
	 * Clear resources
	 */
	dispose(): void {
		this.clearInternalCache();

		this.canvas = null;
		this.context = null;
		this.mirrorCanvas = null;
		this.mirrorContext = null;

		this.targetCanvasContextCache = new WeakMap();
	}

	/**
	 * Get or create canvas context from cache
	 * Optimized for repeated calls with the same canvas
	 */
	private getOrCreateContext(
		canvas: HTMLCanvasElement,
		options?: CanvasRenderingContext2DSettings,
	): CanvasRenderingContext2D {
		let ctx = this.targetCanvasContextCache.get(canvas);

		if (!ctx) {
			const newCtx = canvas.getContext("2d", options);
			if (newCtx) {
				this.targetCanvasContextCache.set(canvas, newCtx);
				ctx = newCtx;
			}
		}

		if (!ctx) {
			throw new WebcamError(
				"Failed to get canvas context",
				WebcamErrorCode.UNKNOWN_ERROR,
			);
		}

		return ctx;
	}
}
