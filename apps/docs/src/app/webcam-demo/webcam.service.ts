import { Injectable, signal } from "@angular/core";
import {
	CaptureResult,
	DeviceCapability,
	PermissionRequestOptions,
	Webcam,
	WebcamConfiguration,
	WebcamState,
} from "webcam-ts";

@Injectable({ providedIn: "root" })
export class WebcamService {
	webcam = new Webcam();
	private _state = signal<WebcamState>(this.webcam.getState());
	private _devices = signal<MediaDeviceInfo[]>([]);
	private _permissionChecked = signal<boolean>(false);
	private _deviceCapability = signal<DeviceCapability | null>(null);

	public state = this._state.asReadonly();
	public devices = this._devices.asReadonly();
	public permissionChecked = this._permissionChecked.asReadonly();
	public deviceCapability = this._deviceCapability.asReadonly();

	constructor() {}

	/** Type-safe getter for the underlying TsWebcam instance */
	get webcamInstance(): Webcam {
		return this.webcam;
	}

	/**
	 * Check if webcam is supported in the current browser
	 * @returns true if MediaDevices API is available
	 */
	isSupported(): boolean {
		return this.webcam.isSupported();
	}

	/**
	 * Requests permissions and loads available devices
	 * @param options Permission options for video and audio access
	 * @returns Promise<boolean> - True if permissions are granted, false otherwise
	 */
	async requestPermissions(
		options: PermissionRequestOptions = { video: true, audio: false },
	): Promise<boolean> {
		try {
			const perms = await this.webcam.requestPermissions(options);
			this._permissionChecked.set(true);
			return !this.isPermissionDenied(perms);
		} catch (e) {
			console.error("Permission request failed:", e);
			this._permissionChecked.set(false);
			return false;
		}
	}

	/**
	 * Checks the current permissions for camera and microphone
	 * @returns Promise<Record<string, PermissionState>> - Object with permission states
	 */
	async checkPermission(): Promise<Record<string, PermissionState>> {
		try {
			const permissions = await this.webcam.checkPermissions();
			// Update the permission checked state
			this._permissionChecked.set(permissions["camera"] === "granted");
			return permissions;
		} catch (error) {
			console.error("Failed to check permissions:", error);
			this._permissionChecked.set(false);
			return { camera: "denied" as PermissionState, microphone: "denied" as PermissionState };
		}
	}

	/**
	 * Checks if camera or microphone permissions are denied
	 * @param perms Optional permissions object, uses current state if not provided
	 * @returns boolean - True if any required permission is denied or in prompt state
	 */
	public isPermissionDenied(perms?: Record<"camera" | "microphone", PermissionState>): boolean {
		const permissions = perms || this.state().permissions;
		return permissions["camera"] === "denied" || permissions["camera"] === "prompt";
	}

	/**
	 * Loads available video devices
	 * @returns Promise<MediaDeviceInfo[]>
	 */
	async getAvailableDevices(): Promise<MediaDeviceInfo[]> {
		try {
			// Check if device list is already available
			const devices = await this.webcam.getDevices();
			this._devices.set(devices);
			return devices ?? [];
		} catch (e) {
			console.error("Load devices failed:", e);
			return [];
		}
	}

	async startCamera(config: WebcamConfiguration) {
		try {
			// Add callbacks to the configuration
			const configWithCallbacks: WebcamConfiguration = {
				...config,
				onStateChange: (state: WebcamState) => {
					this._state.set(state);
				},
				onStreamStart: async (stream: MediaStream) => {
					console.log("Stream started:", stream);
					const activeDevice = await this.webcam.getCurrentDevice();
					console.log("Active device:", activeDevice);
					const activeResolution = this.webcam.getCurrentResolution();
					console.log("Active resolution:", activeResolution);
				},
				onStreamStop: () => {
					console.log("Stream stopped");
				},
				onError: (error) => {
					console.error("Webcam error:", error);
				},
				onPermissionChange: (permissions) => {
					console.log("Permissions changed:", permissions);
					this._permissionChecked.set(true);
				},
				onDeviceChange: (devices) => {
					this._devices.set(devices);
				},
			};

			await this.webcam.start(configWithCallbacks);
			if (configWithCallbacks.deviceInfo) {
				await this.testDeviceCapabilitiesByDeviceId(configWithCallbacks.deviceInfo.deviceId);
			}
		} catch (e) {
			console.error("Start camera failed:", e);
		}
	}

	/**
	 * Stops the camera stream
	 */
	stopCamera() {
		this.webcam.stop();
	}

	/**
	 * Tests device capabilities for a given device ID
	 * @param deviceId ID of the device to test
	 */
	async testDeviceCapabilitiesByDeviceId(deviceId: string) {
		this._deviceCapability.set(null);

		try {
			const caps = await this.webcam.getCapabilities(deviceId);
			this._deviceCapability.set(caps);
		} catch (e) {
			console.error("Test device capabilities failed:", e);
		}
	}

	/**
	 * Captures an image from the webcam
	 * @returns Promise<Blob> - A blob containing the captured image
	 */
	async captureImage(): Promise<CaptureResult> {
		try {
			return await this.webcam.captureImage();
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : "Unable to capture image";
			console.error("Capture failed:", errorMessage);
			throw new Error(errorMessage);
		}
	}

	/**
	 * Checks if the device supports torch
	 * @returns boolean
	 */
	isTorchSupported() {
		return this.webcam.isTorchSupported();
	}

	/**
	 * Checks if the device supports zoom
	 * @returns boolean
	 */
	isZoomSupported() {
		return this.webcam.isZoomSupported();
	}

	/**
	 * Checks if the device supports focus
	 * @returns boolean
	 */
	isFocusSupported() {
		return this.webcam.isFocusSupported();
	}

	/**
	 * Disposes of the webcam resources
	 */
	dispose() {
		this.webcam.dispose();
	}
}
