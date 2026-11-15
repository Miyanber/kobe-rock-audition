# AGENTS.md

This file provides guidance to AI coding agents and developers working in the `kobe-rock-audition` repository.

## Project Overview

A web application for managing university light-music club auditions: Google OAuth authentication, Wiki-style band entry during preparation (`DRAFT`), real-time mobile scoring (`ACTIVE`) with automatic self-band exclusion, non-destructive score normalization (Diff-correction with constant `10` & Z-score) and penalty deduction, unsubmitted voter monitoring, and 2-file Excel/CSV export.

Reference documents:
- [docs/PRD.md](docs/PRD.md) — Product requirements, functional specs, edge cases, and schema design
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — Non-engineer operations & troubleshooting manual
- [README.md](README.md) — Setup, environment variables, and Cloudflare Workers / D1 deployment guide

---

## Tech Stack & Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 (`src/client/`)
- **Backend / API**: Hono on Cloudflare Workers (`src/server/`, mounted under `/api/*`)
- **Database / ORM**: Cloudflare D1 (SQLite) with Drizzle ORM (`src/server/db/`)
  - Production entry: `src/worker.ts` (uses `env.DB` via `drizzle-orm/d1` and `env.ASSETS` for SPA fallback)
  - Local dev entry: `src/server/dev-entry.ts` via `vite.config.ts` `honoDevApiPlugin` (uses `better-sqlite3` in `.local-dev.sqlite` and auto-seeds via `ensureSeedData`)
- **Shared Domain Logic**: `src/shared/` (pure aggregation engine, grade calculation, Zod schemas shared by client, server, and tests)
- **Export**: SheetJS (`xlsx`) in `src/server/lib/export.ts`

### Strict Module Boundaries
- **NEVER import `src/server/` implementation code (especially `src/server/db/local.ts` or `better-sqlite3`) from `src/client/`.** Only `import type { AppType } from '../../server/app.ts'` and `src/shared/*` may be imported by client code.
- Keep `src/shared/aggregation.ts` and `src/shared/grade.ts` pure and runtime-agnostic (no Node-only or DOM-only APIs) so they run identically in Workers, Vite/Browser, and Vitest.

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

1. **Do NOT use `db.transaction()`**: Cloudflare D1 does not support `BEGIN TRANSACTION` statements. Use atomic single-statement SQL (e.g., `CASE WHEN` in `POST /api/admin/auditions/:id/status` to set one audition `ACTIVE` and close all others) or `onConflictDoUpdate` upserts.
2. **Keep local bootstrap & Drizzle migrations in sync**: Whenever you modify `src/server/db/schema.ts`:
   - Run `npm run db:generate` to generate a new SQL migration in `drizzle/`.
   - Update `createTablesIfNotExists()` in `src/server/db/local.ts` to match so `npm run dev` and `createInMemoryTestDb()` stay identical to D1.
3. **Unique constraints**:
   - `scores`: `UNIQUE(audition_id, band_id, evaluator_user_id)` prevents duplicate submissions.
   - `band_members`: `UNIQUE(band_id, user_id)` models many-to-many membership (multi-band performers).
   - `audition_voters`: `UNIQUE(audition_id, user_id)` binds voter permissions per audition.

---

## Core Business Rules & Invariants

Do not weaken or bypass any of these invariants across UI, API, or aggregation:

1. **Self-Band Exclusion (Multi-band aware)**:
   - A user belonging to one or more bands via `band_members` must have ALL of those bands disabled in `ScoringPage.tsx`, rejected with `403` in `PUT /api/auditions/:id/scores/:bandId` (skipped in `POST /submit`), and excluded from numeric aggregation and band comment exports in `calculateAuditionResults`.
2. **Permission-Based Validation (`AuditionVoters`)**:
   - Unregistered users (not in `audition_voters`) cannot submit scores and see a dedicated notice screen.
   - `SCORE_AND_COMMENT`: `techScore` (0–50), `charmScore` (0–50), and non-empty `comment` are required.
   - `COMMENT_ONLY`: Score inputs are hidden in UI, and the server MUST force `techScore = null` and `charmScore = null` regardless of request payload.
3. **Wiki Auto-Lock by Audition Status**:
   - When `auditions.status === 'DRAFT'`, all authenticated users (`VOTER` and `ADMIN`) can create/edit/delete bands and select members from `users` (avoiding name typos) with `updatedByUserId` recorded.
   - When `status !== 'DRAFT'` (`ACTIVE` or `CLOSED`), only `ADMIN` may modify bands; `VOTER` requests must be rejected with `403`.
4. **Immediate Role & Membership Propagation**:
   - Do not cache `role` or `bandIds` inside the JWT cookie. `createDbMiddleware` in `src/server/middleware/auth.ts` loads the user's latest `role` from DB on every request so role promotions/demotions and last-minute `band_members` edits take effect immediately.
   - Prevent demoting the last remaining `ADMIN` user (`PATCH /api/admin/users/:userId/role`).
5. **Non-Destructive Aggregation & Proportional Tech/Charm Split**:
   - Implemented in `src/shared/aggregation.ts` (`calculateAuditionResults`).
   - `techScore === null` or `charmScore === null` records are excluded from numeric averages/stats, while comments remain visible in comment counts and exports.
   - **Diff-Correction (default)**: $k_u = \text{standardDiff} / (\max_u - \min_u)$ where `standardDiff` defaults to `10`. Guard against division by zero (`k_u = 1.0` when `validVoteCount < 2` or `diff === 0`).
   - **Z-Score**: $T_{u,b} = 50 + 10 \cdot \frac{x_{u,b} - \mu_u}{\sigma_u}$ (`50` when $\sigma_u = 0$).
   - **Proportional Split (`splitNormalizedScores`)**: Compute normalized tech & charm scores from `normTotal` using raw ratios (`rawTech / rawTotal`, `rawCharm / rawTotal`; 50/50 split if `rawTotal <= 0`).
   - **Penalties**: Subtract `penaltyDeduction` only when `isPenaltyEnabled === true`, strictly after normalization, never mutating raw scores.
   - **Tie-breaker order**: `activeFinalScore` desc → `activePrePenaltyScore` desc → `avgRawTotal` desc → `avgRawTech` desc → `performanceOrder` asc.
6. **Two-File Export Structure (`src/server/lib/export.ts`)**:
   - `target=summary_and_raw`: Workbook with 2 sheets (`総合ランキング集計` and `全採点Rawデータ_補正過程`).
   - `target=band_comments`: Workbook with 1 sheet per band (sanitized via `sanitizeExcelSheetName` for Excel's 31-char limit and forbidden chars), listing normalized charm/tech/total scores and comments (`-` for `COMMENT_ONLY` / null scores).
7. **Admin Header & Past-Audition Warning**:
   - All admin pages must render `AdminAuditionHeader` sorted by `eventDate DESC` and display the warning banner whenever operating on a non-latest or `CLOSED` audition.
8. **Academic Year / Grade Calculation (`src/shared/grade.ts`)**:
   - Store `enrollment_year` in DB and calculate grade dynamically using Japanese academic year (April 1 start).

---

## Authentication & Security

- Google OIDC via `@hono/oauth-providers/google` (`src/server/routes/auth.ts`) + HMAC-SHA256 JWT in `HttpOnly`, `SameSite=Lax` cookie (`kra_session`).
- Server-side checks verify `verified_email !== false`, domain membership against `ALLOWED_GOOGLE_DOMAIN` (or `INITIAL_ADMIN_EMAILS`), and optionally `ALLOW_UNREGISTERED_DOMAIN_USERS`.
- **Dev Dummy Login**: `/api/auth/dev-users` and `/api/auth/dev-login` must only operate when `ENABLE_DEV_LOGIN` is enabled (`wrangler.jsonc` sets `"ENABLE_DEV_LOGIN": "false"` for production).
- Never commit `.dev.vars`, `.local-dev.sqlite`, or secrets.

---

## Testing & Verification Workflow

Before committing or finishing any change:
1. Run `npm test` — verifies `src/shared/__tests__/aggregation.test.ts` (normalization, zero-division guards, multi-band self-exclusion, non-destructive penalties, tie-breakers) and `src/server/__tests__/api.test.ts` (Hono routes, RBAC, Wiki lock, 2-file `.xlsx` generation via in-memory SQLite).
2. Run `npm run build` — verifies both Vite client bundling (`dist/client`) and strict TypeScript typechecking (`tsc --noEmit`) pass with zero errors.

