export type DemoSalesMode = "organizer" | "judge";

export type DemoSalesStoryStep =
  | "organizer-intro"
  | "organizer-categories"
  | "organizer-preset"
  | "organizer-schedule"
  | "organizer-stages"
  | "organizer-handoff"
  | "judge-save"
  | "judge-leaderboard"
  | "judge-offline"
  | "judge-sync"
  | "complete";

export type DemoSalesSession = {
  mode: DemoSalesMode;
  storyStep: DemoSalesStoryStep;
  narratorTitle: string;
  narratorBody: string;
  autoplay: boolean;
  organizerCompleted: boolean;
  audioEnabled: boolean;
};

const DEMO_SALES_SESSION_KEY = "demo_sales_session_v1";

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readDemoSalesSession() {
  if (!canUseSessionStorage()) {
    return null as DemoSalesSession | null;
  }

  try {
    const raw = window.sessionStorage.getItem(DEMO_SALES_SESSION_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as DemoSalesSession;
  } catch {
    return null;
  }
}

export function writeDemoSalesSession(session: DemoSalesSession) {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(DEMO_SALES_SESSION_KEY, JSON.stringify(session));
}

export function patchDemoSalesSession(patch: Partial<DemoSalesSession>) {
  const current = readDemoSalesSession();
  if (!current) {
    return;
  }

  writeDemoSalesSession({
    ...current,
    ...patch,
  });
}

export function clearDemoSalesSession() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(DEMO_SALES_SESSION_KEY);
}

export function createDemoSalesSession(
  partial: Partial<DemoSalesSession> & Pick<DemoSalesSession, "mode" | "storyStep" | "narratorTitle" | "narratorBody">
) {
  return {
    autoplay: true,
    organizerCompleted: false,
    audioEnabled: false,
    ...partial,
  } satisfies DemoSalesSession;
}
