import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
	base: process.env.GITHUB_ACTIONS === "true" ? "/webcam-ts/" : "/",
	plugins: process.env.PLAYGROUND_HTTPS ? [basicSsl()] : [],
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
