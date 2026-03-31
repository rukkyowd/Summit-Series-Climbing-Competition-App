# 🧗 Summit Series — Climbing Competition App

A production-ready, real-time climbing competition scoring system built with **Next.js 14**, **Tailwind CSS**, and **Supabase**. 

Now featuring **Offline-First capabilities**, **Role-Based Access Control**, and **Dynamic 30-Route Scoring**.

Supabase migration automation is documented in [supabase/README.md](./supabase/README.md).

---

## ✨ Features

- **Registration** — Climbers scan a QR code and register with name, bib number, and category.
- **Offline-First Scorecard (PWA)** — Judges can log fails and completion times even when WiFi drops. Actions are queued locally and sync automatically when back online via optimistic UI updates.
- **Live Category Leaderboard** — Real-time updates via Supabase Realtime (WebSocket). Computes both Overall Rank and Category Rank.
- **Dynamic Capped Penalty Scoring** — Mathematically sound: base points scale with climb difficulty, with configurable maximum penalties per climb.
- **Role-Based Access Control (RBAC)** — Secure authentication with Admin, Judge, and Climber roles via Supabase Auth and Row-Level Security (RLS).
- **Tie-breaker** — Equal scores ranked by lowest total time.

---

## 📁 Project Structure

```text
climbing-comp/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home / nav hub
│   │   ├── register/page.tsx     # Registration form
│   │   ├── scorecard/page.tsx    # Scoring UI (judge + climber view)
│   │   └── leaderboard/page.tsx  # Live leaderboard
│   └── lib/
│       ├── supabase.ts           # Supabase client singleton
│       ├── scoring.ts            # Scoring engine & DB-backed settings
│       ├── offline-scorecard.ts  # Offline queue & optimistic updates
│       └── db.ts                 # Database queries
├── public/
│   └── sw.js                     # Service Worker for PWA/offline support
├── supabase-schema.sql           # Database schema & RLS policies
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

1. Go to [supabase.com](https://supabase.com) and click **New project**.
2. Choose a name (e.g. "summit-series"), set a database password, and pick a region.
3. Wait ~2 minutes for provisioning.

### Step 3 — Run the database schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar.
2. Open the file `supabase-schema.sql` from this repo.
3. Paste the entire contents and click **Run**.

This creates:
- `profiles`, `competition_settings`, `climbers`, and `climb_attempts` tables.
- Row-Level Security (RLS) policies tied to user roles.
- Triggers for auto-creating auth profiles.
- Realtime publications.
- A category-aware `leaderboard_view`.

### Step 4 — Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# From Supabase Dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_URL=[https://xxxxxxxxxxxx.supabase.co](https://xxxxxxxxxxxx.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key...
```

### Step 5 — Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

---

## 📐 Scoring Logic

All scoring math is located in `src/lib/scoring.ts`. The competition now scales dynamically to **30 Climbs**.

### Formula

```text
Base Points = Climb Number × 1,000
Penalty = Capped Fails × Penalty Per Fail (Default 200)

Score = Completed ? Base Points - Penalty : 0
```

### Examples (using default 3 max fails & 200 pt penalty)

| Climb | Base Points | Fails | Penalized Fails | Score |
|-------|-------------|-------|-----------------|-------|
| Climb 1 | 1,000 | 0 | 0 | **1,000** |
| Climb 1 | 1,000 | 2 | 2 | **600** |
| Climb 2 | 2,000 | 1 | 1 | **1,800** |
| Climb 2 | 2,000 | 5 | 3 (capped) | **1,400** |
| Climb 30| 30,000| 99| 3 (capped) | **29,400** |

### Tie-breaker

If two climbers have the same total score, **lowest total completion time wins**.

---

## 🔐 Authentication & Roles

The system now uses Supabase Auth tied to a custom `profiles` table.

- **Climber (Default):** Read-only access. Can view scorecards and the leaderboard.
- **Judge:** Can insert/update/delete `climb_attempts`. Can register new `climbers`.
- **Admin:** Full system access. Can update the `competition_settings` and assign roles to other users.

*Note: Roles are stored in the `profiles` table and enforced universally at the database level via Row Level Security (RLS).*

---

## 📶 Offline-First PWA

The application leverages `localStorage` and a Service Worker (`public/sw.js`) to ensure judges can keep scoring even in gyms with spotty cell service.

1. **Queueing:** Actions (Start, Add Fail, Complete, Reset) are saved to an offline queue (`scorecard-offline-queue`).
2. **Optimistic UI:** The interface updates instantly using local state calculations (`offline-scorecard.ts`).
3. **Syncing:** The app automatically pushes queued actions to Supabase when network connectivity is restored.

---

## 🔧 Customization

### Change Settings Live (No Redeploys)

Penalty amounts and cap limits are now stored directly in the database, allowing admins to tweak rules mid-event if needed. 

Simply update row `id = 1` in the `competition_settings` table via the Supabase Dashboard:
- `penalty_per_fail` (Default: 200)
- `max_penalized_fails` (Default: 3)

### Change Number of Climbs

To change the total route count from 30:
1. Update `TOTAL_CLIMBS = 30` in `src/lib/scoring.ts`.
2. Update the database constraint in Supabase SQL editor:
   ```sql
   ALTER TABLE public.climb_attempts 
   DROP CONSTRAINT climb_attempts_climb_number_check;
   
   ALTER TABLE public.climb_attempts 
   ADD CONSTRAINT climb_attempts_climb_number_check 
   CHECK (climb_number BETWEEN 1 AND <YOUR_NEW_NUMBER>);
   ```

---

## 📊 Database Schema Reference

### `profiles` (Auth & RBAC)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Matches `auth.users(id)` |
| `role` | TEXT | 'admin', 'judge', or 'climber' |
| `display_name` | TEXT | User's chosen name |

### `competition_settings`
| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Always 1 (singleton config) |
| `penalty_per_fail`| INT | Points lost per fail |
| `max_penalized_fails`| INT| Fail penalty cap |

### `climbers`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `name` | TEXT | Climber's full name |
| `climber_number` | TEXT UNIQUE | Bib number |
| `category` | TEXT | e.g. 'Open', 'Beginner' |

### `climb_attempts`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `climber_id` | UUID FK | References `climbers.id` |
| `climb_number` | INT | 1 through 30 |
| `failed_attempts`| INT | Raw count (uncapped) |
| `completed` | BOOLEAN | Whether the climb was sent |
| `completion_time_seconds` | INT | NULL until completed |

---

## 🌐 Deployment (Vercel — recommended)

1. Push your code to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Add your environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Click **Deploy**.
```
