import { CommonModule } from "@angular/common";
import {
	Component,
	ElementRef,
	OnDestroy,
	OnInit,
	ViewChild,
	computed,
	effect,
	inject,
	signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CheckboxModule } from "primeng/checkbox";
import { SliderModule } from "primeng/slider";
import { SliderChangeEvent } from "primeng/slider";
import { CardModule } from "primeng/card";
import { PanelModule } from "primeng/panel";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import {
	PermissionRequestOptions,
	Resolution,
	WebcamConfiguration,
	WebcamState,
	WebcamStatus,
} from "ts-webcam";
import { WebcamService } from "./webcam.service";
import { SelectChangeEvent, SelectModule } from "primeng/select";
import { DeviceManagerUtils } from "../utils/device-manager-utils";
import { DividerModule } from "primeng/divider";
import { ToastModule } from "primeng/toast";
import { TooltipModule } from "primeng/tooltip";
import { MessageService } from "primeng/api";
import { ToolbarModule } from "primeng/toolbar";
import { TagModule } from "primeng/tag";
import { ToggleSwitchChangeEvent, ToggleSwitchModule } from "primeng/toggleswitch";
import { DialogModule } from "primeng/dialog";
import { SkeletonModule } from "primeng/skeleton";

interface UiState {
	isLoading: boolean;
	isReady: boolean;
	isError: boolean;
	canStart: boolean;
	canStop: boolean;
	canCapture: boolean;
	canSwitchDevice: boolean;
	canSwitchResolution: boolean;
}

@Component({
	selector: "app-webcam-demo",
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		// PrimeNG
		ToolbarModule,
		TagModule,
		ToggleSwitchModule,
		SelectModule,
		CheckboxModule,
		SliderModule,
		CardModule,
		PanelModule,
		ProgressSpinnerModule,
		ButtonModule,
		DividerModule,
		ToastModule,
		TooltipModule,
		DialogModule,
		SkeletonModule,
	],
	providers: [MessageService],
	templateUrl: "./webcam-demo.component.html",
	styleUrls: ["./webcam-demo.component.css"],
})
export class WebcamDemoComponent implements OnInit, OnDestroy {
	@ViewChild("videoElement", { static: false })
	videoElementRef!: ElementRef<HTMLVideoElement>;

	// Static data
	readonly resolutions: Resolution[] = [
		{ label: "VGA-Landscape", width: 640, height: 480 },
		{ label: "VGA-Portrait", width: 480, height: 640 },
		{ label: "HD-Landscape", width: 1280, height: 720 },
		{ label: "HD-Portrait", width: 720, height: 1280 },
		{ label: "Full-HD-Landscape", width: 1920, height: 1080 },
		{ label: "Full-HD-Portrait", width: 1080, height: 1920 },
		{ label: "S720", width: 720, height: 720 },
		{ label: "S1080", width: 1080, height: 1080 },
		{ label: "S1280", width: 1280, height: 1280 },
		{ label: "S1440", width: 1440, height: 1440 },
		{ label: "S1920", width: 1920, height: 1920 },
	];

	// Inject() to get instance of services
	readonly webcamService: WebcamService = inject(WebcamService);
	readonly messageService: MessageService = inject(MessageService);

	// Reactive state using signals
	readonly permissionOptions = signal<PermissionRequestOptions>({ video: true, audio: false });
	readonly selectedDevice = signal<MediaDeviceInfo | null>(null);
	readonly selectedResolution = signal<Resolution | null>(this.resolutions[0]);
	readonly enableAudio = signal<boolean>(false);
	readonly enableMirror = signal<boolean>(true);
	readonly enableTorch = signal<boolean>(false);
	readonly zoomValue = signal<number | null>(null);
	readonly minZoom = signal<number | null>(null);
	readonly maxZoom = signal<number | null>(null);
	readonly focusMode = signal<string | null>(null);
	readonly supportedFocusModes = signal<string[]>([]);
	readonly capturedImageUrl = signal<string | null>(null);
	readonly selectDeviceDetails = signal<MediaDeviceInfo | null>(null);
	readonly helpDialogVisible = signal(false);
	// Permission state tracking
	readonly permissionState = signal<"checking" | "granted" | "denied" | "prompt">("checking");
	// Store event listeners for cleanup
	private videoEventListeners: { [key: string]: () => void } = {};

	// Reactive computed properties
	readonly currentConfig = computed(() => {
		const deviceInfo = this.devices().find(
			(device: MediaDeviceInfo) => device === this.selectedDevice(),
		);
		if (!deviceInfo || !this.videoElementRef?.nativeElement) {
			console.warn("No device info or video element found");
			return null;
		}

		return {
			deviceInfo,
			preferredResolutions: this.selectedResolution(),
			videoElement: this.videoElementRef.nativeElement,
			enableMirror: this.enableMirror(),
			enableAudio: this.enableAudio(),
		} as WebcamConfiguration;
	});

	// Reactive state from service
	readonly devices = signal<MediaDeviceInfo[]>([]);
	readonly webcamState = signal<WebcamState | null>(null);

	// Computed properties from webcam state
	readonly error = computed(() => this.webcamState()?.error?.message || null);
	readonly status = computed(() => this.webcamState()?.status || "idle");
	readonly permissions = computed(() => this.webcamState()?.permissions || {});

	// UI State computed from service data
	readonly uiState = computed<UiState>(() => {
		const currentStatus = this.status();
		const isLoading = currentStatus === "initializing";
		const isReady = currentStatus === "ready";
		const isError = currentStatus === "error";
		const hasSelectedDevice = !!this.selectedDevice();
		const isPermissionGranted = this.permissionState() === "granted";

		return {
			isLoading,
			isReady,
			isError,
			canStart: isPermissionGranted && hasSelectedDevice && !isLoading && !isReady,
			canStop: isReady,
			canCapture: isReady,
			canSwitchDevice: hasSelectedDevice && !isLoading,
			canSwitchResolution: hasSelectedDevice && !isLoading,
		};
	});

	// Add effect to update zoom/focus UI state from deviceCapabilities
	constructor() {
		// Auto-select first device when devices change
		effect(
			() => {
				const devices = this.devices();
				if (devices.length > 0 && !this.selectedDevice()) {
					this.showToast(`Selecting first device ${devices[0].label}`);
					this.selectedDevice.set(devices[0]);
				}
			},
			{ allowSignalWrites: true },
		);

		// Use effects for service signals synchronization
		effect(
			() => {
				const state = this.webcamService.state();
				// this.showToast(`Webcam state changed: ${state.status}`);
				this.webcamState.set(state);

				// Reset video ready state when status changes to non-ready states
				if (state.status !== "ready") {
					// Also clear video source if status is idle or error
					if (state.status === "idle" || state.status === "error") {
						const videoElement = this.videoElementRef?.nativeElement;
						if (videoElement) {
							videoElement.srcObject = null;
						}
					}
				}
			},
			{ allowSignalWrites: true },
		);

		effect(
			() => {
				const devices = this.webcamService.devices();
				this.devices.set(devices);
			},
			{ allowSignalWrites: true },
		);

		effect(
			() => {
				const caps = this.webcamService.deviceCapability();
				if (caps && typeof caps.maxZoom === "number" && typeof caps.minZoom === "number") {
					this.minZoom.set(caps.minZoom);
					this.maxZoom.set(caps.maxZoom);
					this.zoomValue.set(caps.minZoom);
				} else {
					this.minZoom.set(null);
					this.maxZoom.set(null);
					this.zoomValue.set(null);
				}
				if (caps && Array.isArray(caps.supportedFocusModes)) {
					this.supportedFocusModes.set(caps.supportedFocusModes);
					this.focusMode.set(caps.supportedFocusModes[0] || null);
				} else {
					this.supportedFocusModes.set([]);
					this.focusMode.set(null);
				}
			},
			{ allowSignalWrites: true },
		);
	}

	async ngOnInit(): Promise<void> {
		try {
			// Check current permission state first
			await this.checkPermissionState();

			// If permission is already granted, load devices
			if (this.permissionState() === "granted") {
				await this.loadDevices();
			} else if (this.permissionState() === "prompt") {
				// Auto-request permissions if browser supports it and user hasn't denied before
				try {
					await this.requestPermissions();
					// Load devices after successful permission grant
					if (this.permissionState() === "granted") {
						await this.loadDevices();
					}
				} catch (permissionError) {
					// Permission request failed, but we already handled the error in requestPermissions
					console.log("Permission request failed during initialization:", permissionError);
				}
			}
			// If permission is denied, we don't auto-request - let user manually retry
		} catch (error) {
			console.error("Initialization failed:", error);
			this.permissionState.set("denied");
			this.messageService.add({
				severity: "error",
				summary: "Initialization Error",
				detail: "Unable to initialize the system. Please try refreshing the page.",
				life: 6000,
			});
		}
	}

	ngOnDestroy() {
		// Clean up video event listeners
		const videoElement = this.videoElementRef?.nativeElement;
		if (videoElement) {
			Object.keys(this.videoEventListeners).forEach((eventName) => {
				videoElement.removeEventListener(eventName, this.videoEventListeners[eventName]);
			});
		}

		// Stop camera and dispose of resources
		this.webcamService.dispose();
	}

	// Permission methods
	async requestPermissionsAndLoadDevices() {
		await this.webcamService.requestPermissions(this.permissionOptions());
		await this.webcamService.getAvailableDevices();
	}

	/**
	 * Check current permission state with user feedback
	 */
	async checkPermissionState(): Promise<void> {
		try {
			this.messageService.add({
				severity: "info",
				summary: "Checking",
				detail: "Checking camera access permission status...",
				life: 2000,
			});

			const result = await navigator.permissions.query({ name: "camera" as PermissionName });
			this.permissionState.set(result.state);

			switch (result.state) {
				case "granted":
					this.messageService.add({
						severity: "success",
						summary: "Permission Granted",
						detail: "Camera access permission has been granted",
						life: 2000,
					});
					break;
				case "denied":
					this.messageService.add({
						severity: "error",
						summary: "Permission Denied",
						detail: "Camera access denied. Please enable it in your browser settings",
						life: 4000,
					});
					break;
				case "prompt":
					this.messageService.add({
						severity: "warn",
						summary: "Permission Required",
						detail:
							"Camera permission not requested yet. Please click the button to request permission",
						life: 3000,
					});
					break;
			}
		} catch (error) {
			console.error("Permission check failed:", error);
			this.permissionState.set("prompt");
			this.messageService.add({
				severity: "warn",
				summary: "Unable to Check",
				detail: "Unable to check permission status. Please try requesting permission directly",
				life: 4000,
			});
		}
	}

	/**
	 * Show detailed guidance for fixing permission issues
	 */
	showPermissionGuidance(): void {
		const browserName = this.getBrowserName();
		let guidanceMessage = "";

		switch (browserName) {
			case "Chrome":
				guidanceMessage =
					'1. Click the camera icon in the address bar\n2. Select "Allow" for camera\n3. Refresh the page\n\nOr go to Settings > Privacy and Security > Site Settings > Camera';
				break;
			case "Firefox":
				guidanceMessage =
					'1. Click the camera icon in the address bar\n2. Select "Allow"\n3. Refresh the page\n\nOr go to Settings > Privacy & Security > Permissions > Camera';
				break;
			case "Safari":
				guidanceMessage =
					'1. Go to Safari > Preferences > Websites\n2. Select Camera on the left\n3. Set this website to "Allow"\n4. Refresh the page';
				break;
			case "Edge":
				guidanceMessage =
					'1. Click the camera icon in the address bar\n2. Select "Allow"\n3. Refresh the page\n\nOr go to Settings > Site permissions > Camera';
				break;
			default:
				guidanceMessage =
					"1. Look for the camera icon in the address bar\n2. Click to change settings\n3. Allow camera access\n4. Refresh the page";
		}

		this.messageService.add({
			severity: "info",
			summary: `Troubleshooting for ${browserName}`,
			detail: guidanceMessage,
			life: 12000,
		});
	}

	/**
	 * Get browser name for specific guidance
	 */
	private getBrowserName(): string {
		const userAgent = navigator.userAgent;

		if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
			return "Chrome";
		} else if (userAgent.includes("Firefox")) {
			return "Firefox";
		} else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
			return "Safari";
		} else if (userAgent.includes("Edg")) {
			return "Edge";
		} else {
			return "Unknown";
		}
	}

	/**
	 * Loads available devices without requesting permissions
	 */
	async loadDevices() {
		try {
			await this.webcamService.getAvailableDevices();
			this.showToast("Devices loaded successfully");
		} catch (error) {
			this.showToast("Failed to load devices");
		}
	}

	/**
	 * Request permissions with comprehensive error handling and user guidance
	 */
	async requestPermissions(): Promise<void> {
		try {
			this.permissionState.set("checking");

			const stream = await navigator.mediaDevices.getUserMedia({
				video: this.permissionOptions().video,
				audio: this.permissionOptions().audio,
			});

			// Stop the stream immediately as we only needed it for permission
			stream.getTracks().forEach((track) => track.stop());

			this.permissionState.set("granted");
		} catch (error) {
			console.error("Permission request failed:", error);

			if (error instanceof Error) {
				switch (error.name) {
					case "NotAllowedError":
						this.permissionState.set("denied");
						this.messageService.add({
							severity: "error",
							summary: "Access Denied",
							detail:
								"User denied camera access permission. Please click the camera icon in the address bar to change settings",
							life: 8000,
						});
						break;
					case "NotFoundError":
						this.permissionState.set("denied");
						this.messageService.add({
							severity: "error",
							summary: "Device Not Found",
							detail: "No camera found in the system. Please check if camera is connected",
							life: 6000,
						});
						break;
					case "NotSupportedError":
						this.permissionState.set("denied");
						this.messageService.add({
							severity: "error",
							summary: "Not Supported",
							detail: "Browser does not support camera access. Please use a more modern browser",
							life: 6000,
						});
						break;
					case "SecurityError":
						this.permissionState.set("denied");
						this.messageService.add({
							severity: "error",
							summary: "Security Issue",
							detail:
								"Cannot access camera due to security restrictions. Please use HTTPS or localhost",
							life: 7000,
						});
						break;
					case "AbortError":
						this.permissionState.set("prompt");
						this.messageService.add({
							severity: "warn",
							summary: "Request Cancelled",
							detail: "Permission request was cancelled. Please try again",
							life: 4000,
						});
						break;
					case "OverconstrainedError":
					case "ConstraintNotSatisfiedError":
						this.permissionState.set("denied");
						this.messageService.add({
							severity: "error",
							summary: "Settings Not Supported",
							detail:
								"Requested settings are not supported by the device. Please try changing resolution or other settings",
							life: 6000,
						});
						break;
					default:
						this.permissionState.set("denied");
						this.messageService.add({
							severity: "error",
							summary: "Error Occurred",
							detail: `Unexpected error occurred: ${error.message}`,
							life: 5000,
						});
				}
			} else {
				this.permissionState.set("denied");
				this.messageService.add({
					severity: "error",
					summary: "Error Occurred",
					detail: "Unknown error occurred",
					life: 4000,
				});
			}

			throw error;
		}
	}

	/**
	 * Retry requesting permissions with enhanced user feedback
	 */
	async retryPermissions(): Promise<void> {
		try {
			this.permissionState.set("checking");

			// Show loading toast
			this.messageService.add({
				severity: "info",
				summary: "Requesting Permission",
				detail: "Please wait a moment...",
				life: 2000,
			});

			await this.requestPermissions();

			if (this.permissionState() === "granted") {
				this.messageService.add({
					severity: "success",
					summary: "Success!",
					detail: "Camera access permission granted",
					life: 3000,
				});
				await this.loadDevices();
			} else if (this.permissionState() === "denied") {
				this.messageService.add({
					severity: "error",
					summary: "Permission Denied",
					detail: "Please check your browser settings",
					life: 5000,
				});
			} else if (this.permissionState() === "prompt") {
				this.messageService.add({
					severity: "warn",
					summary: "Awaiting Permission",
					detail: "Please allow camera access in the popup window",
					life: 4000,
				});
			}
		} catch (error) {
			console.error("Error retrying permissions:", error);
			// Error handling is already done in requestPermissions method
		}
	}

	/**
	 * Starts the camera with the current configuration.
	 * This method initializes the camera with the selected device and settings, and updates the video source.
	 */
	public async startCamera(): Promise<void> {
		const config = this.currentConfig();
		if (!config) {
			this.showToast("Configuration is invalid, please check settings");
			return;
		}

		// Start camera with configuration
		await this.webcamService.startCamera(config);

		// Check torch support and set video ready state
		setTimeout(() => {
			// Update device capabilities after camera starts
			// const caps = this.webcamService.deviceCapability();
			// this.webcamService.deviceCapability.set(caps);
		}, 100);
	}

	/**
	 * Stops the currently running camera.
	 * This method releases the camera resources and clears the video source.
	 */
	public stopCamera() {
		// Stop camera
		this.webcamService.stopCamera();
		this.showToast(`Camera stopped`);

		// Clear video source and clean up event listeners
		const videoElement = this.videoElementRef?.nativeElement;
		if (videoElement) {
			// Clear the video source
			videoElement.srcObject = null;

			// Clean up video event listeners using stored references
			Object.keys(this.videoEventListeners).forEach((eventName) => {
				videoElement.removeEventListener(eventName, this.videoEventListeners[eventName]);
			});
			this.videoEventListeners = {};
		}
	}

	/**
	 * Switches the currently selected device.
	 * This method stops the current camera, updates the selected device, and restarts the camera with the new configuration.
	 * @returns A Promise that resolves when the device switch is complete.
	 */
	async switchDevice(): Promise<void> {
		if (!this.uiState().canSwitchDevice) {
			this.showToast("Cannot switch device: no device selected or camera is loading");
			return;
		}

		// Stop the current camera
		this.stopCamera();

		// Restart the camera with the new configuration
		await this.startCamera();
	}

	/**
	 * Switches the currently selected resolution.
	 * This method stops the current camera, updates the selected resolution, and restarts the camera with the new configuration.
	 * @returns A Promise that resolves when the resolution switch is complete.
	 */
	async switchResolution(): Promise<void> {
		if (!this.uiState().canSwitchResolution) {
			this.showToast("Cannot switch resolution: no resolution selected or camera is loading");
			return;
		}

		// Stop the current camera
		this.stopCamera();

		// Restart the camera with the new configuration
		await this.startCamera();
	}

	/**
	 * Captures an image from the webcam.
	 * This method triggers the capture process and updates the captured image URL.
	 * If mirror is enabled, the captured image will be flipped horizontally.
	 * @returns A Promise that resolves when the capture is complete.
	 */
	async captureImage(): Promise<void> {
		if (!this.uiState().canCapture) {
			this.showToast("Cannot capture: no device selected or camera is loading");
			return;
		}

		try {
			const { blob } = await this.webcamService.captureImage();
			if (blob) {
				// Check if mirror is enabled and flip the image if needed
				const isMirrorEnabled = this.enableMirror();
				let finalBlob = blob;

				if (isMirrorEnabled) {
					finalBlob = await this.flipImageBlob(blob);
				}

				// Create a temporary object URL for preview
				const url = URL.createObjectURL(finalBlob);
				this.capturedImageUrl.set(url);
			}
		} catch (error) {
			this.showToast(`Capture failed`);
		}
	}

	/**
	 * Flips an image blob horizontally using canvas transformation.
	 * @param blob The original image blob to flip
	 * @returns A Promise that resolves to the flipped image blob
	 */
	private async flipImageBlob(blob: Blob): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");

			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}

			img.onload = () => {
				canvas.width = img.width;
				canvas.height = img.height;

				// Flip horizontally
				ctx.scale(-1, 1);
				ctx.drawImage(img, -img.width, 0);

				// Convert canvas to blob
				canvas.toBlob((flippedBlob) => {
					if (flippedBlob) {
						resolve(flippedBlob);
					} else {
						reject(new Error("Failed to create flipped blob"));
					}
				}, "image/png");
			};

			img.onerror = () => {
				reject(new Error("Failed to load image"));
			};

			img.src = URL.createObjectURL(blob);
		});
	}

	/**
	 * Clears the currently captured image.
	 * This method revokes the object URL of the captured image and resets the URL state.
	 */
	clearCapturedImage() {
		const url = this.capturedImageUrl();
		if (url) {
			URL.revokeObjectURL(url);
			this.capturedImageUrl.set(null);
		}
	}

	async testSelectDevice(facing: "front" | "back") {
		const deviceManagerUtils = new DeviceManagerUtils();
		const devices = await this.webcamService.getAvailableDevices();
		const selectDevice = await deviceManagerUtils.selectCamera(devices, facing);
		this.selectDeviceDetails.set(selectDevice);
	}

	/**
	 * Tests the capabilities of the currently selected device.
	 * This method stops the camera, tests the device capabilities, and restarts the camera if needed.
	 * @returns A Promise that resolves when the test is complete.
	 */
	async testDeviceCapabilities() {
		const device = this.selectedDevice();
		if (!device) {
			this.showToast(`Please select a device`);
			return;
		}

		try {
			// Stop camera if running
			if (this.uiState().isReady) {
				this.stopCamera();
			}
			// Test device capabilities via service
			await this.webcamService.testDeviceCapabilitiesByDeviceId(device.deviceId);
			// Store the result for display
			// this.deviceCapability.set(this.deviceCapability());
			// Optionally, start camera again after testing
			// await this.startCamera();
			this.showToast(`Test device capabilities success`);
		} catch (e) {
			this.showToast(`Test device capabilities failed`);
		}
	}

	/**
	 * Updates the permission options and applies them to the service.
	 * @param options Partial permission options to merge with the current settings.
	 */
	updatePermissionOptions(options: Partial<PermissionRequestOptions>) {
		this.permissionOptions.set({ ...this.permissionOptions(), ...options });
	}

	/**
	 * Handles changes in the video permission checkbox.
	 * This method updates the permission options and triggers a permission check.
	 * @param event The event object containing the checkbox state.
	 */
	onVideoPermissionChange(event: ToggleSwitchChangeEvent) {
		const checked = event.checked;
		this.updatePermissionOptions({ video: checked });
	}

	/**
	 * Handles changes in the audio permission checkbox.
	 * This method updates the permission options and triggers a permission check.
	 * @param event The event object containing the checkbox state.
	 */
	onAudioPermissionChange(event: ToggleSwitchChangeEvent) {
		const checked = event.checked;
		this.updatePermissionOptions({ audio: checked });
	}

	/**
	 * Handles changes in the device selection dropdown.
	 * This method updates the selected device and triggers an auto-switch if the camera is already running.
	 * @param device The selected MediaDeviceInfo, or null to clear the selection.
	 */
	async onDeviceChange(device: MediaDeviceInfo | null) {
		this.selectedDevice.set(device);
		// Only auto-switch if camera is already running
		if (this.uiState().isReady) {
			await this.switchDevice();
			this.showToast(`Device set to ${device?.label}`);
		}
	}

	/**
	 * Handles changes in the resolution selection dropdown.
	 * This method updates the selected resolution and triggers an auto-switch if the camera is already running.
	 * @param event The DropdownChangeEvent object containing the selected resolution.
	 */
	async onResolutionChange(event: SelectChangeEvent) {
		const selectedResolution = event.value;
		if (selectedResolution) {
			this.selectedResolution.set(selectedResolution);
			// Only auto-switch if camera is already running
			if (this.uiState().isReady) {
				await this.switchResolution();
			}
		}

		this.showToast(`Resolution set to ${selectedResolution?.label}`);
	}

	/**
	 * Handles changes in the mirror checkbox.
	 * This method updates the mirror state and triggers a camera restart if the camera is already running.
	 * @param event The event object containing the checkbox state.
	 */
	async onMirrorChange(event: ToggleSwitchChangeEvent) {
		const checked = event.checked;
		this.enableMirror.set(checked);
		try {
			await this.startCamera();
			// this.showToast(`Mirror ${checked ? "enabled" : "disabled"}`);
		} catch (e) {
			this.showToast("Failed to set mirror");
		}
	}

	/**
	 * Handles changes in the audio checkbox.
	 * This method updates the audio state and triggers a camera restart if the camera is already running.
	 * @param event The event object containing the checkbox state.
	 */
	async toggleAudio(event: ToggleSwitchChangeEvent) {
		const checked = event.checked;
		this.enableAudio.set(checked);
		try {
			await this.startCamera();
			// this.showToast(`Audio ${checked ? "enabled" : "disabled"}`);
		} catch (e) {
			this.showToast("Failed to set audio");
		}
	}

	/**
	 * Handles changes in the zoom input field.
	 * This method updates the zoom level and triggers a camera restart if the camera is already running.
	 * @param event The SliderChangeEvent object containing the zoom value.
	 */
	async onZoomChange(event: SliderChangeEvent) {
		const value = event.value as number;
		if (value === null) return;

		this.zoomValue.set(value);

		// Only set zoom if camera is ready
		if (this.uiState().isReady) {
			try {
				await this.webcamService.webcamInstance.setZoom(value);
				// this.showToast(`Zoom set to ${value}`);
			} catch (e) {
				this.showToast("Failed to set zoom");
			}
		}
	}

	/**
	 * Handles changes in the focus mode selection dropdown.
	 * This method updates the focus mode and triggers a camera restart if the camera is already running.
	 * @param event The event object containing the selected focus mode value.
	 */
	async onFocusModeChange(event: SelectChangeEvent) {
		const value = event.value;
		this.focusMode.set(value);
		try {
			await this.webcamService.webcamInstance.setFocusMode(value);
			// this.showToast(`Focus mode set to ${value}`);
		} catch (e) {
			this.showToast("Failed to set focus mode");
		}
	}

	/**
	 * Toggles the torch state.
	 * This method checks if the device supports torch, toggles the torch state, and updates the UI accordingly.
	 */
	async toggleTorch(event: ToggleSwitchChangeEvent) {
		const enabled = event.checked;
		if (!this.webcamService.webcamInstance.isTorchSupported()) {
			this.showToast("Torch is not supported on this device");
			return;
		}

		try {
			await this.webcamService.webcamInstance.setTorch(enabled);
			this.enableTorch.set(enabled);
			// this.showToast(`Torch ${enabled ? "enabled" : "disabled"}`);
		} catch (error) {
			this.showToast("Failed to toggle torch");
		}
	}

	/**
	 * Retrieves the name of the currently selected camera.
	 * This method determines the device label or generates a name based on the device ID if available.
	 * @returns string - The name of the selected camera.
	 */
	public getCurrentCameraName(): string {
		const device = this.selectedDevice();
		if (!device) return "Unknown camera";
		return device.label || `Camera (${device.deviceId.slice(0, 8)}...)`;
	}

	/**
	 * Retrieves the type of the device running the application.
	 * This method uses the user agent to identify the device platform.
	 * @returns string - The type of the device (Android, iOS, macOS, Windows, Linux, or Desktop).
	 */
	public getDeviceType(): string {
		// Detect device type based on user agent
		const userAgent = navigator.userAgent.toLowerCase();
		if (/android/.test(userAgent)) return "Android";
		if (/iphone|ipad|ipod/.test(userAgent)) return "iOS";
		if (/mac/.test(userAgent)) return "macOS";
		if (/win/.test(userAgent)) return "Windows";
		if (/linux/.test(userAgent)) return "Linux";
		return "Desktop";
	}

	/**
	 * Retrieves the current status text based on the webcam state.
	 * This method maps the webcam state to a human-readable status text.
	 * @returns string - The status text corresponding to the current webcam state.
	 */
	public getStatusText(): string {
		const currentStatus: WebcamStatus = this.status();
		switch (currentStatus) {
			case "ready":
				return "Active";
			case "initializing":
				return "Starting...";
			case "error":
				return "Error";
			case "idle":
				return "Inactive";
			default:
				return "Unknown";
		}
	}

	openHelpDialog() {
		this.helpDialogVisible.set(true);
	}

	closeHelpDialog() {
		this.helpDialogVisible.set(false);
	}

	showToast(message: string) {
		this.messageService.add({
			severity: "contrast",
			summary: "Info",
			detail: message,
			life: 1500,
		});
	}
}
