import { useState, useEffect } from "react";

const isDev = import.meta.env.DEV;

function detectIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as macOS but has touch
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
  );
}

export function useInstallPWA() {
  const [prompt, setPrompt] = useState(null);
  // Already-installed is knowable before the first paint, so read it as the
  // initial value rather than rendering "not installed" and correcting it from
  // an effect. The lazy form keeps the media query off every later render.
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const isIOS = detectIOS();

  useEffect(() => {
    // Nothing to listen for once it is installed.
    if (installed) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setPrompt(e);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [installed]);

  const install = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!prompt) {
      if (isDev) {
        alert(
          'Install prompt works on a real device.\n\nSteps:\n1. Run: npm run build\n2. Run: npx serve dist\n3. Open the URL on your Android phone in Chrome\n4. Tap "Install App" — it will install like a real app.',
        );
      }
      return;
    }
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setPrompt(null);
    }
  };

  const dismissIOSGuide = () => setShowIOSGuide(false);

  const canInstall = installed ? false : isDev ? true : isIOS ? true : !!prompt;

  return { canInstall, install, isIOS, showIOSGuide, dismissIOSGuide };
}
