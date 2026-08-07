import { expect, test } from "@playwright/test";

test("CameraCapture returns deterministic blob metadata without taking stream ownership", async ({ page }) => {
	await page.goto("/browser-test/fixture.html");
	await expect(page.locator("#fixture-status")).toHaveText("ready");

	const result = await page.evaluate(() => window.webcamTsBrowserFixture?.runCaptureConformance());
	expect(result).toEqual({
		type: "image/png",
		width: 640,
		height: 480,
		blobSizeGreaterThanZero: true,
		backendDisposeCalls: 1,
		trackStopCallsBeforeCameraStop: 0,
	});
});
