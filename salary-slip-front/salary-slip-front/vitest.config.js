import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Kept separate from vite.config.js: that file derives build.outDir from the
// current git branch and defines __APP_LABEL__ etc. for the app bundle, none of
// which should influence the test run.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    css: false,
  },
  define: {
    __COMPANY_MODE__: JSON.stringify("all"),
    __PROD_API_URL__: JSON.stringify(""),
    __APP_LABEL__: JSON.stringify("Test"),
    __APP_COLOR__: JSON.stringify("indigo"),
  },
});
