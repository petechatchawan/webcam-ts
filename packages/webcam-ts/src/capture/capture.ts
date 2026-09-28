import type { Webcam } from "../webcam.js";
import { WebcamError } from "../domain/error.js";

export interface CropRegion {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface CaptureFrameOptions {
	readonly scale?: number;
	readonly mirror?: boolean;
	readonly crop?: CropRegion;
}

export interface CaptureBlobOptions extends CaptureFrameOptions {
	readonly type?: "image/jpeg" | "image/png" | "image/webp";
	readonly quality?: number;
}

export interface CapturedBlob {
	readonly blob: Blob;
	readonly width: number;
	readonly height: number;
	readonly type: string;
	readonly timestamp: number;
}

export interface CapturedImageData {
	readonly imageData: ImageData;
	readonly width: number;
	readonly height: number;
	readonly timestamp: number;
}

export interface CapturedImageBitmap {
	readonly imageBitmap: ImageBitmap;
	readonly width: number;
	readonly height: number;
	readonly timestamp: number;
}

export interface FrameEncoder {
	toBlob(stream: MediaStream, options?: CaptureBlobOptions): Promise<CapturedBlob>;
	toImageData(stream: MediaStream, options?: CaptureFrameOptions): Promise<CapturedImageData>;
	toImageBitmap(stream: MediaStream, options?: CaptureFrameOptions): Promise<CapturedImageBitmap>;
	dispose(): void;
}

export interface CaptureOptions {
	readonly encoder?: FrameEncoder;
}

export class Capture {
	private encoder: FrameEncoder | null;
	private disposed = false;

	public constructor(private readonly webcam: Webcam, options: CaptureOptions = {}) {
		this.encoder = options.encoder ?? null;
	}

	public async toBlob(options: CaptureBlobOptions = {}): Promise<CapturedBlob> {
		return this.withEncoder((encoder, stream) => encoder.toBlob(stream, options));
	}

	public async toImageData(options: CaptureFrameOptions = {}): Promise<CapturedImageData> {
		return this.withEncoder((encoder, stream) => encoder.toImageData(stream, options));
	}

	public async toImageBitmap(options: CaptureFrameOptions = {}): Promise<CapturedImageBitmap> {
		return this.withEncoder((encoder, stream) => encoder.toImageBitmap(stream, options));
	}

	public dispose(): void {
		if (this.disposed) return;
		try {
			this.encoder?.dispose();
		} catch (error) {
			if (error instanceof WebcamError) throw error;
			throw new WebcamError("Failed to dispose webcam capture encoder", {
				code: "CAPTURE_FAILED",
				recoverable: true,
				cause: error,
			});
		}
		this.encoder = null;
		this.disposed = true;
	}

	private async withEncoder<T>(
		operation: (encoder: FrameEncoder, stream: MediaStream) => Promise<T>,
	): Promise<T> {
		if (this.disposed) {
			throw new WebcamError("Capture has been disposed", {
				code: "DISPOSED",
				recoverable: false,
			});
		}

		const stream = this.webcam.getActiveStream();
		if (!stream) {
			throw new WebcamError("Webcam must be active before capture", {
				code: "INVALID_STATE",
				recoverable: true,
			});
		}

		const encoder = this.encoder ?? (this.encoder = new CanvasFrameEncoder());
		try {
			return await operation(encoder, stream);
		} catch (error) {
			if (error instanceof WebcamError) throw error;
			throw new WebcamError("Webcam frame capture failed", {
				code: "CAPTURE_FAILED",
				recoverable: true,
				cause: error,
			});
		}
	}
}

interface DrawnFrame {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	width: number;
	height: number;
}

function validateFrameOptions(options: CaptureFrameOptions): void {
	if (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0)) {
		throw new WebcamError("Capture scale must be greater than zero", {
			code: "INVALID_REQUEST",
			recoverable: true,
		});
	}
	if (
		options.crop &&
		[options.crop.x, options.crop.y, options.crop.width, options.crop.height].some(
			(value) => !Number.isFinite(value),
		)
	) {
		throw new WebcamError("Capture crop values must be finite", {
			code: "INVALID_REQUEST",
			recoverable: true,
		});
	}
	if (
		options.crop &&
		(options.crop.x < 0 ||
			options.crop.y < 0 ||
			options.crop.width <= 0 ||
			options.crop.height <= 0)
	) {
		throw new WebcamError(
			"Capture crop must have non-negative coordinates and positive dimensions",
			{
				code: "INVALID_REQUEST",
				recoverable: true,
			},
		);
	}
}

export class CanvasFrameEncoder implements FrameEncoder {
	private video: HTMLVideoElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private context: CanvasRenderingContext2D | null = null;
	private disposed = false;

	public toBlob(stream: MediaStream, options: CaptureBlobOptions = {}): Promise<CapturedBlob> {
		return this.withCaptureError(async () => {
			const frame = await this.draw(stream, options);
			const type = options.type ?? "image/jpeg";
			const quality =
				options.quality === undefined ? 0.92 : Math.max(0, Math.min(1, options.quality));
			const blob = await new Promise<Blob>((resolve, reject) => {
				frame.canvas.toBlob(
					(value) => (value ? resolve(value) : reject(new Error("Canvas returned an empty blob"))),
					type,
					quality,
				);
			});
			return Object.freeze({
				blob,
				width: frame.width,
				height: frame.height,
				type,
				timestamp: Date.now(),
			});
		});
	}

	public toImageData(
		stream: MediaStream,
		options: CaptureFrameOptions = {},
	): Promise<CapturedImageData> {
		return this.withCaptureError(async () => {
			const frame = await this.draw(stream, options);
			return Object.freeze({
				imageData: frame.context.getImageData(0, 0, frame.width, frame.height),
				width: frame.width,
				height: frame.height,
				timestamp: Date.now(),
			});
		});
	}

	public toImageBitmap(
		stream: MediaStream,
		options: CaptureFrameOptions = {},
	): Promise<CapturedImageBitmap> {
		return this.withCaptureError(async () => {
			const frame = await this.draw(stream, options);
			if (typeof globalThis.createImageBitmap !== "function") {
				throw new WebcamError("ImageBitmap capture is not supported by this browser", {
					code: "UNSUPPORTED_BROWSER",
					recoverable: false,
				});
			}
			const imageBitmap = await globalThis.createImageBitmap(frame.canvas);
			return Object.freeze({
				imageBitmap,
				width: frame.width,
				height: frame.height,
				timestamp: Date.now(),
			});
		});
	}

	public dispose(): void {
		if (this.disposed) return;
		try {
			if (this.video) this.video.srcObject = null;
			if (this.canvas) {
				this.canvas.width = 0;
				this.canvas.height = 0;
			}
			this.video = null;
			this.canvas = null;
			this.context = null;
			this.disposed = true;
		} catch (error) {
			if (error instanceof WebcamError) throw error;
			throw new WebcamError("Failed to dispose webcam capture encoder", {
				code: "CAPTURE_FAILED",
				recoverable: true,
				cause: error,
			});
		}
	}

	private async withCaptureError<T>(operation: () => Promise<T>): Promise<T> {
		try {
			return await operation();
		} catch (error) {
			if (error instanceof WebcamError) throw error;
			throw new WebcamError("Webcam frame capture failed", {
				code: "CAPTURE_FAILED",
				recoverable: true,
				cause: error,
			});
		}
	}

	private async draw(stream: MediaStream, options: CaptureFrameOptions): Promise<DrawnFrame> {
		this.assertUsable();
		validateFrameOptions(options);
		const video = await this.ensureVideo(stream);
		const source = options.crop ?? {
			x: 0,
			y: 0,
			width: video.videoWidth,
			height: video.videoHeight,
		};
		if (source.width <= 0 || source.height <= 0) {
			throw new WebcamError("Webcam frame dimensions are not available", {
				code: "CAPTURE_FAILED",
				recoverable: true,
			});
		}

		const scale = options.scale ?? 1;
		const width = Math.max(1, Math.floor(source.width * scale));
		const height = Math.max(1, Math.floor(source.height * scale));
		const { canvas, context } = this.ensureCanvas();
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;

		context.setTransform(options.mirror ? -1 : 1, 0, 0, 1, options.mirror ? width : 0, 0);
		context.clearRect(0, 0, width, height);
		context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, width, height);
		context.setTransform(1, 0, 0, 1, 0, 0);
		return { canvas, context, width, height };
	}

	private async ensureVideo(stream: MediaStream): Promise<HTMLVideoElement> {
		const documentValue = globalThis.document;
		if (!documentValue?.createElement) {
			throw new WebcamError("Canvas capture requires a browser document", {
				code: "UNSUPPORTED_RUNTIME",
				recoverable: false,
			});
		}

		const video = this.video ?? (this.video = documentValue.createElement("video"));
		video.autoplay = true;
		video.muted = true;
		video.playsInline = true;
		if (video.srcObject !== stream) video.srcObject = stream;
		if (video.readyState < 2) {
			await video.play();
			if (video.readyState < 2) {
				await new Promise<void>((resolve, reject) => {
					const timeout = globalThis.setTimeout(() => {
						cleanup();
						reject(new Error("Timed out waiting for a camera frame"));
					}, 2_000);
					const onReady = () => {
						cleanup();
						resolve();
					};
					const cleanup = () => {
						globalThis.clearTimeout(timeout);
						video.removeEventListener("loadeddata", onReady);
						video.removeEventListener("canplay", onReady);
					};
					video.addEventListener("loadeddata", onReady, { once: true });
					video.addEventListener("canplay", onReady, { once: true });
				});
			}
		}
		return video;
	}

	private ensureCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
		const documentValue = globalThis.document;
		if (!documentValue?.createElement) {
			throw new WebcamError("Canvas capture requires a browser document", {
				code: "UNSUPPORTED_RUNTIME",
				recoverable: false,
			});
		}
		const canvas = this.canvas ?? (this.canvas = documentValue.createElement("canvas"));
		const context =
			this.context ??
			(this.context = canvas.getContext("2d", {
				alpha: false,
				desynchronized: true,
				willReadFrequently: true,
			}));
		if (!context) {
			throw new WebcamError("Unable to create a 2D capture context", {
				code: "CAPTURE_FAILED",
				recoverable: false,
			});
		}
		return { canvas, context };
	}

	private assertUsable(): void {
		if (!this.disposed) return;
		throw new WebcamError("Capture encoder has been disposed", {
			code: "DISPOSED",
			recoverable: false,
		});
	}
}
