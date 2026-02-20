import { Component, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ButtonModule } from "primeng/button";
import { Resolution, DeviceCapability } from "webcam-ts";

@Component({
	selector: "app-webcam-diagnostics",
	standalone: true,
	imports: [CommonModule, ButtonModule],
	templateUrl: "./webcam-diagnostics.component.html",
})
export class WebcamDiagnosticsComponent {
	deviceType = input<string>("");
	cameraName = input<string>("");
	resolution = input.required<Resolution>();
	deviceCapability = input<DeviceCapability | null>(null);
	minZoom = input<number | null>(null);
	maxZoom = input<number | null>(null);
	selectedDevice = input<MediaDeviceInfo | null>(null);
	selectDeviceDetails = input<MediaDeviceInfo | null>(null);
	deviceCapabilitiesTestResult = input<DeviceCapability | null>(null);

	testSelectDevice = output<"front" | "back">();
	testDeviceCapabilities = output<void>();
}
