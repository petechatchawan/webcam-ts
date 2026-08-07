import { exportEvidenceJson } from "./evidence-exporter.js";
import type { ConformanceController } from "./conformance-controller.js";
import { CONFORMANCE_SCENARIOS } from "./scenarios.js";
import type { HardwareClass } from "./types.js";

function requireElement<T extends HTMLElement>(root: ParentNode, id: string): T {
	const element = root.querySelector<T>(`#${id}`);
	if (!element) throw new Error(`Missing conformance element #${id}`);
	return element;
}

export class ConformanceRenderer {
	private readonly hardwareClass: HTMLSelectElement;
	private readonly scenarioSelect: HTMLSelectElement;
	private readonly runButton: HTMLButtonElement;
	private readonly status: HTMLElement;
	private readonly confirmation: HTMLElement;
	private readonly confirmationPrompt: HTMLElement;
	private readonly confirmPass: HTMLButtonElement;
	private readonly confirmFail: HTMLButtonElement;
	private readonly exportButton: HTMLButtonElement;
	private readonly result: HTMLElement;
	private bound = false;

	constructor(
		private readonly controller: ConformanceController,
		root: ParentNode,
	) {
		this.hardwareClass = requireElement(root, "conformance-hardware-class");
		this.scenarioSelect = requireElement(root, "conformance-scenario-select");
		this.runButton = requireElement(root, "conformance-run");
		this.status = requireElement(root, "conformance-status");
		this.confirmation = requireElement(root, "conformance-confirmation");
		this.confirmationPrompt = requireElement(root, "conformance-confirmation-prompt");
		this.confirmPass = requireElement(root, "conformance-confirm-pass");
		this.confirmFail = requireElement(root, "conformance-confirm-fail");
		this.exportButton = requireElement(root, "conformance-export");
		this.result = requireElement(root, "conformance-result");
	}

	bind(): void {
		if (this.bound) return;
		this.bound = true;
		this.populateScenarios();
		this.controller.setHardwareClass(this.hardwareClass.value as HardwareClass);

		this.hardwareClass.addEventListener("change", () => {
			this.controller.setHardwareClass(this.hardwareClass.value as HardwareClass);
		});
		this.runButton.addEventListener("click", () => {
			void this.runSelectedScenario();
		});
		this.confirmPass.addEventListener("click", () => {
			this.controller.confirmPhysicalObservation(true);
			this.render();
		});
		this.confirmFail.addEventListener("click", () => {
			this.controller.confirmPhysicalObservation(false);
			this.render();
		});
		this.exportButton.addEventListener("click", () => this.exportEvidence());
		this.render();
	}

	private populateScenarios(): void {
		this.scenarioSelect.replaceChildren(
			...CONFORMANCE_SCENARIOS.map((scenario) => {
				const option = document.createElement("option");
				option.value = scenario.id;
				option.textContent = scenario.title;
				return option;
			}),
		);
	}

	private async runSelectedScenario(): Promise<void> {
		this.runButton.disabled = true;
		this.status.textContent = "running";
		this.status.dataset.status = "running";
		try {
			await this.controller.run(this.scenarioSelect.value);
		} finally {
			this.runButton.disabled = false;
			this.render();
		}
	}

	private render(): void {
		const state = this.controller.getState();
		const results = this.controller.getResults();
		const latest = results.at(-1);

		this.status.textContent = state.status;
		this.status.dataset.status = latest?.status ?? state.status;
		this.confirmation.hidden = state.status !== "awaiting-confirmation";
		this.confirmationPrompt.textContent = state.confirmationPrompt ?? "";
		this.exportButton.disabled = results.length === 0;

		if (!latest) {
			this.result.dataset.status = state.status;
			this.result.textContent =
				state.status === "awaiting-confirmation"
					? "Scenario execution is waiting for a physical confirmation."
					: "Run a scenario to collect evidence.";
			return;
		}

		this.result.dataset.status = latest.status;
		const failedAssertions = latest.assertions.filter((assertion) => !assertion.passed);
		const blockedReason = latest.observations.find(
			(observation) => observation.key === "prerequisite.reason",
		)?.value;
		const detail =
			typeof blockedReason === "string"
				? blockedReason
				: failedAssertions[0]?.message ?? `${latest.assertions.length} assertion(s) recorded.`;
		this.result.textContent = `${latest.scenarioId}: ${latest.status}. ${detail}`;
	}

	private exportEvidence(): void {
		const document = this.controller.getEvidenceDocument(new Date().toISOString());
		const blob = new Blob([exportEvidenceJson(document)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = window.document.createElement("a");
		anchor.href = url;
		anchor.download = `webcam-ts-conformance-${document.gitSha}.json`;
		anchor.hidden = true;
		window.document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}
}
