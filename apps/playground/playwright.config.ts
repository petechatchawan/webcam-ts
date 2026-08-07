import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./browser-test",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},
	webServer: {
		command: "pnpm exec vite --host 127.0.0.1 --port 4173",
		url: "http://127.0.0.1:4173/browser-test/fixture.html",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		env: {
			...process.env,
			GITHUB_ACTIONS: "false",
		},
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],
});
