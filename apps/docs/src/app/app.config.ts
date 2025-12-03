import { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { routes } from "./app.routes";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeuix/themes/aura";
import { definePreset } from "@primeuix/themes";

const CustomPreset = definePreset(Aura, {
	semantic: {
		primary: {
			50: "{blue.50}",
			100: "{blue.100}",
			200: "{blue.200}",
			300: "{blue.300}",
			400: "{blue.400}",
			500: "{blue.500}",
			600: "{blue.600}",
			700: "{blue.700}",
			800: "{blue.800}",
			900: "{blue.900}",
			950: "{blue.950}",
		},
	},
});

export const appConfig: ApplicationConfig = {
	providers: [
		provideRouter(routes),
		provideAnimationsAsync(),
		providePrimeNG({
			theme: {
				preset: CustomPreset,
			},
		}),
	],
};
