import "./styles.css";
import { byId } from "./dom.js";
import { createBrowserCameraController } from "./camera-controller.js";
import { UiRenderer } from "./ui-renderer.js";

const video = byId<HTMLVideoElement>("camera-preview");
const controller = createBrowserCameraController(video);
const renderer = new UiRenderer(controller);

let disposed = false;
async function dispose(): Promise<void> {
  if (disposed) return;
  disposed = true;
  renderer.dispose();
  await controller.dispose();
}

window.addEventListener("pagehide", () => void dispose(), { once: true });
window.addEventListener("beforeunload", () => void dispose(), { once: true });

void controller.initialize().catch(() => undefined);
