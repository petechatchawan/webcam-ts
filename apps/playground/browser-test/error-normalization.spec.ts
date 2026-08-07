import { expect, test } from "@playwright/test";

test("browser DOMException names normalize through the public Camera boundary", async ({ page }) => {
	await page.goto("/browser-test/fixture.html");
	await expect(page.locator("#fixture-status")).toHaveText("ready");

	const result = await page.evaluate(() => window.webcamTsBrowserFixture?.runErrorNormalizationConformance());
	expect(result).toEqual({
		permissionDenied: {
			code: "PERMISSION_DENIED",
			operation: "start",
			browserErrorName: "NotAllowedError",
		},
		overconstrained: {
			code: "CONSTRAINT_UNSATISFIED",
			operation: "start",
			browserErrorName: "OverconstrainedError",
			constraint: "width",
		},
	});
});
