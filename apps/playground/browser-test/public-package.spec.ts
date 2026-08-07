import { expect, test } from "@playwright/test";

import { Camera } from "webcam-ts";
import { VideoPreview } from "webcam-ts/preview";
import { CameraCapture } from "webcam-ts/capture";
import { CameraDeviceManager } from "webcam-ts/devices";
import { CameraControls } from "webcam-ts/controls";
import { FakeMediaDevicesPort } from "webcam-ts/testing";

const EXPECTED_ENTRYPOINTS = [
	"webcam-ts",
	"webcam-ts/preview",
	"webcam-ts/capture",
	"webcam-ts/devices",
	"webcam-ts/controls",
	"webcam-ts/testing",
];

test("declared public package entrypoints load in the browser engine", async ({ page }) => {
	await page.goto("/browser-test/fixture.html");
	await expect(page.locator("#fixture-status")).toHaveText("ready");

	const fixture = await page.evaluate(() => window.webcamTsBrowserFixture);
	expect(fixture?.loadedEntrypoints).toEqual(EXPECTED_ENTRYPOINTS);
	expect(fixture?.constructors).toMatchObject({
		Camera: "Camera",
		VideoPreview: "VideoPreview",
		CameraCapture: "CameraCapture",
		CameraDeviceManager: "CameraDeviceManager",
		CameraControls: "CameraControls",
	});

	expect(Camera.name).toBe("Camera");
	expect(VideoPreview.name).toBe("VideoPreview");
	expect(CameraCapture.name).toBe("CameraCapture");
	expect(CameraDeviceManager.name).toBe("CameraDeviceManager");
	expect(CameraControls.name).toBe("CameraControls");
	expect(FakeMediaDevicesPort.name).toBe("FakeMediaDevicesPort");
});

test("public Camera lifecycle executes deterministically inside the browser", async ({ page }) => {
	await page.goto("/browser-test/fixture.html");
	await expect(page.locator("#fixture-status")).toHaveText("ready");

	const result = await page.evaluate(() => window.webcamTsBrowserFixture?.runCameraSmoke());
	expect(result).toBeDefined();
	expect(result?.started).toBe("active");
	expect(result?.stopped).toBe("idle");
	expect(result?.events).toContain("operation-started");
	expect(result?.events).toContain("operation-completed");
	expect(result?.events).toContain("stream-changed");
});
