import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

export type AthletePickerStatusTone = "pending" | "dirty" | "zone" | "top" | "saved";

export type AthletePickerEntry = {
  id: string;
  climberNumber: string;
  name: string;
  category: string;
  statusLabel: string;
  resultLabel: string;
  statusTone: AthletePickerStatusTone;
};

type AthletePickerProps = {
  activeRoundName: string;
  athletes: AthletePickerEntry[];
  problemCount: number;
  query: string;
  savedCount: number;
  selectedAthleteId: string | null;
  selectedBoulder: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onSelectAthlete: (athleteId: string) => void;
  onSelectBoulder: (boulder: number) => void;
};

const statusStyles: Record<AthletePickerStatusTone, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-600",
  dirty: "border-amber-200 bg-amber-50 text-amber-700",
  zone: "border-amber-300 bg-amber-100 text-amber-900",
  top: "border-emerald-300 bg-emerald-100 text-emerald-900",
  saved: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function AthletePicker({
  activeRoundName,
  athletes,
  problemCount,
  query,
  savedCount,
  selectedAthleteId,
  selectedBoulder,
  totalCount,
  onQueryChange,
  onSelectAthlete,
  onSelectBoulder,
}: AthletePickerProps) {
  return (
    <Surface density="judge" variant="panel" className="space-y-4">
      <div>
        <div className="results-kicker">{activeRoundName} controls</div>
        <div className="mt-1 text-2xl font-bold text-slate-950">
          Boulder {String(selectedBoulder).padStart(2, "0")}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {savedCount} of {totalCount} climbers have an entry here.
        </div>
      </div>

      <label className="block">
        <span className="sr-only">Search athletes</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="results-input min-h-14 text-base"
          placeholder="Search number, name, category"
          inputMode="search"
        />
      </label>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Select boulder">
        {Array.from({ length: problemCount }, (_, index) => index + 1).map((climbNumber) => (
          <Button
            key={climbNumber}
            size="touch"
            variant={selectedBoulder === climbNumber ? "primary" : "secondary"}
            className="min-w-0 px-3 text-base"
            aria-pressed={selectedBoulder === climbNumber}
            onClick={() => onSelectBoulder(climbNumber)}
          >
            B{String(climbNumber).padStart(2, "0")}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="results-kicker">Athlete picker</div>
          <div className="text-xs font-semibold text-slate-500">{athletes.length} shown</div>
        </div>
        <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
          {athletes.map((athlete) => {
            const selected = athlete.id === selectedAthleteId;
            return (
              <button
                key={athlete.id}
                type="button"
                onClick={() => onSelectAthlete(athlete.id)}
                className={cn(
                  "w-full rounded-[1.2rem] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2",
                  selected
                    ? "border-sky-300 bg-sky-50 shadow-[0_12px_28px_rgba(14,116,215,0.12)]"
                    : "border-slate-200 bg-white/85 hover:border-slate-300 hover:bg-white"
                )}
                aria-pressed={selected}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      #{athlete.climberNumber}
                    </div>
                    <div className="mt-1 truncate text-lg font-bold text-slate-950">{athlete.name}</div>
                    <div className="mt-1 truncate text-sm text-slate-600">{athlete.category}</div>
                  </div>
                  <div className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold", statusStyles[athlete.statusTone])}>
                    {athlete.statusLabel}
                  </div>
                </div>
                <div className="mt-2 text-sm font-medium text-slate-600">{athlete.resultLabel}</div>
              </button>
            );
          })}
        </div>
        {!athletes.length ? (
          <EmptyState
            eyebrow="No match"
            title="No athletes match that search"
            description="Try a climber number, first name, last name, or category."
            className="bg-white/80"
          />
        ) : null}
      </div>
    </Surface>
  );
}
