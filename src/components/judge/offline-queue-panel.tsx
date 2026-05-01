type QueuedScorePreview = {
  id: string;
  climberName: string;
  climbLabel: string;
  resultLabel: string;
  queuedAtLabel: string;
  retryCount: number;
};

type OfflineQueuePanelProps = {
  queuedCount: number;
  queuedItems: QueuedScorePreview[];
};

export function OfflineQueuePanel({ queuedCount, queuedItems }: OfflineQueuePanelProps) {
  if (queuedCount <= 0) {
    return null;
  }

  return (
    <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-800">
            {queuedCount} {queuedCount === 1 ? "score is" : "scores are"} saved on this device
          </div>
          <div className="mt-1 text-sm text-amber-700">
            They will retry automatically as soon as saving is available again.
          </div>
        </div>
        <div className="rounded-full border border-amber-300 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
          Offline proof
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {queuedItems.slice(0, 4).map((item) => (
          <div key={item.id} className="rounded-[1rem] border border-amber-200 bg-white/80 px-3 py-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-slate-950">{item.climberName}</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.queuedAtLabel}</div>
            </div>
            <div className="mt-1">
              {item.climbLabel} | {item.resultLabel}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {item.retryCount > 0 ? `Retry attempts: ${item.retryCount}` : "Waiting for the next publish attempt."}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
