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
import { MessageService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { DialogModule } from "primeng/dialog";
import { DividerModule } from "primeng/divider";
import { ImageModule } from "primeng/image";
import { PanelModule } from "primeng/panel";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { SelectChangeEvent, SelectModule } from "primeng/select";
import { SkeletonModule } from "primeng/skeleton";
import { SliderChangeEvent, SliderModule } from "primeng/slider";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { ToggleSwitchChangeEvent, ToggleSwitchModule } from "primeng/toggleswitch";
import { ToolbarModule } from "primeng/toolbar";
import { TooltipModule } from "primeng/tooltip";
import { Resolution, WebcamConfiguration, WebcamState, WebcamStatus } from "webcam-ts";
import { DeviceManagerUtils } from "../utils/device-manager-utils";
import { WebcamService } from "./webcam.service";

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
		ToolbarModule,
		TagModule,
		ToggleSwitchModule,
		SelectModule,
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
		ImageModule,
	],
	providers: [MessageService],
	templateUrl: "./webcam-demo.component.html",
	styleUrls: ["./webcam-demo.component.css"],
})
export class WebcamDemoComponent implements OnInit, OnDestroy {
	// Services
	private readonly messageService = inject(MessageService);
	readonly webcamService = inject(WebcamService);

	// Template References
	@ViewChild("videoElement", { static: false })
	videoElementRef!: ElementRef<HTMLVideoElement>;

	// Resolution Presets
	readonly resolutions: Resolution[] = [
		// Standard Video (Landscape)
		{ label: "VGA", width: 640, height: 480 },
		{ label: "HD", width: 1280, height: 720 },
		{ label: "FHD", width: 1920, height: 1080 },
		{ label: "QHD", width: 2560, height: 1440 },
		{ label: "4K", width: 3840, height: 2160 },

		// Portrait Mode
		{ label: "VGA-P", width: 480, height: 640 },
		{ label: "HD-P", width: 720, height: 1280 },
		{ label: "FHD-P", width: 1080, height: 1920 },
		{ label: "QHD-P", width: 1440, height: 2560 },
		{ label: "4K-P", width: 2160, height: 3840 },

		// Square (Instagram/Social)
		{ label: "SQ-SD", width: 640, height: 640 },
		{ label: "SQ-HD", width: 720, height: 720 },
		{ label: "SQ-FHD", width: 1080, height: 1080 },
		{ label: "SQ-QHD", width: 1440, height: 1440 },
		{ label: "SQ-UHD", width: 1920, height: 1920 },

		// Common Web/Mobile
		{ label: "QVGA", width: 320, height: 240 },
		{ label: "SVGA", width: 800, height: 600 },
		{ label: "XGA", width: 1024, height: 768 },
		{ label: "WXGA", width: 1366, height: 768 },

		// Ultra Wide
		{ label: "UWFHD", width: 2560, height: 1080 },
		{ label: "UW4K", width: 3440, height: 1440 },
	];

	// State Signals
	readonly webcamState = signal<WebcamState>(this.webcamService.webcam.getState());
	readonly error = signal<string | null>(null);
	readonly selectedDevice = signal<MediaDeviceInfo | null>(null);
	readonly selectedResolution = signal<Resolution>(this.resolutions[1]); // Default to HD
	readonly enableMirror = signal<boolean>(false);
	readonly enableAudio = signal<boolean>(false);
	readonly enableTorch = signal<boolean>(false);
	readonly zoomValue = signal<number | null>(null);
	readonly minZoom = signal<number | null>(null);
	readonly maxZoom = signal<number | null>(null);
	readonly focusMode = signal<string | null>(null);
	readonly supportedFocusModes = signal<string[]>([]);
	readonly capturedImageUrl = signal<string | null>(null);
	readonly selectDeviceDetails = signal<MediaDeviceInfo | null>(null);
	readonly deviceCapabilitiesTestResult = signal<any>(null);
	readonly helpDialogVisible = signal(false);
	readonly permissionState = signal<"checking" | "granted" | "denied" | "prompt">("checking");
	readonly devices = signal<MediaDeviceInfo[]>([]);

	// Private State
	private videoEventListeners: { [key: string]: () => void } = {};

	// Computed Properties
	readonly status = computed<WebcamStatus>(() => this.webcamState().status);

	readonly currentConfig = computed(() => {
		const selectedDev = this.selectedDevice();
		if (!selectedDev) {
			console.warn("No device selected");
			return null;
		}

		const deviceInfo = this.devices().find(
			(device: MediaDeviceInfo) => device.deviceId === selectedDev.deviceId,
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

	constructor() {
		// Auto-select first device when devices change
		effect(() => {
			const devices = this.devices();
			if (devices.length > 0 && !this.selectedDevice()) {
				this.showToast(`เลือกอุปกรณ์แรก: ${devices[0].label}`);
				this.selectedDevice.set(devices[0]);
			}
		});

		// Sync webcam state
		effect(() => {
			const state = this.webcamService.state();
			this.webcamState.set(state);

			if (state.status !== "ready") {
				if (state.status === "idle" || state.status === "error") {
					const videoElement = this.videoElementRef?.nativeElement;
					if (videoElement) {
						videoElement.srcObject = null;
					}
				}
			}
		});

		// Sync devices
		effect(() => {
			const devices = this.webcamService.devices();
			this.devices.set(devices);
		});

		// Sync device capabilities (zoom/focus)
		effect(() => {
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
		});
	}

	async ngOnInit(): Promise<void> {
		try {
			await this.checkPermissionState();

			if (this.permissionState() === "granted") {
				await this.loadDevices();
			}
		} catch (error) {
			console.error("Initialization error:", error);
			this.error.set("เกิดข้อผิดพลาดในการเริ่มต้น");
		}
	}

	ngOnDestroy() {
		this.stopCamera();

		if (this.capturedImageUrl()) {
			URL.revokeObjectURL(this.capturedImageUrl()!);
		}
	}

	// ============================================================================
	// Permission Methods
	// ============================================================================

	async requestPermissionsAndLoadDevices() {
		await this.requestPermissions();
		await this.loadDevices();
	}

	async checkPermissionState(): Promise<void> {
		try {
			const result = await navigator.permissions.query({ name: "camera" as PermissionName });
			this.permissionState.set(result.state as "granted" | "denied" | "prompt");

			result.onchange = () => {
				this.permissionState.set(result.state as "granted" | "denied" | "prompt");
			};
		} catch (error) {
			console.warn("Permission API not supported, will request directly");
			this.permissionState.set("prompt");
		}
	}

	showPermissionGuidance(): void {
		const browser = this.getBrowserName();
		let guidance = `กรุณาอนุญาตการเข้าถึงกล้องในเบราว์เซอร์ ${browser}:\n\n`;

		if (browser.includes("Chrome")) {
			guidance += "1. คลิกที่ไอคอนกล้องในแถบที่อยู่\n";
			guidance += "2. เลือก 'อนุญาตเสมอ'\n";
			guidance += "3. รีเฟรชหน้าเว็บ";
		} else if (browser.includes("Firefox")) {
			guidance += "1. คลิกที่ไอคอนกล้องในแถบที่อยู่\n";
			guidance += "2. เลือก 'อนุญาต'\n";
			guidance += "3. รีเฟรชหน้าเว็บ";
		} else if (browser.includes("Safari")) {
			guidance += "1. ไปที่ Safari > การตั้งค่า > เว็บไซต์\n";
			guidance += "2. เลือก 'กล้อง'\n";
			guidance += "3. เลือก 'อนุญาต' สำหรับเว็บไซต์นี้\n";
			guidance += "4. รีเฟรชหน้าเว็บ";
		} else {
			guidance += "1. ตรวจสอบการตั้งค่าเบราว์เซอร์\n";
			guidance += "2. อนุญาตการเข้าถึงกล้อง\n";
			guidance += "3. รีเฟรชหน้าเว็บ";
		}

		this.showToast(guidance);
		this.helpDialogVisible.set(true);
	}

	getBrowserName(): string {
		const userAgent = navigator.userAgent;
		if (userAgent.includes("Chrome")) return "Chrome";
		if (userAgent.includes("Firefox")) return "Firefox";
		if (userAgent.includes("Safari")) return "Safari";
		if (userAgent.includes("Edge")) return "Edge";
		return "เบราว์เซอร์";
	}

	async loadDevices() {
		try {
			const devices = await this.webcamService.getAvailableDevices();
			this.devices.set(devices);
		} catch (error) {
			console.error("Failed to load devices:", error);
			this.showToast("ไม่สามารถโหลดรายการอุปกรณ์ได้");
		}
	}

	async requestPermissions(): Promise<void> {
		try {
			this.permissionState.set("checking");
			await this.webcamService.requestPermissions();
			await this.checkPermissionState();

			if (this.permissionState() === "granted") {
				this.showToast("อนุญาตการเข้าถึงกล้องแล้ว");
				await this.loadDevices();
			}
		} catch (error: any) {
			console.error("Permission request failed:", error);
			this.permissionState.set("denied");

			if (error.name === "NotAllowedError") {
				this.showToast("ไม่ได้รับอนุญาตให้เข้าถึงกล้อง");
				this.showPermissionGuidance();
			} else if (error.name === "NotFoundError") {
				this.showToast("ไม่พบกล้อง");
			} else {
				this.showToast("เกิดข้อผิดพลาดในการขออนุญาต");
			}
		}
	}

	async retryPermissions(): Promise<void> {
		await this.requestPermissions();
		if (this.permissionState() === "granted") {
			await this.loadDevices();
		}
	}

	// ============================================================================
	// Camera Control Methods
	// ============================================================================

	async startCamera(): Promise<void> {
		const config = this.currentConfig();
		if (!config) {
			this.showToast("การตั้งค่าไม่ถูกต้อง กรุณาตรวจสอบ");
			return;
		}

		await this.webcamService.startCamera(config);
	}

	stopCamera() {
		this.webcamService.stopCamera();
		this.showToast("ปิดกล้องแล้ว");

		const videoElement = this.videoElementRef?.nativeElement;
		if (videoElement) {
			videoElement.srcObject = null;
			Object.keys(this.videoEventListeners).forEach((eventName) => {
				videoElement.removeEventListener(eventName, this.videoEventListeners[eventName]);
			});
			this.videoEventListeners = {};
		}
	}

	async switchDevice(): Promise<void> {
		const currentStatus = this.status();

		if (!this.selectedDevice()) {
			this.showToast("กรุณาเลือกอุปกรณ์ก่อน");
			return;
		}

		if (currentStatus === "initializing") {
			this.showToast("กำลังโหลดอยู่ กรุณารอสักครู่");
			return;
		}

		try {
			if (currentStatus === "ready" || currentStatus === "error") {
				this.stopCamera();
			}
			await this.startCamera();
		} catch (error) {
			console.error("Error switching device:", error);
			this.showToast("เกิดข้อผิดพลาดในการเปลี่ยนอุปกรณ์");
		}
	}

	async switchResolution(): Promise<void> {
		if (!this.uiState().canSwitchResolution) {
			this.showToast("ไม่สามารถเปลี่ยนความละเอียดได้");
			return;
		}

		this.stopCamera();
		await this.startCamera();
	}

	// ============================================================================
	// Image Capture Methods
	// ============================================================================

	async captureImage(): Promise<void> {
		try {
			const captureResult = await this.webcamService.captureImage();

			// Revoke old URL if exists
			if (this.capturedImageUrl()) {
				URL.revokeObjectURL(this.capturedImageUrl()!);
			}

			// If mirror is enabled, we need to flip the image
			if (this.enableMirror()) {
				const flippedBlob = await this.flipImageBlob(captureResult.blob);
				const url = URL.createObjectURL(flippedBlob);
				this.capturedImageUrl.set(url);
			} else {
				// Use the url directly from CaptureResult
				this.capturedImageUrl.set(captureResult.url);
			}

			this.showToast("ถ่ายภาพสำเร็จ");
		} catch (error) {
			console.error("Capture failed:", error);
			this.showToast("ไม่สามารถถ่ายภาพได้");
		}
	}

	private async flipImageBlob(blob: Blob): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const url = URL.createObjectURL(blob);

			img.onload = () => {
				const canvas = document.createElement("canvas");
				canvas.width = img.width;
				canvas.height = img.height;
				const ctx = canvas.getContext("2d")!;

				ctx.translate(canvas.width, 0);
				ctx.scale(-1, 1);
				ctx.drawImage(img, 0, 0);

				canvas.toBlob((flippedBlob) => {
					URL.revokeObjectURL(url);
					if (flippedBlob) {
						resolve(flippedBlob);
					} else {
						reject(new Error("Failed to flip image"));
					}
				}, blob.type);
			};

			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error("Failed to load image"));
			};

			img.src = url;
		});
	}

	clearCapturedImage() {
		if (this.capturedImageUrl()) {
			URL.revokeObjectURL(this.capturedImageUrl()!);
			this.capturedImageUrl.set(null);
		}
	}

	// ============================================================================
	// Device Testing Methods
	// ============================================================================

	async testSelectDevice(facing: "front" | "back") {
		try {
			const deviceManagerUtils = new DeviceManagerUtils();
			const devices = await this.webcamService.getAvailableDevices();
			const selectDevice = await deviceManagerUtils.selectCamera(devices, facing);

			if (selectDevice) {
				this.selectDeviceDetails.set(selectDevice);
				this.showToast(`พบกล้อง${facing === "front" ? "หน้า" : "หลัง"}: ${selectDevice.label}`);
			} else {
				this.selectDeviceDetails.set(null);
				this.showToast(`ไม่พบกล้อง${facing === "front" ? "หน้า" : "หลัง"}`);
			}
		} catch (error) {
			this.selectDeviceDetails.set(null);
			this.showToast("เกิดข้อผิดพลาดในการค้นหากล้อง");
		}
	}

	async testDeviceCapabilities() {
		const device = this.selectedDevice();
		if (!device) {
			this.showToast("กรุณาเลือกกล้องก่อน");
			return;
		}

		try {
			if (this.uiState().isReady) {
				this.stopCamera();
			}

			await this.webcamService.testDeviceCapabilitiesByDeviceId(device.deviceId);

			const capabilities = this.webcamService.deviceCapability();
			this.deviceCapabilitiesTestResult.set(capabilities);

			this.showToast("ทดสอบความสามารถกล้องสำเร็จ");
		} catch (e) {
			this.showToast("ทดสอบความสามารถกล้องล้มเหลว");
			this.deviceCapabilitiesTestResult.set(null);
		}
	}

	// ============================================================================
	// Event Handlers
	// ============================================================================

	async onDeviceChange(device: MediaDeviceInfo | null) {
		this.selectedDevice.set(device);

		const currentStatus = this.status();
		const shouldSwitch =
			currentStatus === "ready" || currentStatus === "error" || currentStatus === "initializing";

		if (shouldSwitch && device) {
			try {
				await this.switchDevice();
				this.showToast(`เปลี่ยนเป็น ${device.label}`);
			} catch (error) {
				this.showToast("ไม่สามารถเปลี่ยนอุปกรณ์ได้");
			}
		}
	}

	async onResolutionChange(event: SelectChangeEvent) {
		this.selectedResolution.set(event.value);
		if (this.uiState().isReady) {
			await this.switchResolution();
			this.showToast(`เปลี่ยนความละเอียดเป็น ${event.value.label}`);
		}
	}

	async onMirrorChange(event: ToggleSwitchChangeEvent) {
		this.enableMirror.set(event.checked);
		if (this.uiState().isReady) {
			await this.switchDevice();
		}
	}

	async toggleAudio(event: ToggleSwitchChangeEvent) {
		this.enableAudio.set(event.checked);
		if (this.uiState().isReady) {
			await this.switchDevice();
		}
	}

	async onZoomChange(event: SliderChangeEvent) {
		const zoomLevel = event.value as number;
		this.zoomValue.set(zoomLevel);

		try {
			await this.webcamService.webcam.setZoom(zoomLevel);
		} catch (error) {
			console.error("Failed to set zoom:", error);
			this.showToast("ไม่สามารถปรับซูมได้");
		}
	}

	async toggleTorch(event: ToggleSwitchChangeEvent) {
		const enabled = event.checked;
		this.enableTorch.set(enabled);

		try {
			await this.webcamService.webcam.setTorch(enabled);
		} catch (error) {
			console.error("Failed to toggle torch:", error);
			this.showToast("ไม่สามารถเปิด/ปิดไฟแฟลชได้");
			this.enableTorch.set(!enabled);
		}
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	getCurrentCameraName(): string {
		const device = this.selectedDevice();
		return device?.label || "ไม่ทราบชื่ออุปกรณ์";
	}

	getDeviceType(): string {
		const ua = navigator.userAgent;
		if (/android/i.test(ua)) return "Android";
		if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
		if (/Mac/.test(ua)) return "macOS";
		if (/Win/.test(ua)) return "Windows";
		if (/Linux/.test(ua)) return "Linux";
		return "Desktop";
	}

	openHelpDialog() {
		this.helpDialogVisible.set(true);
	}

	closeHelpDialog() {
		this.helpDialogVisible.set(false);
	}

	showToast(message: string) {
		this.messageService.add({
			severity: "info",
			summary: "แจ้งเตือน",
			detail: message,
			life: 3000,
		});
	}
}
