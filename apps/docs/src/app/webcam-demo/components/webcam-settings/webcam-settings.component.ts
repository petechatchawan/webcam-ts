import { Component, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SelectModule } from "primeng/select";
import { SliderModule } from "primeng/slider";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { DeviceCapability, Resolution } from "webcam-ts";

export interface ResolutionGroup {
	label: string;
	items: Resolution[];
}

@Component({
	selector: "app-webcam-settings",
	standalone: true,
	imports: [CommonModule, FormsModule, SelectModule, SliderModule, ToggleSwitchModule],
	templateUrl: "./webcam-settings.component.html",
})
export class WebcamSettingsComponent {
	devices = input.required<MediaDeviceInfo[]>();
	selectedDevice = input<MediaDeviceInfo | null>(null);
	resolutionGroups = input.required<ResolutionGroup[]>();
	selectedResolution = input.required<Resolution>();
	isLoading = input.required<boolean>();
	isReady = input.required<boolean>();
	enableMirror = input.required<boolean>();
	enableAudio = input.required<boolean>();
	enableTorch = input.required<boolean>();
	zoomValue = input<number | null>(null);
	minZoom = input<number | null>(null);
	maxZoom = input<number | null>(null);
	deviceCapability = input<DeviceCapability | null>(null);

	deviceChange = output<MediaDeviceInfo | null>();
	resolutionChange = output<Resolution>();
	mirrorChange = output<boolean>();
	audioChange = output<boolean>();
	torchChange = output<boolean>();
	zoomChange = output<number>();
}
