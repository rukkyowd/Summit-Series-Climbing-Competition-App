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
  - private climber scorecard only; requires an access token from the climber's private link
- `/staff/c/[slug]/judge`
  - staff scoring route for judges/admins
- `/c/[slug]/leaderboard`
  - competition-specific qualifier or finals rankings

## Security model

- Public users can read public competition data only for active or demo competitions.
- Climber scorecards require private access tokens; missing or invalid tokens show a private-link state instead of redirecting into staff tools.
- Staff scoring writes go through protected route handlers under `/api/staff/scores/*` before reaching checked Supabase RPC wrappers.
- Admin/destructive actions such as phase changes, finalist edits, schedule/config updates, reset, undo, and delete run server-side through protected admin routes.
- The current authorization model is intentionally still global `admin`/`judge`; per-competition staff assignments are a future pass.

## Local setup

1. Install dependencies

```bash
npm install
```

2. Create `.env.local` from `.env.example` and add your Supabase values

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

3. Choose one database setup path

Recommended for a brand-new Supabase project:

- open the Supabase SQL Editor
- run [supabase-schema.sql](./supabase-schema.sql)
- optionally run [supabase-seed.sql](./supabase-seed.sql) for sample data

Recommended if you want the repo to stay migration-driven from day one:

- follow [supabase/README.md](./supabase/README.md)
- use the baseline migration plus `supabase db push`

Do not apply both the manual schema file and the full migration history to the same fresh database unless you intentionally know why.

4. Start the app

```bash
npm run dev
```

5. Verify the app

- open `/` to confirm competitions load
- open `/staff/login` to confirm staff auth renders

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

Manual setup and automation notes for migrations live in [supabase/README.md](./supabase/README.md).

## SQL helpers

Manual SQL files for testing live at the repo root and in [sql/spring-send](./sql/spring-send).

- [supabase-seed.sql](./supabase-seed.sql)
  - light sample setup with multiple competitions
- [supabase-test-100-athletes.sql](./supabase-test-100-athletes.sql)
  - heavier test fixture with 100 athletes across multiple competitions
- [sql/spring-send/README.md](./sql/spring-send/README.md)
  - phased Spring Send scripts split by event segment

## Quality checks

```bash
npm run typecheck
npm run test
npm run lint
npm run build
npm run security:secrets
npm run db:push:dry
```
