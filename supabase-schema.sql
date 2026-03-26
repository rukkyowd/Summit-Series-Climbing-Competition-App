-- ============================================================
-- CLIMBING COMPETITION DATABASE SCHEMA
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. CLIMBERS TABLE
-- Stores registration info for each competitor
CREATE TABLE IF NOT EXISTS climbers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  climber_number TEXT NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CLIMB ATTEMPTS TABLE
-- One row per climb per climber. Updated as the competitor progresses.
CREATE TABLE IF NOT EXISTS climb_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climber_id     UUID NOT NULL REFERENCES climbers(id) ON DELETE CASCADE,
  climb_number   INT NOT NULL CHECK (climb_number IN (1, 2, 3)),
  failed_attempts INT NOT NULL DEFAULT 0,  -- raw number of fails (uncapped)
  completed      BOOLEAN NOT NULL DEFAULT FALSE,
  completion_time_seconds INT,             -- only set when completed = TRUE
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  UNIQUE(climber_id, climb_number)
);

-- 3. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_climb_attempts_climber_id ON climb_attempts(climber_id);
CREATE INDEX IF NOT EXISTS idx_climbers_number ON climbers(climber_number);

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE climbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE climb_attempts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (public leaderboard)
CREATE POLICY "Public read climbers" ON climbers FOR SELECT USING (true);
CREATE POLICY "Public read attempts" ON climb_attempts FOR SELECT USING (true);

-- Allow anyone to insert (registration, scoring)
-- In production you'd lock this down with auth
CREATE POLICY "Public insert climbers" ON climbers FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert attempts" ON climb_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update attempts" ON climb_attempts FOR UPDATE USING (true);
CREATE POLICY "Public delete climbers" ON climbers FOR DELETE USING (true);
CREATE POLICY "Public delete attempts" ON climb_attempts FOR DELETE USING (true);

-- ============================================================
-- REAL-TIME PUBLICATION
-- Enable Supabase Realtime for live leaderboard updates
-- ============================================================
-- Run these only once:
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE climbers;
  ALTER PUBLICATION supabase_realtime ADD TABLE climb_attempts;
COMMIT;

-- ============================================================
-- SCORING VIEW (optional helper for debugging)
-- Computes live scores server-side using the capped formula
-- ============================================================
CREATE OR REPLACE VIEW leaderboard_view AS
WITH scored AS (
  SELECT
    c.id AS climber_id,
    c.name,
    c.climber_number,
    -- Climb 1: 1000 pts base, 200/fail, max 3 fails penalized
    CASE WHEN ca1.completed THEN
      1000 - (LEAST(COALESCE(ca1.failed_attempts, 0), 3) * 200)
    ELSE 0 END AS climb1_score,
    -- Climb 2: 2000 pts base, 200/fail, max 3 fails penalized
    CASE WHEN ca2.completed THEN
      2000 - (LEAST(COALESCE(ca2.failed_attempts, 0), 3) * 200)
    ELSE 0 END AS climb2_score,
    -- Climb 3: 3000 pts base, 200/fail, max 3 fails penalized
    CASE WHEN ca3.completed THEN
      3000 - (LEAST(COALESCE(ca3.failed_attempts, 0), 3) * 200)
    ELSE 0 END AS climb3_score,
    -- Total completion time (sum of all completed climbs)
    (COALESCE(ca1.completion_time_seconds, 0) +
     COALESCE(ca2.completion_time_seconds, 0) +
     COALESCE(ca3.completion_time_seconds, 0)) AS total_time_seconds
  FROM climbers c
  LEFT JOIN climb_attempts ca1 ON ca1.climber_id = c.id AND ca1.climb_number = 1
  LEFT JOIN climb_attempts ca2 ON ca2.climber_id = c.id AND ca2.climb_number = 2
  LEFT JOIN climb_attempts ca3 ON ca3.climber_id = c.id AND ca3.climb_number = 3
)
SELECT
  climber_id,
  name,
  climber_number,
  climb1_score,
  climb2_score,
  climb3_score,
  (climb1_score + climb2_score + climb3_score) AS total_score,
  total_time_seconds,
  RANK() OVER (
    ORDER BY (climb1_score + climb2_score + climb3_score) DESC,
             total_time_seconds ASC
  ) AS rank
FROM scored
ORDER BY rank;
