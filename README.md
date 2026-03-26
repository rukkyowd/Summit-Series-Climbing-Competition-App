# 🧗 Summit Series — Climbing Competition App

A production-ready, real-time climbing competition scoring system built with **Next.js 14**, **Tailwind CSS**, and **Supabase**.

---

## ✨ Features

- **Registration** — Climbers scan a QR code and register with name + bib number
- **Scorecard** — Judges log fails and completion times; climbers can view their own progress
- **Live Leaderboard** — Real-time Top 6 updated via Supabase Realtime (WebSocket)
- **Capped Penalty Scoring** — Mathematically sound: max 3 fails penalized per climb
- **Tie-breaker** — Equal scores ranked by lowest total time
- **Admin mode** — PIN-protected judge controls per scorecard
- **Undo** — Remove accidentally logged fails

---

## 📁 Project Structure

```
climbing-comp/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home / nav hub
│   │   ├── register/page.tsx     # Registration form
│   │   ├── scorecard/page.tsx    # Scoring UI (judge + climber view)
│   │   └── leaderboard/page.tsx  # Live leaderboard
│   └── lib/
│       ├── supabase.ts           # Supabase client singleton
│       ├── scoring.ts            # All scoring math (pure functions)
│       └── db.ts                 # All database queries
├── supabase-schema.sql           # Run this in Supabase SQL editor
├── .env.local.example            # Environment variable template
└── tailwind.config.ts
```

---

## 🚀 Local Setup (5 steps)

### Step 1 — Clone & install dependencies

```bash
git clone <your-repo-url> climbing-comp
cd climbing-comp
npm install
```

### Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and click **New project**
2. Choose a name (e.g. "summit-series"), set a database password, pick a region
3. Wait ~2 minutes for provisioning

### Step 3 — Run the database schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Open the file `supabase-schema.sql` from this repo
3. Paste the entire contents and click **Run**

This creates:
- `climbers` table
- `climb_attempts` table
- Row-Level Security policies (public read + write)
- Realtime publications
- A `leaderboard_view` for debugging

### Step 4 — Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# From Supabase Dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key...

# PIN judges must enter to access scoring controls
NEXT_PUBLIC_ADMIN_PIN=1234
```

Find your keys at: **Supabase Dashboard → Settings → API**

### Step 5 — Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

---

## 🏗️ Pages & URLs

| URL | Description |
|-----|-------------|
| `/` | Home / navigation hub |
| `/register` | Climber registration form |
| `/scorecard` | Lookup scorecard by climber number |
| `/scorecard?id=<uuid>` | Direct link to a climber's scorecard |
| `/leaderboard` | Live top 6 public leaderboard |

---

## 📐 Scoring Logic

All scoring math is in `src/lib/scoring.ts` as pure, testable functions.

### Formula

```
climbScore(n, fails, completed) =
  completed
    ? basePoints[n] − (min(fails, 3) × 200)
    : 0
```

### Examples

| Climb | Base | Fails | Penalized Fails | Score |
|-------|------|-------|-----------------|-------|
| Climb 1 | 1,000 | 0 | 0 | **1,000** |
| Climb 1 | 1,000 | 2 | 2 | **600** |
| Climb 2 | 2,000 | 1 | 1 | **1,800** |
| Climb 2 | 2,000 | 5 | 3 (capped) | **1,400** |
| Climb 3 | 3,000 | 3 | 3 | **2,400** |
| Climb 3 | 3,000 | 99 | 3 (capped) | **2,400** |

### Why cap at 3?

The cap ensures the scoring hierarchy is preserved:
- Minimum score for completing Climb 2 = 2,000 − 600 = **1,400 pts**
- Maximum score for completing only Climb 1 = **1,000 pts**

A climber who completes Climb 2 (no matter how many tries) will always outscore someone who only finished Climb 1. ✅

### Tie-breaker

If two climbers have the same total score, **lowest total completion time wins**.
Total time = sum of `completion_time_seconds` for all completed climbs.

---

## 🏆 Real-time Leaderboard

The leaderboard uses **Supabase Realtime** (PostgreSQL logical replication over WebSocket).

```typescript
// From leaderboard/page.tsx
supabase.channel("leaderboard-realtime")
  .on("postgres_changes", { table: "climb_attempts", event: "*" }, refresh)
  .on("postgres_changes", { table: "climbers", event: "INSERT" }, refresh)
  .subscribe();
```

Every time a judge logs a fail or completes a climb, **all connected leaderboard screens update within ~500ms** with no page refresh required.

---

## 🔐 Admin / Judge Mode

The scorecard is readable by anyone (for climbers to view their own progress).

To access the scoring controls (add fails, mark complete, reset):
1. Navigate to a climber's scorecard
2. Click **"Judge Login"** in the top right
3. Enter the PIN defined in `NEXT_PUBLIC_ADMIN_PIN`

The PIN is **per-session** and **per-browser tab** — closing the tab clears it.

> ⚠️ For a real competition, consider replacing the PIN with Supabase Auth (magic link or OAuth). The architecture is already structured to make this easy.

---

## 📱 QR Code Setup

To let climbers self-register by scanning a QR code:

1. Deploy the app (see deployment below)
2. Generate a QR code pointing to `https://your-domain.com/register`
   - Free tool: [qr-code-generator.com](https://www.qr-code-generator.com)
3. Print and place at the registration desk or route entrance

---

## 🌐 Deployment (Vercel — recommended)

Vercel is the official Next.js hosting platform and deploys in ~60 seconds.

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow the prompts, then add your env vars:
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_ADMIN_PIN

# Redeploy with env vars
vercel --prod
```

Or use the Vercel dashboard:
1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. Add the three environment variables in the **Environment Variables** section
4. Click **Deploy**

### Alternative: Netlify

```bash
npm run build
# Upload the `.next` folder or connect via GitHub at netlify.com
```

---

## 🔧 Customization

### Change penalty amount

In `src/lib/scoring.ts`:

```typescript
export const PENALTY_PER_FAIL = 200;     // ← change this
export const MAX_PENALIZED_FAILS = 3;    // ← and/or this
```

### Change base points

```typescript
export const CLIMBS = [
  { number: 1, label: "Climb 1", basePoints: 1000 },
  { number: 2, label: "Climb 2", basePoints: 2000 },
  { number: 3, label: "Climb 3", basePoints: 3000 },
];
```

### Change number of climbs

Add more entries to `CLIMBS` and update the database schema `CHECK (climb_number IN (1, 2, 3))` accordingly.

### Change leaderboard size

In `src/app/leaderboard/page.tsx`:

```typescript
const TOP_N = 6; // ← change to 10, 8, etc.
```

---

## 🧪 Testing the Scoring Engine

The scoring functions are pure and easy to unit test:

```typescript
import { calculateClimbScore, buildLeaderboard } from "@/lib/scoring";

// Basic completion
assert(calculateClimbScore(1, 0, true) === 1000);

// With 2 fails
assert(calculateClimbScore(2, 2, false) === 0); // not completed → 0
assert(calculateClimbScore(2, 2, true) === 1600); // 2000 - (2×200)

// Cap in action — 99 fails still only costs 600
assert(calculateClimbScore(3, 99, true) === 2400); // 3000 - (3×200)

// Incomplete → always 0
assert(calculateClimbScore(1, 0, false) === 0);
```

---

## 📊 Database Schema Reference

### `climbers`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `name` | TEXT | Climber's full name |
| `climber_number` | TEXT UNIQUE | Bib number |
| `registered_at` | TIMESTAMPTZ | Auto-set |

### `climb_attempts`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `climber_id` | UUID FK | References `climbers.id` |
| `climb_number` | INT | 1, 2, or 3 |
| `failed_attempts` | INT | Raw count (uncapped) |
| `completed` | BOOLEAN | Whether the climb was sent |
| `completion_time_seconds` | INT | NULL until completed |
| `completed_at` | TIMESTAMPTZ | NULL until completed |

---

## 🐛 Troubleshooting

**"Missing Supabase environment variables"**
→ Make sure `.env.local` exists and has both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Real-time not working**
→ In Supabase Dashboard → Database → Replication, confirm `climbers` and `climb_attempts` are listed under the `supabase_realtime` publication. If not, re-run the `ALTER PUBLICATION` lines from the schema file.

**"Climber number already registered"**
→ Each bib number is unique. Use the Supabase table editor to delete test rows, or change the climber number.

**Judge PIN not working**
→ Check `NEXT_PUBLIC_ADMIN_PIN` in your `.env.local`. Note: env vars starting with `NEXT_PUBLIC_` are baked into the client bundle at build time — restart `npm run dev` after changing them.
