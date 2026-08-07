import { expect, test } from "@playwright/test";

async function openFixture(page: Parameters<typeof test>[0] extends never ? never : any) {
	await page.goto("/browser-test/fixture.html");
	await expect(page.locator("#fixture-status")).toHaveValue("ready");
}

test("start and stop preserve deterministic public state and event ordering", async ({ page }) => {
	await openFixture(page);
	const result = await page.evaluate(() => window.webcamTsBrowserFixture?.runLifecycleConformance());

	expect(result?.states).toEqual(["starting", "active", "stopping", "idle"]);
	expect(result?.operations).toEqual([
		"operation-started:start",
		"operation-completed:start",
		"operation-started:stop",
		"operation-completed:stop",
	]);
	expect(result?.trackStopCalls).toBe(1);
});

test("failed switch preserves the active stream in every automated engine", async ({ page }) => {
	await openFixture(page);
	const result = await page.evaluate(() => window.webcamTsBrowserFixture?.runFailedSwitchConformance());

	expect(result?.errorCode).toBe("DEVICE_BUSY");
	expect(result?.status).toBe("active");
	expect(result?.sameActiveStream).toBe(true);
	expect(result?.originalTrackStopCalls).toBe(0);
});
