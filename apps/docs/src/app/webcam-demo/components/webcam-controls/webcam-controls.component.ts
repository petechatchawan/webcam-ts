import { Component, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ButtonModule } from "primeng/button";
import { TooltipModule } from "primeng/tooltip";
import { Resolution } from "webcam-ts";

@Component({
	selector: "app-webcam-controls",
	standalone: true,
	imports: [CommonModule, ButtonModule, TooltipModule],
	templateUrl: "./webcam-controls.component.html",
})
export class WebcamControlsComponent {
	cameraName = input<string>("");
	resolution = input.required<Resolution>();
	canStart = input.required<boolean>();
	canCapture = input.required<boolean>();
	canStop = input.required<boolean>();
	isStartingCamera = input.required<boolean>();

	startCamera = output<void>();
	stopCamera = output<void>();
	captureImage = output<void>();
}
