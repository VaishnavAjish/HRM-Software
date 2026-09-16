import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
