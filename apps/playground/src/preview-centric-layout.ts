import { byId } from "./dom.js";

export function applyPreviewCentricLayout(): void {
	const previewShell = byId<HTMLElement>("preview-shell");
	const statusBadge = byId<HTMLElement>("status-badge");
	const actionPanel = document.querySelector<HTMLElement>(".camera-action-panel");
	const mirrorToggle = byId<HTMLInputElement>("mirror-toggle");
	const facingSelect = byId<HTMLSelectElement>("facing-select");

	if (!actionPanel) throw new Error("Camera session controls are unavailable.");
	const mirrorControl = mirrorToggle.closest<HTMLElement>("label");
	if (!mirrorControl) throw new Error("Mirror preview control is unavailable.");
	const facingField = facingSelect.closest<HTMLElement>("label");
	if (!facingField) throw new Error("Facing mode field is unavailable.");

	statusBadge.classList.add("preview-status-overlay");
	actionPanel.classList.add("preview-lifecycle-overlay");
	mirrorControl.classList.add("preview-mirror-control");

	previewShell.append(statusBadge, mirrorControl, actionPanel);
	facingField.remove();
}
