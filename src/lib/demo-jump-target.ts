const TARGET_PULSE_CLASS = "demo-wizard-target-pulse";

export function escapeDemoAnchorValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function getDemoAnchorSelector(anchor: string) {
  return `[data-demo-anchor="${escapeDemoAnchorValue(anchor)}"]`;
}

function focusTarget(target: HTMLElement) {
  const focusable = target.matches(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const hadTabIndex = target.hasAttribute("tabindex");
  const previousTabIndex = target.getAttribute("tabindex");

  if (!focusable) {
    target.setAttribute("tabindex", "-1");
  }

  target.focus({ preventScroll: true });

  if (!focusable && !hadTabIndex) {
    window.setTimeout(() => target.removeAttribute("tabindex"), 2400);
  } else if (!focusable && previousTabIndex !== null) {
    window.setTimeout(() => target.setAttribute("tabindex", previousTabIndex), 2400);
  }
}

export function jumpToDemoAnchor(anchor: string) {
  if (typeof document === "undefined") {
    return false;
  }

  const target =
    (document.querySelector(getDemoAnchorSelector(anchor)) as HTMLElement | null) ??
    document.getElementById(anchor);

  if (!target) {
    return false;
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
  focusTarget(target);
  target.classList.remove(TARGET_PULSE_CLASS);
  window.requestAnimationFrame(() => {
    target.classList.add(TARGET_PULSE_CLASS);
    window.setTimeout(() => target.classList.remove(TARGET_PULSE_CLASS), reducedMotion ? 900 : 2200);
  });

  return true;
}
