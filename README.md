# Scorecard

A real-time climbing competition platform built with Next.js, Tailwind CSS, and Supabase.

The app now supports multiple simultaneous competitions instead of one singleton event. Each competition has its own:

- public page and slug
- registration flow
- private scorecards
- qualifier leaderboard
- finals state and finalists
- schedule blocks
- admin controls

Examples:

- `/` shows the active competition browser
- `/c/spring-send-recreational` shows one competition overview
- `/c/spring-send-youth-competitive/leaderboard` shows rankings for that competition only

## Current product model

- Public users land on a clean events browser and choose the competition they belong to.
- Staff manage many competitions from one shared dashboard on the home page.
- Registration, scorecards, leaderboards, finalists, and finals never leak across competitions.
- Finals use the 2025 IFSC points model:
  - `25.0` for a top, minus `0.1` per failed attempt before the top
  - `10.0` for a zone, minus `0.1` per failed attempt before the zone
  - per-boulder score is the better of top, zone, or `0.0`

## Main routes

- `/`
  - public competition browser
  - staff dashboard and competition manager for judges/admins
- `/c/[slug]`
  - competition overview
- `/c/[slug]/register`
  - public competition registration
- `/c/[slug]/scorecard`
  - private climber scorecard or staff scoring page
- `/c/[slug]/leaderboard`
  - competition-specific qualifier or finals rankings

## Local setup

1. Install dependencies

```bash
npm install
```

2. Create `.env.local` with your Supabase keys

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

3. Apply the database schema in Supabase SQL Editor

- [supabase-schema.sql](/Users/Paul/Desktop/Scorecard/supabase-schema.sql)

4. Start the app

```bash
npm run dev
```

## Database notes

The database now centers on a `competitions` table instead of a single `active_event_config` row.

Key tables:

- `competitions`
- `competition_categories`
- `competition_schedule_blocks`
- `climbers`
- `qualifier_attempts`
- `competition_finalists`
- `final_attempts`
- `profiles`

Manual setup and automation notes for migrations live in [supabase/README.md](/Users/Paul/Desktop/Scorecard/supabase/README.md).

## SQL helpers

Manual SQL files for testing live at the repo root and in [sql/spring-send](/Users/Paul/Desktop/Scorecard/sql/spring-send).

- [supabase-seed.sql](/Users/Paul/Desktop/Scorecard/supabase-seed.sql)
  - light sample setup with multiple competitions
- [supabase-test-100-athletes.sql](/Users/Paul/Desktop/Scorecard/supabase-test-100-athletes.sql)
  - heavier test fixture with 100 athletes across multiple competitions
- [sql/spring-send/README.md](/Users/Paul/Desktop/Scorecard/sql/spring-send/README.md)
  - phased Spring Send scripts split by event segment

## Quality checks

```bash
npm run lint
npm run build
```
