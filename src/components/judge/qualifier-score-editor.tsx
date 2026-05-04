import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SaveStatus, type SaveStatusState } from "@/components/ui/save-status";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

type ConfirmationTone = "pending" | "confirmed" | "dirty";

type QualifierScoreEditorProps = {
  athlete: {
    climberNumber: string;
    name: string;
    category: string;
  } | null;
  attemptCount: number;
  blockedMessage: string;
  boulderNumber: number;
  confirmationLabel: string;
  confirmationTone: ConfirmationTone;
  dirty: boolean;
  liveDetail: string;
  liveLabel: string;
  normalizedPreview: string;
  roundName: string;
  savedSummary: string;
  saveState: SaveStatusState;
  saving: boolean;
  scoringOpen: boolean;
  topped: boolean;
  zone: boolean;
  onAddAttempt: () => void;
  onClear: () => void;
  onDecreaseAttempt: () => void;
  onSave: () => void;
  onToggleTop: () => void;
  onToggleZone: () => void;
};

const confirmationStyles: Record<ConfirmationTone, string> = {
  pending: "border-slate-200 bg-slate-50",
  confirmed: "border-emerald-200 bg-emerald-50",
  dirty: "border-amber-200 bg-amber-50",
};

export function QualifierScoreEditor({
  athlete,
  attemptCount,
  blockedMessage,
  boulderNumber,
  confirmationLabel,
  confirmationTone,
  dirty,
  liveDetail,
  liveLabel,
  normalizedPreview,
  roundName,
  savedSummary,
  saveState,
  saving,
  scoringOpen,
  topped,
  zone,
  onAddAttempt,
  onClear,
  onDecreaseAttempt,
  onSave,
  onToggleTop,
  onToggleZone,
}: QualifierScoreEditorProps) {
  if (!athlete) {
    return (
      <EmptyState
        eyebrow="Choose athlete"
        title="Pick an athlete to score"
        description="Search or tap a climber from the picker. Their boulder card will stay focused here."
      />
    );
  }

  return (
    <Surface density="judge" variant="card" className="space-y-5" data-demo-anchor="judge-entry-cards">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="results-kicker">{roundName} live card</div>
          <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950">
            #{athlete.climberNumber} {athlete.name}
          </h2>
          <p className="mt-1 text-base font-medium text-slate-600">{athlete.category}</p>
        </div>
        <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Problem</div>
          <div className="mt-1 text-3xl font-black text-sky-950">B{String(boulderNumber).padStart(2, "0")}</div>
        </div>
      </div>

      <div className={cn("rounded-[1.35rem] border px-4 py-4", confirmationStyles[confirmationTone])}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="results-kicker">Cell status</div>
            <div className="mt-2 text-xl font-bold text-slate-950">{confirmationLabel}</div>
          </div>
          <SaveStatus state={saveState} detail={dirty ? "Unsaved changes" : null} />
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {dirty ? normalizedPreview : `Last saved: ${savedSummary}.`}
        </p>
      </div>

      {!scoringOpen ? (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {blockedMessage}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Surface variant="meta" density="judge" className="space-y-3">
          <div className="results-kicker">Attempts</div>
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
            <Button
              size="touch"
              variant="secondary"
              onClick={onDecreaseAttempt}
              aria-label={`Decrease attempts for ${athlete.name}`}
            >
              -
            </Button>
            <div
              data-demo-anchor="judge-attempt-counter"
              className="inline-flex min-h-14 items-center justify-center rounded-[1rem] border border-slate-200 bg-white px-4 text-4xl font-black text-slate-950"
            >
              {attemptCount}
            </div>
          </div>
          <Button size="touch" variant="primary" fullWidth onClick={onAddAttempt}>
            + Attempt
          </Button>
        </Surface>

        <Surface variant="meta" density="judge" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="results-kicker">Normalized result</div>
              <div className="mt-2 text-2xl font-black text-slate-950">{liveLabel}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", zone ? "border-amber-300 bg-amber-100 text-amber-950" : "border-slate-200 bg-white text-slate-500")}>
                Zone {zone ? "ON" : "OFF"}
              </span>
              <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", topped ? "border-emerald-300 bg-emerald-100 text-emerald-950" : "border-slate-200 bg-white text-slate-500")}>
                Top {topped ? "ON" : "OFF"}
              </span>
            </div>
          </div>
          <p className="text-sm leading-6 text-slate-600">{liveDetail}</p>
          <p className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            {normalizedPreview}
          </p>
        </Surface>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          size="touch"
          variant="secondary"
          fullWidth
          onClick={onToggleZone}
          aria-pressed={zone && !topped}
          className={cn(
            "min-h-24 flex-col items-start rounded-[1.35rem] border-amber-200 bg-amber-50 text-left text-amber-900 hover:border-amber-300",
            zone && !topped && "border-amber-400 bg-amber-100 shadow-[0_16px_30px_rgba(245,158,11,0.18)]"
          )}
        >
          <span className="text-2xl font-black">Zone</span>
          <span className="mt-1 text-sm">{zone && !topped ? "Control marked" : "Mark control only"}</span>
        </Button>
        <Button
          size="touch"
          variant="secondary"
          fullWidth
          onClick={onToggleTop}
          aria-pressed={topped}
          data-demo-anchor="judge-top-button"
          className={cn(
            "min-h-24 flex-col items-start rounded-[1.35rem] border-emerald-200 bg-emerald-50 text-left text-emerald-900 hover:border-emerald-300",
            topped && "border-emerald-400 bg-emerald-100 shadow-[0_16px_30px_rgba(34,197,94,0.18)]"
          )}
        >
          <span className="text-2xl font-black">Top</span>
          <span className="mt-1 text-sm">{topped ? "Finish marked; zone implied" : "Mark finish + zone"}</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Button size="touch" variant="danger" fullWidth onClick={onClear}>
          Clear
        </Button>
        <Button
          size="touch"
          variant="primary"
          fullWidth
          onClick={onSave}
          disabled={saving || !scoringOpen}
          data-demo-anchor="judge-save-score"
        >
          {saving ? "Saving..." : dirty ? "Save official score" : "Save again"}
        </Button>
      </div>
    </Surface>
  );
}
