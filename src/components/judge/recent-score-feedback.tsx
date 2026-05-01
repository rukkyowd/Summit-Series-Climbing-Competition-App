import { SaveStatus, type SaveStatusState } from "@/components/ui/save-status";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

type RecentScoreFeedbackProps = {
  state: SaveStatusState;
  title: string;
  detail: string;
  contextLabel?: string;
};

const toneStyles: Record<SaveStatusState, string> = {
  idle: "border-slate-200 bg-white/85",
  dirty: "border-amber-200 bg-amber-50/90",
  saving: "border-sky-200 bg-sky-50/90",
  saved: "border-emerald-200 bg-emerald-50/90",
  queued: "border-amber-200 bg-amber-50/90",
  offline: "border-slate-300 bg-slate-100/90",
  replayed: "border-violet-200 bg-violet-50/90",
  conflict: "border-orange-200 bg-orange-50/90",
  error: "border-red-200 bg-red-50/90",
};

export function RecentScoreFeedback({
  state,
  title,
  detail,
  contextLabel,
}: RecentScoreFeedbackProps) {
  return (
    <Surface
      density="judge"
      variant="meta"
      className={cn("border-2", toneStyles[state])}
      role={state === "error" || state === "conflict" ? "alert" : "status"}
      aria-live={state === "error" || state === "conflict" ? "assertive" : "polite"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="results-kicker">{contextLabel ?? "Judge save state"}</div>
          <h2 className="mt-2 text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">{detail}</p>
        </div>
        <SaveStatus state={state} detail={state === "dirty" ? "Review before save" : null} />
      </div>
    </Surface>
  );
}
