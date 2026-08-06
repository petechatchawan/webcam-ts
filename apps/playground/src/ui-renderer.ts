import type { CaptureBlobOptions } from "webcam-ts/capture";
import { byId, formatBytes, readResolution } from "./dom.js";
import type { CameraController } from "./camera-controller.js";
import type { CameraSelection, PlaygroundSnapshot } from "./models.js";

interface MutableControlUpdate {
  torch?: boolean;
  zoom?: number;
  focusMode?: string;
}

export class UiRenderer {
  private readonly unsubscribe: () => void;
  private lastDevicesKey = "";

  private readonly permissionBadge = byId<HTMLElement>("permission-badge");
  private readonly permissionCamera = byId<HTMLElement>("permission-camera");
  private readonly permissionMicrophone = byId<HTMLElement>("permission-microphone");
  private readonly permissionButton = byId<HTMLButtonElement>("request-permission");
  private readonly refreshDevicesButton = byId<HTMLButtonElement>("refresh-devices");
  private readonly deviceSelect = byId<HTMLSelectElement>("device-select");
  private readonly facingSelect = byId<HTMLSelectElement>("facing-select");
  private readonly resolutionSelect = byId<HTMLSelectElement>("resolution-select");
  private readonly audioToggle = byId<HTMLInputElement>("audio-toggle");
  private readonly mirrorToggle = byId<HTMLInputElement>("mirror-toggle");
  private readonly startButton = byId<HTMLButtonElement>("start-camera");
  private readonly switchButton = byId<HTMLButtonElement>("switch-camera");
  private readonly stopButton = byId<HTMLButtonElement>("stop-camera");
  private readonly captureType = byId<HTMLSelectElement>("capture-type");
  private readonly captureQuality = byId<HTMLInputElement>("capture-quality");
  private readonly captureQualityValue = byId<HTMLOutputElement>("capture-quality-value");
  private readonly captureButton = byId<HTMLButtonElement>("capture-photo");
  private readonly captureImage = byId<HTMLImageElement>("capture-image");
  private readonly captureEmpty = byId<HTMLElement>("capture-empty");
  private readonly captureMetadata = byId<HTMLElement>("capture-metadata");
  private readonly statusBadge = byId<HTMLElement>("status-badge");
  private readonly statusMessage = byId<HTMLElement>("status-message");
  private readonly stateOutput = byId<HTMLElement>("state-output");
  private readonly devicesOutput = byId<HTMLElement>("devices-output");
  private readonly controlsPanel = byId<HTMLElement>("controls-panel");
  private readonly torchRow = byId<HTMLElement>("torch-row");
  private readonly torchToggle = byId<HTMLInputElement>("torch-toggle");
  private readonly zoomRow = byId<HTMLElement>("zoom-row");
  private readonly zoomInput = byId<HTMLInputElement>("zoom-input");
  private readonly zoomValue = byId<HTMLOutputElement>("zoom-value");
  private readonly focusRow = byId<HTMLElement>("focus-row");
  private readonly focusSelect = byId<HTMLSelectElement>("focus-select");
  private readonly applyControlsButton = byId<HTMLButtonElement>("apply-controls");
  private readonly errorPanel = byId<HTMLElement>("error-panel");
  private readonly errorCode = byId<HTMLElement>("error-code");
  private readonly errorMessage = byId<HTMLElement>("error-message");
  private readonly dismissErrorButton = byId<HTMLButtonElement>("dismiss-error");
  private readonly eventList = byId<HTMLOListElement>("event-list");
  private readonly clearEventsButton = byId<HTMLButtonElement>("clear-events");

  constructor(private readonly controller: CameraController) {
    this.bindEvents();
    this.unsubscribe = controller.subscribe((snapshot) => this.render(snapshot));
  }

  dispose(): void {
    this.unsubscribe();
  }

  private bindEvents(): void {
    this.permissionButton.addEventListener("click", () => {
      void this.run("Requesting permission…", () =>
        this.controller.requestPermissions(this.audioToggle.checked),
      );
    });
    this.refreshDevicesButton.addEventListener("click", () => {
      void this.run("Refreshing cameras…", () => this.controller.refreshDevices());
    });
    this.startButton.addEventListener("click", () => {
      void this.run("Starting camera…", () => this.controller.start(this.readSelection()));
    });
    this.switchButton.addEventListener("click", () => {
      void this.run("Switching camera…", () => this.controller.switch(this.readSelection()));
    });
    this.stopButton.addEventListener("click", () => {
      void this.run("Stopping camera…", () => this.controller.stop());
    });
    this.mirrorToggle.addEventListener("change", () => {
      this.controller.setMirror(this.mirrorToggle.checked);
    });
    this.captureQuality.addEventListener("input", () => {
      this.captureQualityValue.value = Number(this.captureQuality.value).toFixed(2);
    });
    this.captureType.addEventListener("change", () => {
      const jpeg = this.captureType.value === "image/jpeg";
      this.captureQuality.disabled = !jpeg;
    });
    this.captureButton.addEventListener("click", () => {
      const options: CaptureBlobOptions = {
        type: this.captureType.value as CaptureBlobOptions["type"],
        mirror: this.mirrorToggle.checked,
        ...(this.captureType.value === "image/jpeg"
          ? { quality: Number(this.captureQuality.value) }
          : {}),
      };
      void this.run("Capturing frame…", () => this.controller.capture(options).then(() => undefined));
    });
    this.zoomInput.addEventListener("input", () => {
      this.zoomValue.value = Number(this.zoomInput.value).toFixed(2);
    });
    this.applyControlsButton.addEventListener("click", () => {
      const snapshot = this.controller.getSnapshot();
      const update: MutableControlUpdate = {};
      if (snapshot.controls.torchSupported) update.torch = this.torchToggle.checked;
      if (snapshot.controls.zoom) update.zoom = Number(this.zoomInput.value);
      if (snapshot.controls.focusModes.length && this.focusSelect.value) {
        update.focusMode = this.focusSelect.value;
      }
      void this.run("Applying controls…", () => this.controller.applyControls(update));
    });
    this.dismissErrorButton.addEventListener("click", () => this.controller.clearError());
    this.clearEventsButton.addEventListener("click", () => this.controller.clearEvents());
  }

  private readSelection(): CameraSelection {
    const resolution = readResolution(this.resolutionSelect.value);
    return {
      deviceId: this.deviceSelect.value,
      facingMode: this.facingSelect.value as CameraSelection["facingMode"],
      width: resolution.width,
      height: resolution.height,
      audio: this.audioToggle.checked,
      mirror: this.mirrorToggle.checked,
    };
  }

  private async run(message: string, operation: () => Promise<void>): Promise<void> {
    this.statusMessage.textContent = message;
    try {
      await operation();
    } catch {
      // Typed failures are projected by CameraController.
    }
  }

  private render(snapshot: PlaygroundSnapshot): void {
    this.statusBadge.textContent = snapshot.camera.status;
    this.statusBadge.dataset.status = snapshot.camera.status;
    this.statusMessage.textContent = snapshot.availability.busy
      ? `${snapshot.camera.status}…`
      : snapshot.camera.status === "active"
        ? snapshot.camera.trackLabel ?? "Camera active"
        : "Ready";

    this.startButton.disabled = !snapshot.availability.canStart;
    this.switchButton.disabled = !snapshot.availability.canSwitch;
    this.stopButton.disabled = !snapshot.availability.canStop;
    this.captureButton.disabled = snapshot.camera.status !== "active";
    this.applyControlsButton.disabled = snapshot.camera.status !== "active";

    this.permissionCamera.textContent = snapshot.permissions.camera;
    this.permissionMicrophone.textContent = snapshot.permissions.microphone;
    this.permissionBadge.textContent = snapshot.permissions.camera;
    this.permissionBadge.dataset.permission = snapshot.permissions.camera;

    this.renderDevices(snapshot);
    this.renderControls(snapshot);
    this.renderCapture(snapshot);
    this.renderError(snapshot);
    this.renderEvents(snapshot);

    this.stateOutput.textContent = JSON.stringify(snapshot.camera, null, 2);
    this.devicesOutput.textContent = JSON.stringify(
      {
        devices: snapshot.devices,
        controls: snapshot.controls,
      },
      null,
      2,
    );
  }

  private renderDevices(snapshot: PlaygroundSnapshot): void {
    const key = snapshot.devices.map((device) => `${device.deviceId}:${device.label ?? ""}`).join("|");
    if (key === this.lastDevicesKey) return;
    this.lastDevicesKey = key;
    const previous = this.deviceSelect.value;
    this.deviceSelect.replaceChildren(new Option("Automatic selection", ""));
    snapshot.devices.forEach((device, index) => {
      this.deviceSelect.add(
        new Option(device.label ?? `Camera ${index + 1}`, device.deviceId),
      );
    });
    if ([...this.deviceSelect.options].some((option) => option.value === previous)) {
      this.deviceSelect.value = previous;
    } else if (snapshot.camera.deviceId) {
      this.deviceSelect.value = snapshot.camera.deviceId;
    }
  }

  private renderControls(snapshot: PlaygroundSnapshot): void {
    const hasControls =
      snapshot.controls.torchSupported ||
      snapshot.controls.zoom !== null ||
      snapshot.controls.focusModes.length > 0;
    this.controlsPanel.hidden = !hasControls;
    this.torchRow.hidden = !snapshot.controls.torchSupported;
    this.zoomRow.hidden = snapshot.controls.zoom === null;
    this.focusRow.hidden = snapshot.controls.focusModes.length === 0;

    if (snapshot.controls.zoom) {
      this.zoomInput.min = String(snapshot.controls.zoom.min);
      this.zoomInput.max = String(snapshot.controls.zoom.max);
      this.zoomInput.step = String(snapshot.controls.zoom.step);
      this.zoomInput.value = String(snapshot.controls.zoom.value);
      this.zoomValue.value = snapshot.controls.zoom.value.toFixed(2);
    }

    const focusKey = snapshot.controls.focusModes.join("|");
    if (this.focusSelect.dataset.key !== focusKey) {
      this.focusSelect.dataset.key = focusKey;
      this.focusSelect.replaceChildren(
        ...snapshot.controls.focusModes.map((mode) => new Option(mode, mode)),
      );
    }
  }

  private renderCapture(snapshot: PlaygroundSnapshot): void {
    const capture = snapshot.capture;
    this.captureImage.hidden = !capture;
    this.captureEmpty.hidden = Boolean(capture);
    if (!capture) {
      this.captureImage.removeAttribute("src");
      this.captureMetadata.textContent = "No captured frame yet.";
      return;
    }
    this.captureImage.src = capture.url;
    this.captureMetadata.textContent = `${capture.width}×${capture.height} · ${capture.type} · ${formatBytes(capture.size)} · ${new Date(capture.timestamp).toLocaleTimeString()}`;
  }

  private renderError(snapshot: PlaygroundSnapshot): void {
    this.errorPanel.hidden = !snapshot.error;
    if (!snapshot.error) return;
    this.errorCode.textContent = snapshot.error.code;
    this.errorMessage.textContent = `${snapshot.error.message}${snapshot.error.operation ? ` · ${snapshot.error.operation}` : ""}`;
  }

  private renderEvents(snapshot: PlaygroundSnapshot): void {
    const items = [...snapshot.events]
      .reverse()
      .map((entry) => {
        const item = document.createElement("li");
        const time = document.createElement("time");
        time.dateTime = new Date(entry.timestamp).toISOString();
        time.textContent = new Date(entry.timestamp).toLocaleTimeString();
        const text = document.createElement("span");
        text.textContent = entry.summary;
        item.append(time, text);
        return item;
      });
    this.eventList.replaceChildren(...items);
  }
}
