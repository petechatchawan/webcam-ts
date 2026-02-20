import { Component, ElementRef, ViewChild, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { ButtonModule } from "primeng/button";
import { Resolution } from "webcam-ts";
import { GlobalPermissionState } from "../../webcam-demo.component";

@Component({
	selector: "app-webcam-preview",
	standalone: true,
	imports: [CommonModule, ProgressSpinnerModule, ButtonModule],
	templateUrl: "./webcam-preview.component.html",
})
export class WebcamPreviewComponent {
	@ViewChild("videoElement", { static: false }) videoElementRef!: ElementRef<HTMLVideoElement>;

	// Inputs
	isLoading = input.required<boolean>();
	isReady = input.required<boolean>();
	isStartingCamera = input.required<boolean>();
	error = input<string | null>(null);
	errorTitle = input<string | null>(null);
	errorDetails = input<string | null>(null);
	permissionState = input.required<GlobalPermissionState>();
	canStart = input.required<boolean>();
	enableMirror = input.required<boolean>();
	resolution = input.required<Resolution>();

	// Outputs
	startCamera = output<void>();
	requestPermissions = output<void>();
	showPermissionGuidance = output<void>();

	getAspectClass(): string {
		const res = this.resolution();
		if (!res) return "aspect-video";

		// Landscape
		if (res.width > res.height) {
			// Ultra wide vs standard
			if (res.width / res.height > 2) return "aspect-[21/9]";
			return "aspect-video";
		}
		// Portrait
		else if (res.height > res.width) {
			if (res.height / res.width > 2) return "aspect-[9/21]";
			return "aspect-[9/16]";
		}
		// Square
		return "aspect-square";
	}
}
