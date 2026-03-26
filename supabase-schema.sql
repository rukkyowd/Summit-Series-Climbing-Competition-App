-- ============================================================
-- CLIMBING COMPETITION DATABASE SCHEMA
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. CLIMBERS TABLE
CREATE TABLE IF NOT EXISTS climbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  climber_number TEXT NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CLIMB ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS climb_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climber_id UUID NOT NULL REFERENCES climbers(id) ON DELETE CASCADE,
  climb_number INT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completion_time_seconds INT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT climb_attempts_climber_route_unique UNIQUE (climber_id, climb_number)
);

-- If you are upgrading an existing project, run this section too.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'climb_attempts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%climb_number%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE climb_attempts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE climb_attempts
  ADD CONSTRAINT climb_attempts_climb_number_check
  CHECK (climb_number BETWEEN 1 AND 30);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_climb_attempts_climber_id ON climb_attempts(climber_id);
CREATE INDEX IF NOT EXISTS idx_climbers_number ON climbers(climber_number);

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE climbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE climb_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read climbers" ON climbers FOR SELECT USING (true);
CREATE POLICY "Public read attempts" ON climb_attempts FOR SELECT USING (true);
CREATE POLICY "Public insert climbers" ON climbers FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert attempts" ON climb_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update attempts" ON climb_attempts FOR UPDATE USING (true);
CREATE POLICY "Public delete climbers" ON climbers FOR DELETE USING (true);
CREATE POLICY "Public delete attempts" ON climb_attempts FOR DELETE USING (true);

-- ============================================================
-- REAL-TIME PUBLICATION
-- ============================================================
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE climbers;
  ALTER PUBLICATION supabase_realtime ADD TABLE climb_attempts;
COMMIT;

-- ============================================================
-- SCORING VIEW (optional helper for debugging)
-- ============================================================
CREATE OR REPLACE VIEW leaderboard_view AS
WITH route_scores AS (
  SELECT
    c.id AS climber_id,
    c.name,
    c.climber_number,
    COALESCE(
      SUM(
        CASE
          WHEN ca.completed THEN (ca.climb_number * 1000) - (LEAST(ca.failed_attempts, 3) * 200)
          ELSE 0
        END
      ),
      0
    ) AS total_score,
    COALESCE(
      SUM(
        CASE
          WHEN ca.completed THEN ca.completion_time_seconds
          ELSE 0
        END
      ),
      0
    ) AS total_time_seconds,
    COALESCE(
      SUM(
        CASE
          WHEN ca.completed THEN 1
          ELSE 0
        END
      ),
      0
    ) AS completed_climbs,
    COALESCE(
      MAX(
        CASE
          WHEN ca.completed THEN ca.climb_number
          ELSE 0
        END
      ),
      0
    ) AS highest_completed_climb
  FROM climbers c
  LEFT JOIN climb_attempts ca ON ca.climber_id = c.id
  GROUP BY c.id, c.name, c.climber_number
)
SELECT
  climber_id,
  name,
  climber_number,
  total_score,
  total_time_seconds,
  completed_climbs,
  highest_completed_climb,
  RANK() OVER (
    ORDER BY total_score DESC, total_time_seconds ASC
  ) AS rank
FROM route_scores
ORDER BY rank;
