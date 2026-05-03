export type RealtimeScorePayload = {
  new?: unknown;
  old?: unknown;
};

export function getChangedDemoClimberId(payload: RealtimeScorePayload) {
  const next = payload.new && typeof payload.new === "object" ? payload.new : null;
  const previous = payload.old && typeof payload.old === "object" ? payload.old : null;
  const nextId = next && "climber_id" in next ? next.climber_id : null;
  const previousId = previous && "climber_id" in previous ? previous.climber_id : null;

  return typeof nextId === "string" ? nextId : typeof previousId === "string" ? previousId : null;
}
