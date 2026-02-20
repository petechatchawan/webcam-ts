import { Injectable } from "@angular/core";
import { UAInfo } from "ua-info";

export type CameraSelector = (devices: CameraDevice[]) => CameraDevice | null;
export const DEVICE_PATTERNS = {
	IOS: {
		FRONT: {
			PRIMARY: /^(front camera|front camera)$/i,
			ULTRA_WIDE: /^(front ultra wide camera|front ultra wide camera)$/i,
		},
		BACK: {
			TRIPLE: /^(back triple camera|back triple camera)$/i,
			DUAL: /^(back dual camera|back dual camera)$/i,
			PRIMARY: /^(back camera|back camera)$/i,
		},
	},
	DESKTOP: /^(camera|camera|facetime|integrated)$/i,
} as const;

export interface CameraDevice {
	label: string;
	deviceId: string;
	index: number;
	facingMode: CameraType;
}

export const mockDeviceOld: MediaDeviceInfo[] = [
	{
		label: "camera2 1, facing front",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
	{
		label: "camera2 2, facing front",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
	{
		label: "camera2 0, facing back",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
	{
		label: "camera2 3, facing back",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
];

export const mockDeviceNew: MediaDeviceInfo[] = [
	{
		label: "camera 1, facing front",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
	{
		label: "camera 3, facing front",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
	{
		label: "camera 0, facing back",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
	{
		label: "camera 2, facing back",
		deviceId: "*********************",
		kind: "videoinput",
		groupId: "",
		toJSON: () => ({
			label: "mock device",
			deviceId: "mock device id",
			kind: "videoinput",
			groupId: "",
		}),
	},
];

export type CameraType = "environment" | "user";

@Injectable({ providedIn: "root" })
export class DeviceManagerUtils {
	private readonly availableDevices = new Map<string, CameraDevice>();
	private uaInfo = new UAInfo();

	constructor() {
		const userAgent = navigator.userAgent;
		this.uaInfo.setUserAgent(userAgent);
	}

	public isFrontCamera(device: MediaDeviceInfo): boolean {
		const label = device.label.toLowerCase();
		const frontKeywords = ["front", "front", "facetime", "integrated", "facing front"];
		const exp = new RegExp(frontKeywords.join("|"), "i");
		return exp.test(label);
	}

	async selectCamera(
		devices: MediaDeviceInfo[],
		preferredFacing: "front" | "back",
	): Promise<MediaDeviceInfo | null> {
		try {
			const facing = preferredFacing === "front" ? "user" : "environment";
			const availableDevices = await this.getAvailableDevices(devices);
			const selectedDevice = this.selectDeviceByPlatform(availableDevices, facing);

			const deviceId = selectedDevice?.deviceId;
			const finalDevice = devices.find((device) => device.deviceId === deviceId) ?? null;
			return finalDevice;
		} catch (error) {
			return devices[0] ?? null;
		}
	}

	private async getAvailableDevices(devices: MediaDeviceInfo[]): Promise<CameraDevice[]> {
		const enrichmentPromises = devices.map(this.enrichDevice.bind(this));
		return Promise.all(enrichmentPromises);
	}

	private async enrichDevice(device: MediaDeviceInfo, index: number): Promise<CameraDevice> {
		const cachedDevice = this.availableDevices.get(device.deviceId);
		if (cachedDevice) {
			return cachedDevice;
		}

		const enrichedDevice = await this.createAvailableDevice(device, index);
		this.availableDevices.set(device.deviceId, enrichedDevice);

		return enrichedDevice;
	}

	private async createAvailableDevice(
		device: MediaDeviceInfo,
		index: number,
	): Promise<CameraDevice> {
		const facingMode = await this.determineFacingMode(device);
		const deviceIndex = this.isAndroidDevice()
			? this.parseAndroidIndexWithPatternDetection(device.label)
			: index;

		return {
			...device,
			label: device.label || "",
			deviceId: device.deviceId,
			index: deviceIndex,
			facingMode,
		};
	}

	private isAndroidDevice(): boolean {
		return (this.uaInfo.isMobile() || this.uaInfo.isTablet()) && this.uaInfo.isOS("Android");
	}

	private async determineFacingMode(device: MediaDeviceInfo): Promise<CameraType> {
		try {
			const capabilities = (device as InputDeviceInfo).getCapabilities();
			return (capabilities.facingMode?.[0] as CameraType) ?? "user";
		} catch {
			return "user";
		}
	}

	private parseAndroidIndex(label: string): number {
		const [firstPart] = label.split(",").map((part) => part.trim());
		const [, indexStr] = firstPart.split(" ");
		return Number.parseInt(indexStr, 10) || 0;
	}

	// Parse Android index for new pattern: "camera 1, facing front" -> index 1
	private parseAndroidIndexNew(label: string): number {
		const [firstPart] = label.split(",").map((part) => part.trim());
		const [, indexStr] = firstPart.split(" ");
		return Number.parseInt(indexStr, 10) || 0;
	}

	// Detect pattern and use appropriate parser
	private parseAndroidIndexWithPatternDetection(label: string): number {
		const [firstPart] = label.split(",").map((part) => part.trim());

		// Check if it's the old pattern "camera[number] X" (e.g., "camera2 1", "camera3 2")
		const oldPatternRegex = /^camera\d+\s/;
		// Check if it's the new pattern "camera X" (e.g., "camera 1")
		const newPatternRegex = /^camera\s/;

		if (oldPatternRegex.test(firstPart)) {
			// Old pattern: "camera2 1, facing front", "camera3 2, facing back", etc.
			return this.parseAndroidIndex(label);
		} else if (newPatternRegex.test(firstPart)) {
			// New pattern: "camera 1, facing front"
			return this.parseAndroidIndexNew(label);
		}

		// Fallback to old parser for unknown patterns
		return this.parseAndroidIndex(label);
	}

	private selectDeviceByPlatform(
		devices: CameraDevice[],
		preferredFacing: "user" | "environment",
	): CameraDevice | null {
		const platform = this.detectPlatform();
		const isMobile = this.uaInfo.isMobile() || this.uaInfo.isTablet();

		// check if it's iPad
		if (this.uaInfo.isIPad()) {
			return this.selectMobileDevice(devices, preferredFacing, (devices) =>
				this.selectIOSDevice(devices, preferredFacing),
			);
		}

		if (isMobile) {
			switch (platform) {
				case "ios":
				case "macos":
					return this.selectMobileDevice(devices, preferredFacing, (devices) =>
						this.selectIOSDevice(devices, preferredFacing),
					);
				case "android":
					return this.selectMobileDevice(
						devices,
						preferredFacing,
						this.selectAndroidDevice.bind(this),
					);
				default:
					return devices[0] ?? null;
			}
		} else {
			return this.selectDesktopDevice(devices);
		}
	}

	private detectPlatform(): string {
		if (this.uaInfo.isOS("iOS") || this.uaInfo.isOS("MacOS")) return "ios";
		if (this.uaInfo.isOS("Android")) return "android";
		return "default";
	}

	private selectMobileDevice(
		devices: CameraDevice[],
		preferredFacing: "user" | "environment",
		platformSelector: CameraSelector,
	): CameraDevice | null {
		const matchingDevices = devices.filter((device) => device.facingMode === preferredFacing);
		return matchingDevices.length ? platformSelector(matchingDevices) : null;
	}

	// Select desktop camera based on common desktop camera patterns
	private selectDesktopDevice(devices: CameraDevice[]): CameraDevice | null {
		const filteredDevices = devices.filter((device) =>
			DEVICE_PATTERNS.DESKTOP.test(device.label.toLowerCase()),
		);
		const sortedDevices = filteredDevices.sort((a, b) => a.index - b.index);
		const selectedDevice = sortedDevices[0] ?? devices[0] ?? null;
		return selectedDevice;
	}

	// Select the best camera for iOS based on specific camera patterns (front/back)
	private selectIOSDevice(
		devices: CameraDevice[],
		facing: "user" | "environment",
	): CameraDevice | null {
		const iosCameraPriority = this.getIOSCameraPriority();
		for (const regex of iosCameraPriority[facing]) {
			const matchedDevice = devices.find((device) => regex.test(device.label.toLowerCase()));
			if (matchedDevice) {
				return matchedDevice;
			}
		}

		// Fallback to the first available camera if no priority match
		return devices[0] || null;
	}

	// Priority camera regex patterns for iOS (front and back)
	private getIOSCameraPriority(): Record<CameraType, RegExp[]> {
		return {
			user: [DEVICE_PATTERNS.IOS.FRONT.PRIMARY, DEVICE_PATTERNS.IOS.FRONT.ULTRA_WIDE],
			environment: [
				DEVICE_PATTERNS.IOS.BACK.TRIPLE,
				DEVICE_PATTERNS.IOS.BACK.DUAL,
				DEVICE_PATTERNS.IOS.BACK.PRIMARY,
			],
		};
	}

	// Select the best camera for Android by sorting by index (or label if needed)
	private selectAndroidDevice(devices: CameraDevice[]): CameraDevice | null {
		if (!devices.length) return null;
		return devices.reduce((prev, curr) => (prev.index < curr.index ? prev : curr), devices[0]);
	}
}
