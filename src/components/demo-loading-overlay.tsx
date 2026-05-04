"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEMO_LOADING_DELAY_MS,
  getDemoLoadingCopyForHref,
  type DemoLoadingCopy,
} from "@/lib/demo-loading";

export function DemoLoadingOverlay({
  active,
  title,
  text,
  complete = false,
}: {
  active: boolean;
  title: string;
  text: string;
  complete?: boolean;
}) {
  if (!active) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[2px]">
      <div
        role="status"
        aria-live="polite"
        className="w-[min(22.5rem,calc(100vw-2rem))] rounded-[1.5rem] border border-white/60 bg-white/70 px-6 py-7 text-center text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-xl"
      >
        <div className="mx-auto flex h-1.5 w-16 overflow-hidden rounded-full bg-white/75 shadow-inner">
          <div
            className={`h-full rounded-full bg-sky-700 transition-all duration-500 ${
              complete ? "w-full" : "w-1/2 animate-pulse"
            }`}
          />
        </div>
        <div className="results-kicker mt-6 text-slate-500">Guided handoff</div>
        <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-4 text-sm font-medium leading-6 text-slate-600">{text}</p>
      </div>
    </div>
  );
}

export function useDemoNavigation() {
  const router = useRouter();
  const [loadingCopy, setLoadingCopy] = useState<DemoLoadingCopy | null>(null);

  const navigateWithDemoLoading = useCallback(
    async (
      href: string,
      options: {
        title?: string;
        text?: string;
        delayMs?: number;
      } = {}
    ) => {
      const fallbackCopy = getDemoLoadingCopyForHref(href);
      setLoadingCopy({
        title: options.title ?? fallbackCopy.title,
        text: options.text ?? fallbackCopy.text,
      });
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      await new Promise((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 120 : options.delayMs ?? DEMO_LOADING_DELAY_MS)
      );
      router.push(href);
    },
    [router]
  );

  const clearDemoLoading = useCallback(() => {
    setLoadingCopy(null);
  }, []);

  return {
    loadingCopy,
    navigateWithDemoLoading,
    clearDemoLoading,
  };
}
