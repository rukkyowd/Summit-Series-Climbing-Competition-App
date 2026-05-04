export type DemoLoadingCopy = {
  title: string;
  text: string;
};

export const DEMO_LOADING_DELAY_MS = 520;

function getPathname(href: string) {
  try {
    return new URL(href, "http://summit.local").pathname;
  } catch {
    return href.split("?")[0] || href;
  }
}

export function getDemoLoadingCopyForHref(href: string): DemoLoadingCopy {
  const path = getPathname(href);

  if (path === "/demo") {
    return {
      title: "Opening demo home...",
      text: "Taking you back to the walkthrough start.",
    };
  }

  if (path === "/staff/new") {
    return href.includes("demo=act1")
      ? {
          title: "Opening event setup...",
          text: "Bringing the organizer setup into view.",
        }
      : {
          title: "Opening real event setup...",
          text: "Leaving the demo and opening the normal event form.",
        };
  }

  if (path.includes("/judge")) {
    return {
      title: "Opening judge panel...",
      text: "Loading the scoring workspace for the next step.",
    };
  }

  if (path.startsWith("/staff/c/")) {
    return {
      title: "Opening organizer dashboard...",
      text: "Loading the event-day controls.",
    };
  }

  if (path.includes("/leaderboard")) {
    return {
      title: "Opening live leaderboard...",
      text: "Bringing the public standings into view.",
    };
  }

  if (path.startsWith("/c/")) {
    return {
      title: "Opening public results...",
      text: "Loading the spectator view.",
    };
  }

  return {
    title: "Opening next step...",
    text: "Bringing the next demo screen into view.",
  };
}
