export type StaffRole = "admin" | "judge";
export type StaffScoreWriteStatus = "accepted" | "projected" | "conflicted" | "ignored_as_stale";

export type StaffScoreRouteResponse<TAttempt = unknown> = {
  attempt: TAttempt | null;
  status: StaffScoreWriteStatus;
  conflictReason: string | null;
  clientEventId: string | null;
  scoredAt: string | null;
};

export function isStaffRole(role: unknown): role is StaffRole {
  return role === "admin" || role === "judge";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeStaffScoreRpcResult<TAttempt = unknown>(
  payload: unknown,
  fallback?: { clientEventId?: string | null; scoredAt?: string | null }
): StaffScoreRouteResponse<TAttempt> {
  const record = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null;

  if (!record || typeof record !== "object") {
    return {
      attempt: null,
      status: "accepted",
      conflictReason: null,
      clientEventId: fallback?.clientEventId ?? null,
      scoredAt: fallback?.scoredAt ?? null,
    };
  }

  const status = optionalString(record.status);
  const conflictReason = optionalString(record.conflict_reason) ?? optionalString(record.conflictReason);
  const clientEventId =
    optionalString(record.client_event_id) ??
    optionalString(record.clientEventId) ??
    fallback?.clientEventId ??
    null;
  const scoredAt = optionalString(record.scored_at) ?? optionalString(record.scoredAt) ?? fallback?.scoredAt ?? null;

  return {
    attempt: (record.attempt as TAttempt | null | undefined) ?? null,
    status:
      status === "projected" || status === "conflicted" || status === "ignored_as_stale"
        ? status
        : "accepted",
    conflictReason,
    clientEventId,
    scoredAt,
  };
}

export function getStaffScoreErrorStatus(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("only staff")) {
    return 403;
  }

  if (normalized.includes("not found") || normalized.includes("not recognized")) {
    return 404;
  }

  if (
    normalized.includes("not open") ||
    normalized.includes("no active") ||
    normalized.includes("only finalists") ||
    normalized.includes("different round") ||
    normalized.includes("assigned session")
  ) {
    return 409;
  }

  return 500;
}
