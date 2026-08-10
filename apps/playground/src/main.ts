import "./styles.css";
import "./conformance/conformance.css";
import { Camera } from "webcam-ts";
import { CameraDeviceManager, CameraPermissionService } from "webcam-ts/devices";
import { VideoPreview } from "webcam-ts/preview";
import { createBrowserCameraController } from "./camera-controller.js";
import { BrowserConformanceExecutor } from "./conformance/browser-conformance-executor.js";
import { ConformanceController } from "./conformance/conformance-controller.js";
import { collectConformanceEnvironment } from "./conformance/environment.js";
import { ConformanceRenderer } from "./conformance/conformance-renderer.js";
import { byId } from "./dom.js";
import { UiRenderer } from "./ui-renderer.js";

const PACKAGE_VERSION = "4.0.0-alpha.1";
const GIT_SHA = import.meta.env.VITE_GIT_SHA ?? "local";
const searchParams = new URLSearchParams(window.location.search);
const conformanceMode = searchParams.get("conformance") === "1";

function registerPageDisposal(dispose: () => void | Promise<void>): void {
	let disposed = false;
	const disposeOnce = (): void => {
		if (disposed) return;
		disposed = true;
		void dispose();
	};
	window.addEventListener("pagehide", disposeOnce, { once: true });
	window.addEventListener("beforeunload", disposeOnce, { once: true });
}

export function bootstrapPlayground(): void {
	const normalRoot = byId<HTMLElement>("normal-playground-root");
	const conformanceRoot = byId<HTMLElement>("conformance-root");
	normalRoot.hidden = false;
	conformanceRoot.hidden = true;

	const video = byId<HTMLVideoElement>("camera-preview");
	const controller = createBrowserCameraController(video);
	const renderer = new UiRenderer(controller);

	registerPageDisposal(async () => {
		renderer.dispose();
		await controller.dispose();
	});

	void controller.initialize().catch(() => undefined);
}

export function bootstrapConformance(): void {
	const normalRoot = byId<HTMLElement>("normal-playground-root");
	const conformanceRoot = byId<HTMLElement>("conformance-root");
	normalRoot.hidden = true;
	conformanceRoot.hidden = false;

	const video = byId<HTMLVideoElement>("conformance-preview");
	const camera = new Camera();
	const preview = new VideoPreview(video, {
		autoplay: true,
		muted: true,
		playsInline: true,
		mirror: false,
	});
	preview.bind(camera);

	const executor = new BrowserConformanceExecutor({
		camera,
		preview,
		devices: new CameraDeviceManager(),
		permissions: new CameraPermissionService(),
	});
	const controller = new ConformanceController({
		executor,
		environmentFactory: (hardwareClass) =>
			collectConformanceEnvironment({
				navigatorLike: globalThis.navigator,
				secureContext: globalThis.isSecureContext ?? false,
				packageVersion: PACKAGE_VERSION,
				gitSha: GIT_SHA,
				hardwareClass,
			}),
		prerequisiteChecker: (definition) => executor.checkPrerequisite(definition),
		packageVersion: PACKAGE_VERSION,
		gitSha: GIT_SHA,
	});
	const renderer = new ConformanceRenderer(controller, executor, conformanceRoot);
	renderer.bind();

	registerPageDisposal(() => controller.dispose());
}

if (conformanceMode) bootstrapConformance();
else bootstrapPlayground();
