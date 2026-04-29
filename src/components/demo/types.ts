import type { CompetitionSnapshot } from "@/lib/db";
import type { QualifierAttempt } from "@/lib/scoring";

export type DemoRole = "judge" | "competitor" | "organizer";

export type DemoSimulationMode = "single_score" | "live_burst";

export type DemoSyncStatus = "synced" | "pending" | "syncing" | "failed";

export type DemoToolkitState = {
  simulateOffline: boolean;
  pendingQueueCount: number;
  simulationRunning: boolean;
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

export type DemoSimulationResponse = {
  mode: DemoSimulationMode;
  attempt: QualifierAttempt;
  climberId: string;
  climbNumber: number;
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
};
