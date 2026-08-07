import { expect, test } from "@playwright/test";

test("VideoPreview follows committed stream changes without owning tracks", async ({ page }) => {
	await page.goto("/browser-test/fixture.html");
	await expect(page.locator("#fixture-status")).toHaveValue("ready");

	const result = await page.evaluate(() => window.webcamTsBrowserFixture?.runPreviewConformance());
	expect(result).toEqual({
		boundDuringActive: true,
		clearedAfterStop: true,
		autoplay: true,
		muted: true,
		playsInline: true,
		mirrorTransform: "scaleX(-1)",
		trackStopCallsAfterPreviewDispose: 0,
	});
});
