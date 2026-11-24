# AGENTS.md

This file provides guidance to AI coding agents and developers working in the `kobe-rock-audition` repository.

## Project Overview

A web application for managing university light-music club auditions: Google OAuth authentication with HMAC-SHA256 student ID hashing (no raw email/student ID stored in DB), Excel/CSV/TSV member roster import, collaborative band registration during entry (`DRAFT` / バンド募集中) with deadline auto-lock, entry-closed adjustment phase (`ENTRY_CLOSED` / 募集締切・調整中) with band performance order management, real-time mobile scoring (`ACTIVE` / 採点受付中) with automatic self-band exclusion, required general feedback (`全体講評`), non-destructive score normalization (Min-Max normalization with default `standardDiff = 100`, Z-score, and Raw Average) and penalty deduction, unsubmitted voter monitoring with result-hiding guard, and 2-file Excel/CSV export (`CLOSED` / 採点終了・集計).

Reference documents:
- [docs/PRD.md](docs/PRD.md) — Product requirements, functional specs, edge cases, and schema design
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — Non-engineer operations & troubleshooting manual
- [README.md](README.md) — Setup, environment variables, and Cloudflare Workers / D1 deployment guide

---

## Tech Stack & Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 (`src/client/`)
  - Audition-scoped SPA routing (`/auditions/:id/scoring`, `/bands`, `/results`, `/setup`) plus global `/admin/users` (`src/client/routes.ts`)
- **Backend / API**: Hono on Cloudflare Workers (`src/server/`, mounted under `/api/*`)
- **Database / ORM**: Cloudflare D1 (SQLite) with Drizzle ORM (`src/server/db/`)
  - Production entry: `src/worker.ts` (uses `env.DB` via `drizzle-orm/d1` and `env.ASSETS` for SPA fallback)
  - Local dev entry: `src/server/dev-entry.ts` via `vite.config.ts` `honoDevApiPlugin` (uses `better-sqlite3` in `.local-dev.sqlite` and auto-seeds via `ensureRealisticSeedData`)
- **Shared Domain Logic**: `src/shared/` (pure aggregation engine, audition status metadata, JST deadline helpers, grade calculation, name normalization, Zod schemas shared by client, server, and tests)
- **Export / Roster Import**: SheetJS (`xlsx`) in `src/server/lib/export.ts` (server export) and `src/client/components/UserSpreadsheetImport.tsx` (client-side Excel/CSV member roster parsing)

### Strict Module Boundaries
- **NEVER import `src/server/` implementation code (especially `src/server/db/local.ts` or `better-sqlite3`) from `src/client/`.** Only `import type { AppType } from '../../server/app.ts'` and `src/shared/*` may be imported by client code.
- Keep `src/shared/*` (`aggregation.ts`, `grade.ts`, `deadline.ts`, `audition-status.ts`, `name.ts`) pure and runtime-agnostic (no Node-only or DOM-only APIs) so they run identically in Workers, Vite/Browser, and Vitest.

---

## Commands

> **Windows PowerShell note**: If execution policy blocks `npm.ps1`, run `npm.cmd` / `npx.cmd` instead, and avoid `&&` in older PowerShell 5.1 (use `;` or separate calls).

```bash
npm run dev              # Start Vite dev server + Hono API + local SQLite on http://localhost:5173
npm test                 # Run Vitest suite (unit + Hono/SQLite API integration tests)
npm run build            # Build client (dist/client) and run `tsc --noEmit`
npm run typecheck        # Run TypeScript check (`tsc --noEmit`)
npm run db:generate      # Generate Drizzle SQL migrations into ./drizzle/
npm run db:migrate:local # Apply migrations to local Wrangler D1
npm run db:migrate:remote# Apply migrations to remote Cloudflare D1
npm run deploy           # Build and deploy to Cloudflare Workers
```

---

## Database & Cloudflare D1 Constraints

Schema is defined in `src/server/db/schema.ts` (6 tables: `users`, `auditions`, `bands`, `band_members`, `audition_voters`, `scores`).

1. **Do NOT use `db.transaction()`**: Cloudflare D1 does not support `BEGIN TRANSACTION` statements. Use atomic single-statement SQL (e.g., `CASE WHEN` in `POST /api/admin/auditions/:id/status` to set one audition `ACTIVE` and close all others, or `PUT /api/admin/auditions/:id/bands/order` to reorder bands atomically) or `onConflictDoUpdate` upserts.
2. **Keep local bootstrap & Drizzle migrations in sync**: Whenever you modify `src/server/db/schema.ts`:
   - Run `npm run db:generate` to generate a new SQL migration in `drizzle/`.
   - Update `createTablesIfNotExists()` in `src/server/db/local.ts` to match so `npm run dev` and `createInMemoryTestDb()` stay identical to D1.
3. **Privacy-preserving `users` schema**:
   - Do NOT store raw email addresses or plain student IDs in `users`. Match users via `student_id_hash` (HMAC-SHA256 of normalized student ID using `STUDENT_ID_HASH_SECRET`) and `google_sub`.
   - `is_grade_confirmed` tracks whether the user has confirmed their display name (`苗字 名前`) and `enrollment_year` via `GradeConfirmModal` (`POST /api/auth/confirm-grade`).
4. **Unique constraints**:
   - `users`: `UNIQUE(student_id_hash)`, `UNIQUE(google_sub)`.
   - `scores`: `UNIQUE(audition_id, band_id, evaluator_user_id)` prevents duplicate submissions.
   - `band_members`: `UNIQUE(band_id, user_id)` models many-to-many membership (multi-band performers).
   - `audition_voters`: `UNIQUE(audition_id, user_id)` binds voter permissions, submission status, and `general_feedback` per audition.

---

## Core Business Rules & Invariants

Do not weaken or bypass any of these invariants across UI, API, or aggregation:

1. **Self-Band Exclusion (Multi-band aware)**:
   - A user belonging to one or more bands via `band_members` must have ALL of those bands disabled in `ScoringPage.tsx`, rejected with `403` in `PUT /api/auditions/:id/scores/:bandId` (skipped in `POST /submit`), and excluded from numeric aggregation and band comment exports in `calculateAuditionResults`.
2. **Permission-Based Validation, General Feedback & Scoring Deadline (`audition_voters`)**:
   - Unregistered users (not in `audition_voters`) cannot submit scores and see a dedicated notice screen.
   - `SCORE_AND_COMMENT`: `techScore` (0–50), `charmScore` (0–50), non-empty `comment` for all non-own bands, and non-empty `generalFeedback` (`全体講評`) are required for final submit (`POST /api/auditions/:id/scores/submit`).
   - `COMMENT_ONLY`: Score inputs are hidden in UI, and the server MUST force `techScore = null` and `charmScore = null` regardless of request payload. Non-empty `comment` and `generalFeedback` are still required.
   - Switching to `ACTIVE` requires `scoringDeadline`. Once `scoringDeadline` passes (JST via `src/shared/deadline.ts`), submitted voters are fully locked (`403`), and unsubmitted voters may only enter previously unsaved bands/general feedback and perform their initial final submit (modifying already-saved items is rejected with `403`).
3. **Band Registration Auto-Lock by Status & Entry Deadline**:
   - When `auditions.status === 'DRAFT'` AND `entryDeadline` has not expired, all authenticated users (`VOTER` and `ADMIN`) can create/edit/delete bands and select members from active club users (1–3回生) with `updatedByUserId` recorded.
   - When `status !== 'DRAFT'` OR `entryDeadline` has expired, only `ADMIN` may modify bands; `VOTER` requests must be rejected with `403`.
4. **Immediate Role & Membership Propagation**:
   - Do not cache `role` or `bandIds` inside the JWT cookie. `createDbMiddleware` in `src/server/middleware/auth.ts` loads the user's latest `role` from DB on every request so role promotions/demotions and last-minute `band_members` edits take effect immediately.
   - Prevent demoting or deleting the last remaining `ADMIN` user, and prevent deleting oneself (`PATCH /api/admin/users/:userId/role`, `DELETE /api/admin/users/:userId`).
5. **Non-Destructive Aggregation & Proportional Tech/Charm Split**:
   - Implemented in `src/shared/aggregation.ts` (`calculateAuditionResults`).
   - `techScore === null` or `charmScore === null` records are excluded from numeric averages/stats, while comments remain visible in comment counts and exports.
   - **Min-Max Normalization (`DIFF_CORRECTION`, default)**: $\text{normTotal}_{u,b} = (x_{u,b} - \min_u) \cdot k_u$, where $k_u = \text{standardDiff} / (\max_u - \min_u)$ and `standardDiff` defaults to `100` (configurable 1–100). Guard against division by zero (`k_u = 1.0` when `validVoteCount < 2` or `diff === 0`).
   - **Z-Score (`Z_SCORE`)**: $T_{u,b} = 50 + 10 \cdot \frac{x_{u,b} - \mu_u}{\sigma_u}$ (`50` when $\sigma_u = 0$).
   - **Raw Average (`RAW_AVERAGE`)**: Unmodified raw totals.
   - **Proportional Split (`splitNormalizedScores`)**: Compute normalized tech & charm scores from `normTotal` using raw ratios (`rawTech / rawTotal`, `rawCharm / rawTotal`; 50/50 split if `rawTotal <= 0`).
   - **Penalties**: Subtract `penaltyDeduction` only when `isPenaltyEnabled === true`, strictly after normalization, never mutating raw scores.
   - **Tie-breaker order**: `validVoteCount > 0` first → `activeFinalScore` desc → `activePrePenaltyScore` desc → `avgRawTotal` desc → `avgRawTech` desc → `performanceOrder` asc.
6. **Result Visibility Gate (Pre-Completion Masking)**:
   - Voters can only view `/api/auditions/:id/results` and download `/api/auditions/:id/export` when `status === 'CLOSED'` AND all `SCORE_AND_COMMENT` voters have `isSubmitted === true` (`unsubmittedRequiredCount === 0`).
   - In `AdminDashboardPage.tsx`, rankings, band comments, and general feedback are hidden behind a lock card while `requiredUnsubmittedCount > 0`, with an explicit admin-only preview override toggle.
7. **Two-File Export Structure (`src/server/lib/export.ts`)**:
   - `target=summary_and_raw`: Workbook with 4 formula-linked sheets (`総合ランキング集計`, `全採点データ_補正過程`, `審査員別_補正係数`, `採点者別_補正後スコア表`).
   - `target=band_comments`: Workbook with 1 sheet per band (sanitized via `sanitizeExcelSheetName` for Excel's 31-char limit and forbidden chars) plus `全体講評` sheet, listing normalized charm/tech/total scores and comments (`-` for `COMMENT_ONLY` / null scores).
8. **Shared Event Switcher Header & 6-Month Filter**:
   - All audition-scoped pages render `AdminAuditionHeader` sorted by `eventDate DESC` (`[academicYear] title - status`).
   - Events older than 6 months (`isAuditionOlderThanSixMonths` in `src/client/routes.ts`) are hidden by default and toggled via `showOldAuditions` (persisted in `localStorage`).
9. **Academic Year / Grade Calculation (`src/shared/grade.ts`)**:
   - Store `enrollment_year` in DB and calculate grade dynamically using Japanese academic year (April 1 JST start).
   - Band member selection and voter obligation setup filter to active club grades (`MAX_ACTIVE_GRADE = 3`, i.e., 1–3回生).

---

## Authentication & Security

- Google OIDC via `@hono/oauth-providers/google` (`src/server/routes/auth.ts`) + HMAC-SHA256 JWT in `HttpOnly`, `SameSite=Lax` cookie (`kra_session`).
- Server-side checks verify `verified_email !== false`, domain membership against `ALLOWED_GOOGLE_DOMAIN` (or `INITIAL_ADMIN_EMAILS`), HMAC-SHA256 student ID hash matching (`STUDENT_ID_HASH_SECRET`), and `ALLOW_UNREGISTERED_DOMAIN_USERS`.
- **Dev Dummy Login**: `/api/auth/dev-users` and `/api/auth/dev-login` must only operate when `ENABLE_DEV_LOGIN` is enabled. Always ensure `ENABLE_DEV_LOGIN` is set to `"false"` in production deployments.
- Never commit `.dev.vars`, `.local-dev.sqlite`, or secrets.

---

## Testing & Verification Workflow

Before committing or finishing any change:
1. Run `npm test` — verifies:
   - `src/shared/__tests__/aggregation.test.ts` (Min-Max/Z-score/Raw normalization, zero-division guards, multi-band self-exclusion, non-destructive penalties, tie-breakers)
   - `src/shared/__tests__/deadline.test.ts` (JST deadline parsing, expiration, remaining time formatting)
   - `src/shared/__tests__/grade.test.ts` (JST April 1 academic year & active club grade calculation)
   - `src/client/__tests__/routes.test.ts` (audition-scoped URL resolution, 6-month filter, default route selection)
   - `src/server/__tests__/api.test.ts` (Hono routes, RBAC, entry/scoring deadline locks, student ID hashing, result gating, 2-file `.xlsx` generation via in-memory SQLite)
2. Run `npm run build` — verifies both Vite client bundling (`dist/client`) and strict TypeScript typechecking (`tsc --noEmit`) pass with zero errors.
