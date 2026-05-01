import type { CompetitionSnapshot } from "@/lib/db";
import type { QualifierAttempt } from "@/lib/scoring";

export type DemoRole = "judge" | "competitor" | "organizer";

export type DemoSimulationMode =
  | "single_score"
  | "live_burst"
  | "drama_tick"
  | "drama_reset";

export type DemoSyncStatus = "synced" | "saving" | "pending" | "syncing" | "failed";
export type DemoPlaybackStep = "save" | "leaderboard" | "offline" | "sync" | "complete";

export type DemoToolkitState = {
  simulateOffline: boolean;
  pendingQueueCount: number;
  simulationRunning: boolean;
  scriptRunning: boolean;
  lastSyncStatus: DemoSyncStatus;
};

export type JudgeQualifierSaveInput = {
  climberId: string;
  climbNumber: number;
  attemptCount: number;
  topped: boolean;
  zone: boolean;
  attemptsToTop: number | null;
  attemptsToZone: number | null;
};

export type CompetitionSnapshotUpdater = (snapshot: CompetitionSnapshot) => CompetitionSnapshot;

export type DramaContext = {
  athleteName: string;
  climberBName: string;
  climbLabel: string;
  beforeRank: number | null;
  afterRank: number | null;
  tiebreakExplanation: string;
  isRankSwap: boolean;
};

export type DemoSimulationResponse = {
  mode: DemoSimulationMode;
  attempt?: QualifierAttempt;
  climberId?: string;
  climbNumber?: number;
  dramaContext?: DramaContext | null;
  alreadyFired?: boolean;
  message?: string;
  ok?: boolean;
};

export type DemoScenarioAthlete = {
  id: string;
  name: string;
  climberNumber: string;
  categoryLabel: string;
};

export type LeaderboardImpact = {
  climberId: string;
  beforeRank: number | null;
  afterRank: number | null;
  delta: number;
  reason?: string | null;
};

export type LeaderboardToast = {
  id: string;
  climberId: string;
  climberName: string;
  climbLabel: string;
  resultLabel: string;
  detail?: string | null;
};

export type DemoQueuedScorePreview = {
  id: string;
  climberName: string;
  climbLabel: string;
  resultLabel: string;
  queuedAtLabel: string;
  retryCount: number;
};
