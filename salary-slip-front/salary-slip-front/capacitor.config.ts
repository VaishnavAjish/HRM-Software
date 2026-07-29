import type { CapacitorConfig } from '@capacitor/cli';
import { execSync } from 'child_process';

// vite.config.js sets `build.outDir` to the current git branch name, so the web
// build lands in ./main on branch `main`, ./silver-star on branch `silver-star`,
// and so on. webDir must follow the same rule — when it was hardcoded to
// "master" the build wrote to ./main while `cap sync` kept copying the stale
// ./master folder, so the website updated but the APK did not.
let webDir = 'master';
try {
  webDir = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch {
  // detached HEAD or git unavailable — fall back to the historical default
}

const config: CapacitorConfig = {
  appId: 'com.salaryms.app',
  appName: 'SalaryMS',
  webDir,
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
