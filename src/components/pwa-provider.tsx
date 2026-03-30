"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISSED_KEY = "summit-series-install-dismissed";

export default function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "true");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setDismissed(false);
      window.localStorage.removeItem(INSTALL_DISMISSED_KEY);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismissBanner = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    }
    setDismissed(true);
  };

  const installApp = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const outcome = await deferredPrompt.userChoice;
    if (outcome.outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || installed || dismissed) {
    return null;
  }

  return (
    <div className="install-banner">
      <div className="install-banner__content">
        <div className="flex-1">
          <div className="meta-label text-fbc-yellow">Install Summit Series</div>
          <p className="mt-2 text-sm text-slate-200">
            Add the app to your home screen so FBC judges can launch it like a gym tool, even in
            spotty reception.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={dismissBanner} className="nav-pill">
            Not now
          </button>
          <button onClick={() => void installApp()} className="btn-primary justify-center">
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
