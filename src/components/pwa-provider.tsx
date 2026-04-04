"use client";

import Image from "next/image";
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
      <div className="install-banner__backdrop" onClick={dismissBanner} aria-hidden="true" />
      <div className="install-banner__content" role="dialog" aria-modal="true" aria-labelledby="install-banner-title">
        <div className="install-banner__lead">
          <div className="install-banner__badge" aria-hidden="true">
            <Image src="/brand-logo.png" alt="" width={72} height={72} className="install-banner__badge-image" />
          </div>
          <div className="flex-1">
            <div className="meta-label text-fbc-yellow">Install Summit Series</div>
            <h2 id="install-banner-title" className="install-banner__title">Launch it like a real gym tool</h2>
            <p className="install-banner__copy">
              Add Summit Series to your home screen for faster judge access, cleaner full-screen use,
              and better reliability in spotty reception.
            </p>
            <div className="install-banner__benefits">
              <span className="install-banner__benefit">Full screen</span>
              <span className="install-banner__benefit">Faster launch</span>
              <span className="install-banner__benefit">Better offline feel</span>
            </div>
          </div>
        </div>
        <div className="install-banner__actions">
          <button onClick={dismissBanner} className="btn-ghost install-banner__dismiss">
            Not now
          </button>
          <button onClick={() => void installApp()} className="btn-primary install-banner__install">
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
