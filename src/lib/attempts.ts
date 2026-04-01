function toWholeAttempts(value: number | null | undefined, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value ?? fallback));
}

function toPositiveAttempts(value: number | null | undefined, fallback = 1) {
  return Math.max(1, toWholeAttempts(value, fallback));
}

export function normalizeQualifierAttemptInput(input: {
  attemptCount: number;
  topped: boolean;
  zone?: boolean;
  attemptsToTop?: number | null;
  attemptsToZone?: number | null;
}) {
  const topped = Boolean(input.topped);
  const zone = Boolean(input.zone ?? topped);
  const attemptCount = topped || zone ? toPositiveAttempts(input.attemptCount, 1) : toWholeAttempts(input.attemptCount, 0);
  const attemptsToTop = topped ? toPositiveAttempts(input.attemptsToTop, attemptCount) : null;
  const attemptsToZone = zone ? toPositiveAttempts(input.attemptsToZone, attemptsToTop ?? attemptCount ?? 1) : null;

  return {
    attemptCount,
    topped,
    zone,
    attemptsToTop,
    attemptsToZone,
  };
}

export function normalizeFinalAttemptInput(input: {
  top: boolean;
  zone: boolean;
  attemptsToTop?: number | null;
  attemptsToZone?: number | null;
}) {
  const top = Boolean(input.top);
  const zone = Boolean(input.zone || top);
  const attemptsToTop = top ? toPositiveAttempts(input.attemptsToTop, 1) : null;
  const attemptsToZone = zone ? toPositiveAttempts(input.attemptsToZone, attemptsToTop ?? 1) : null;

  return {
    top,
    zone,
    attemptsToTop,
    attemptsToZone,
  };
}
