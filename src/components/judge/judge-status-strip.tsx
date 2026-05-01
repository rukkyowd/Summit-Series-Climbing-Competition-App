import { SaveStatus } from "@/components/ui/save-status";
import { StatCard } from "@/components/ui/stat-card";

type JudgeStatusStripProps = {
  profileLabel: string;
  saving: boolean;
  queuedCount: number;
  syncStatusLabel: string;
  syncHelperCopy: string;
  qualifierScoringOpen: boolean;
  finalsScoringOpen: boolean;
  liveRoundName: string;
  liveRoundModeLabel: string;
  climberCount: number;
  qualifierProblemCount: number;
};

export function JudgeStatusStrip({
  profileLabel,
  saving,
  queuedCount,
  syncStatusLabel,
  syncHelperCopy,
  qualifierScoringOpen,
  finalsScoringOpen,
  liveRoundName,
  liveRoundModeLabel,
  climberCount,
  qualifierProblemCount,
}: JudgeStatusStripProps) {
  const saveState = saving ? "saving" : queuedCount > 0 ? "queued" : "saved";

  return (
    <div className="space-y-3">
      <div className="results-workspace-callout" data-demo-anchor="judge-status">
        <div className="results-kicker">Desk status</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="results-chip">{profileLabel}</div>
          <SaveStatus state={saveState} detail={syncStatusLabel} />
          <div className={qualifierScoringOpen ? "results-chip results-chip-live" : "results-chip"}>
            {qualifierScoringOpen ? "Qualifier scoring open" : "Qualifier scoring closed"}
          </div>
          <div className={finalsScoringOpen ? "results-chip results-chip-live" : "results-chip"}>
            {finalsScoringOpen ? "Finals scoring open" : "Finals scoring closed"}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live round" value={liveRoundName} helper={liveRoundModeLabel} tone="live" />
        <StatCard
          label="Field"
          value={`${climberCount} ${climberCount === 1 ? "climber" : "climbers"}`}
          helper={`${qualifierProblemCount} qualifier ${qualifierProblemCount === 1 ? "boulder" : "boulders"}`}
        />
        <StatCard label="Sync state" value={syncStatusLabel} helper={syncHelperCopy} tone={queuedCount > 0 ? "warning" : "success"} />
        <StatCard
          label="Queue"
          value={queuedCount > 0 ? `${queuedCount} waiting` : "Clear"}
          helper={queuedCount > 0 ? "Device-saved scores will retry automatically." : "No pending judge saves on this device."}
          tone={queuedCount > 0 ? "warning" : "success"}
        />
      </div>
    </div>
  );
}
