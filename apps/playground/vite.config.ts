import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/webcam-ts/" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
