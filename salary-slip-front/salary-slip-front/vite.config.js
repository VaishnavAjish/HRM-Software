/* global process */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "child_process";
import path from "path";

// On Windows, import.meta.url and process.cwd() can resolve to different
// drive letters when the project lives on a mapped network share (e.g. both
// F:\ and Z:\ point to the same UNC path). Vite computes the HTML fileName
// as path.relative(config.root, htmlId). If root and htmlId are on different
// drive letters, path.relative() returns an absolute path and Rollup rejects
// it with "fileName must not be absolute". Fix: always anchor root to
// process.cwd() so both root and the HTML id use the same drive letter.
const projectRoot = process.cwd();

let gitBranch = "master";
try {
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf8",
  }).trim();
} catch {
  // Use default if git fails
}

// "nidhi-impex" | "silver-star" | "all"
const COMPANY_MODE = ["nidhi-impex", "silver-star"].includes(gitBranch)
  ? gitBranch
  : "all";

const APP_TITLE =
  gitBranch === "nidhi-impex"
    ? "Nidhi Impex – HRMS"
    : gitBranch === "silver-star"
      ? "Silver Star – HRMS"
      : "NISS HRMS";

const APP_LABEL =
  gitBranch === "nidhi-impex"
    ? "Nidhi Impex"
    : gitBranch === "silver-star"
      ? "Silver Star"
      : "NISS HRMS";

// amber = Nidhi Impex | sky = Silver Star | indigo = NISS HRMS
const APP_COLOR =
  gitBranch === "nidhi-impex"
    ? "amber"
    : gitBranch === "silver-star"
      ? "sky"
      : "indigo";

export default defineConfig(({ mode }) => {
  // Pass projectRoot (not process.cwd()) so loadEnv uses the same base.
  const env = loadEnv(mode, projectRoot, "VITE_");

  const PROD_API_URL =
    gitBranch === "nidhi-impex"
      ? env.VITE_PROD_URL_NIDHI_IMPEX
      : gitBranch === "silver-star"
        ? env.VITE_PROD_URL_SILVER_STAR
        : env.VITE_PROD_URL_MASTER;

  return {
    root: projectRoot,
    define: {
      __COMPANY_MODE__: JSON.stringify(COMPANY_MODE),
      __PROD_API_URL__: JSON.stringify(PROD_API_URL || ""),
      __APP_LABEL__: JSON.stringify(APP_LABEL),
      __APP_COLOR__: JSON.stringify(APP_COLOR),
    },
    plugins: [
      react(),
      // ── Windows mapped-drive path normaliser ─────────────────────────────
      // When F:\ and Z:\ both point to the same network share, Vite's internal
      // module resolution can resolve index.html through the Z: drive even
      // though process.cwd() (and therefore config.root) is on F:. Vite then
      // computes:  path.relative(F:\root, Z:\...\index.html) → absolute Z:\...
      // which Rollup 4 rejects as a fileName. This plugin intercepts any HTML
      // module id that arrives on a different drive letter and rewrites it to
      // use projectRoot's drive so the id and root are always consistent.
      {
        name: "normalize-html-drive-letter",
        enforce: "pre",
        resolveId(source) {
          if (!path.isAbsolute(source)) return null;
          if (!source.match(/\.html$/i)) return null;
          const rootDrive = projectRoot.match(/^([A-Za-z]:)/)?.[1];
          const srcDrive  = source.match(/^([A-Za-z]:)/)?.[1];
          if (rootDrive && srcDrive && rootDrive.toLowerCase() !== srcDrive.toLowerCase()) {
            // Replace the drive letter prefix; keep the rest of the path identical.
            const normalized = rootDrive + source.slice(2);
            return { id: normalized };
          }
          return null;
        },
      },
      // ─────────────────────────────────────────────────────────────────────
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
        injectRegister: "script-defer",

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
          // precache essential app shell assets
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}"],
          globIgnores: [
            "**/assets/ag-grid-*.js",
            "**/assets/exceljs*.js",
            "**/assets/jspdf*.js",
            "**/assets/html2canvas*.js",
            "**/assets/CartesianChart-*.js",
            "**/assets/AddEmployeePage-*.js",
            "**/assets/HiringProcess-*.js",
          ],
          // allow app shell bundles to be precached
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

        // The service worker only needs to exist in a real production build —
        // enabling it on the dev server means every fix has to fight Workbox's
        // own cache before a tester ever sees it (the classic "I fixed it but
        // it still shows the old behavior" symptom). Production builds are
        // untouched by this flag; it only governs `npm run dev`.
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      host: true,
      port: 5175,
      watch: {
        ignored: ["**/main/**", "**/master/**", "**/nidhi-impex/**", "**/silver-star/**"],
      },
    },
    optimizeDeps: {
      // Explicitly pre-bundled instead of left to lazy discovery. Vite
      // normally finds a dependency the first time some page imports it and
      // re-optimizes on the fly — but exceljs/jspdf are large, deeply nested
      // CJS packages pulled in transitively by utils/exportUtils.js, which a
      // growing number of pages import. Each newly-touched page that reached
      // exportUtils for the first time in a dev session was re-triggering
      // that lazy optimization mid-session, which raced with the page's own
      // dynamic import and surfaced as "504 Outdated Optimize Dep" /
      // "Failed to fetch dynamically imported module". Listing them here
      // means they're bundled once, upfront, on server start.
      include: ["react-is", "exceljs", "jspdf", "jspdf-autotable"],
    },
    build: {
      outDir: path.resolve(projectRoot, gitBranch),
      rollupOptions: {
        // Explicitly pin the HTML entry to the same drive letter as
        // process.cwd() (F:). Without this, Vite resolves index.html
        // through a different code path that returns the Z: mapped drive
        // letter, causing path.relative(F:\root, Z:\index.html) to return
        // an absolute path — which Rollup 4+ rejects as a fileName.
        input: path.resolve(projectRoot, "index.html"),
        output: {
          manualChunks: {
            "ag-grid": ["ag-grid-community", "ag-grid-react"],
            "exceljs": ["exceljs"],
            "jspdf": ["jspdf", "jspdf-autotable"],
            "html2canvas": ["html2canvas"],
            "recharts": ["recharts"],
          },
        },
      },
    },
  };
});
