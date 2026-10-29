# Summit Series Climbing Competition Platform

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Tested_with-Vitest-6E9F18?style=flat&logo=vitest)](https://vitest.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)

**Summit Series** is an end-to-end, real-time climbing competition platform engineered for gyms, event organizers, judges, athletes, and spectators. Built modern from the ground up with Next.js 14, TypeScript, Tailwind CSS, and Supabase (PostgreSQL with Row Level Security & Realtime).

The platform handles multi-competition concurrency, live qualifier scorecards, 2025 IFSC-compliant finals rounds with instant tie-breakers, digital judge entry stations, and public leaderboards.

---

## ⚡ Core Features

- **Multi-Event Management**: Concurrently manage multiple distinct competitions (e.g., Youth, Recreational, Open Pro) from an organizer command center without data collision.
- **2025 IFSC Scoring Engine**: Official point-model implementation:
  - Top: `25.0` points minus `0.1` per unsuccessful attempt before the top.
  - Zone: `10.0` points minus `0.1` per unsuccessful attempt before the zone.
  - Per-boulder score: `max(Top, Zone, 0.0)`.
- **Live Athlete Scorecards**: Secure token-authenticated scorecards for participants to track boulder attempts without requiring account registration passwords.
- **Judge Scoring Console**: Fast, high-contrast, touch-optimized judging interface with server-side validation and optimistic UI updates for rapid problem scoring.
- **Real-Time Spectator Leaderboard**: Low-latency public leaderboard that auto-switches from qualifier standings to dynamic live finals rankings.
- **Guided Demo Sandbox**: Interactive scenario walkthrough with seeded athletes and real-time score simulation for demonstrations and rehearsals.
- **Automated Tie-Breaking & Cut Lines**: Automatic ranking calculations, qualification cutoffs, and finals bracket progression.

---

## 🏗 Architecture & Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Server Actions, Route Handlers)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict typing with end-to-end Supabase schema types)
- **Styling & UI**: [Tailwind CSS](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Row-Level Security policies, PostgreSQL RPC functions, Realtime change data capture)
- **Testing**: [Vitest](https://vitest.dev/) (Unit and integration test suites covering scoring calculations, state transitions, and organizer operations)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm**, **pnpm**, or **yarn**
- A [Supabase](https://supabase.com/) account & project (or local Supabase CLI instance)

### 1. Clone the repository

```bash
git clone https://github.com/rukkyowd/Summit-Series-Climbing-Competition-App.git
cd Summit-Series-Climbing-Competition-App
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment configuration

Copy the template and configure your environment variables:

```bash
cp .env.example .env.local
```

Populate `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY # Optional: for administrative scripts
```

### 4. Database Setup

Choose between two setup strategies:

#### Option A: Quick Setup (Supabase Web Dashboard)
1. Open the **SQL Editor** in your Supabase project dashboard.
2. Execute [`supabase-schema.sql`](./supabase-schema.sql) to provision all tables, RPC functions, and RLS policies.
3. *(Optional)* Execute [`supabase-seed.sql`](./supabase-seed.sql) to inject realistic sample events, categories, athletes, and scores.

#### Option B: Migration-Driven (Supabase CLI)
Follow the guide in [`supabase/README.md`](./supabase/README.md) to link your project and apply versioned migrations:
```bash
npx supabase db push --linked
```

### 5. Launch the application

```bash
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) in your browser.

---

## 🧭 Application Routes

| Path | Purpose |
| :--- | :--- |
| `/` | Public competition browser & staff management dashboard |
| `/c/[slug]` | Competition overview, schedule, and category breakdown |
| `/c/[slug]/register` | Athlete registration portal |
| `/c/[slug]/scorecard` | Private athlete scorecard (authenticated via unique access token) |
| `/c/[slug]/leaderboard` | Live public standings (qualifier rankings & finals ladder) |
| `/staff/c/[slug]/judge` | Secure, touch-optimized judge scoring station |
| `/demo` | Guided interactive sandbox walkthrough for testing |

---

## 🧪 Testing & Code Quality

This project maintains high reliability standards through comprehensive tests and automated linters:

```bash
# Run unit and integration tests
npm run test

# Type check TypeScript without emitting files
npm run typecheck

# Lint codebase with ESLint
npm run lint

# Check for accidental secret leakage in source files
npm run security:secrets

# Production build
npm run build
```

---

## 🔒 Security Architecture

- **Row Level Security (RLS)**: Enforced directly at the PostgreSQL layer, preventing unauthorized reads or data leakage across competitions.
- **Scoped Judge Operations**: Writes are processed through protected route handlers (`/api/staff/scores/*`) that validate user permissions before executing database RPC calls.
- **Private Athlete Tokens**: Athletes access their personal scorecards through cryptographically sound unguessable tokens, eliminating the need to expose credentials on gym floor devices.
- **Server-Side Administrative Actions**: Schedule changes, phase transitions, and finalist seeding strictly execute on the server under administrative authentication.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
