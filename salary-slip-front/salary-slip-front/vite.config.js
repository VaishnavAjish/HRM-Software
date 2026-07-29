import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "child_process";

let gitBranch = "master";
try {
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf8",
  }).trim();
} catch {}

// "nidhi-impex" | "silver-star" | "all"
const COMPANY_MODE = ["nidhi-impex", "silver-star"].includes(gitBranch)
  ? gitBranch
  : "all";

const APP_TITLE =
  gitBranch === "nidhi-impex"
    ? "Nidhi Impex – HRMS"
    : gitBranch === "silver-star"
      ? "Silver Star – HRMS"
      : "Build better workplaces – HRMS";

const APP_LABEL =
  gitBranch === "nidhi-impex"
    ? "Nidhi Impex"
    : gitBranch === "silver-star"
      ? "Silver Star"
      : "Build better workplaces";

// amber = Nidhi Impex | sky = Silver Star | indigo = Build better workplaces
const APP_COLOR =
  gitBranch === "nidhi-impex"
    ? "amber"
    : gitBranch === "silver-star"
      ? "sky"
      : "indigo";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  const PROD_API_URL =
    gitBranch === "nidhi-impex"
      ? env.VITE_PROD_URL_NIDHI_IMPEX
      : gitBranch === "silver-star"
        ? env.VITE_PROD_URL_SILVER_STAR
        : env.VITE_PROD_URL_MASTER;

  return {
    define: {
      __COMPANY_MODE__: JSON.stringify(COMPANY_MODE),
      __PROD_API_URL__: JSON.stringify(PROD_API_URL || ""),
      __APP_LABEL__: JSON.stringify(APP_LABEL),
      __APP_COLOR__: JSON.stringify(APP_COLOR),
    },
    plugins: [
      react(),
      {
        name: "html-title",
        transformIndexHtml(html) {
          return html.replace(
            /<title>.*?<\/title>/,
            `<title>${APP_TITLE}</title>`,
          );
        },
      },
      VitePWA({
        registerType: "autoUpdate",

        // assets to include in the precache manifest
        includeAssets: ["favicon.svg", "pwa-192.svg", "pwa-512.svg"],

        // Web App Manifest
        manifest: {
          name: APP_TITLE,
          short_name: "HRMS",
          description:
            "Employee Payroll & HR Management System by Nidhi Impex",
          theme_color: "#1d4ed8",
          background_color: "#f8fafc",
          display: "standalone",
          scope: "/",
          start_url: "/",
          orientation: "portrait-primary",
          lang: "en",
          categories: ["business", "finance", "productivity"],
          icons: [
            {
              src: "pwa-192.svg",
              sizes: "192x192",
              type: "image/svg+xml",
            },
            {
              src: "pwa-512.svg",
              sizes: "512x512",
              type: "image/svg+xml",
            },
            {
              src: "pwa-512.svg",
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },

        // Workbox service-worker config
        workbox: {
          // precache all built assets
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}"],
          // allow larger bundles (main chunk) to be precached
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // serve index.html for all navigation requests (SPA routing)
          navigateFallback: "index.html",
          // remove caches from previous SW versions on activation
          cleanupOutdatedCaches: true,
          // runtime cache for any remaining network requests
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },

        devOptions: {
          enabled: true,
          type: "module",
        },
      }),
    ],
    server: {
      host: true,
      port: 5175,
    },
    optimizeDeps: {
      include: ["react-is"],
    },
    build: {
      outDir: gitBranch,
      rollupOptions: {
        output: {
          manualChunks: {
            "ag-grid": ["ag-grid-community", "ag-grid-react"],
          },
        },
      },
    },
  };
});
