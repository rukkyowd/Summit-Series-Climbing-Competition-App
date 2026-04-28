# Supabase Migrations

This repo is now set up for a safer split:

- Vercel deploys the Next.js app
- GitHub Actions pushes Supabase migrations on `main`
- test or fixture SQL stays manual unless you choose to run it

## Files

- [config.toml](/Users/Paul/Desktop/Scorecard/supabase/config.toml)
- [20260331193000_current_schema.sql](/Users/Paul/Desktop/Scorecard/supabase/migrations/20260331193000_current_schema.sql)
- [supabase-deploy.yml](/Users/Paul/Desktop/Scorecard/.github/workflows/supabase-deploy.yml)

## First-time setup

1. Confirm [config.toml](/Users/Paul/Desktop/Scorecard/supabase/config.toml) points at the intended Supabase project ref.
2. Add these GitHub repository secrets:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
3. Pick the matching starting point for your remote database.

If the remote database is empty and you want migrations to build it from scratch:

- run `supabase link --project-ref YOUR_PROJECT_REF`
- run `npm run db:push`

If the remote database already matches the schema in this repo, mark the baseline migration as already applied before enabling the workflow:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase migration repair 20260331193000 --status applied --linked
```

That prevents the baseline migration from being replayed against an already-live project. After the repair, future schema changes should go through normal migration files and `supabase db push`.

## Everyday workflow

Create a new migration locally:

```bash
npm run db:migration:new -- add_schedule_phase_rules
```

Push migrations manually from your machine:

```bash
npm run db:push
```

Preview what would run:

```bash
npm run db:push:dry
```

Pull remote schema changes back into the repo if needed:

```bash
npm run db:pull
```

## Important note about seed data

Files like [supabase-seed.sql](/Users/Paul/Desktop/Scorecard/supabase-seed.sql) and [supabase-test-100-athletes.sql](/Users/Paul/Desktop/Scorecard/supabase-test-100-athletes.sql) are intentionally not part of the GitHub Action. They are manual test/setup scripts and should not run automatically on production deploys.
