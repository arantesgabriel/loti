# Loti — Agent Instructions

This repository contains the canonical specification for **Loti**, a private collaborative web app for organizing product favorites and assembling group purchases.

## Read this first

Before writing code, read the files in this order:

1. `docs/00_CONTEXT.md`
2. `docs/01_PRODUCT.md`
3. `docs/02_MVP_SCOPE.md`
4. `docs/03_BUSINESS_RULES.md`
5. `docs/04_USER_FLOWS.md`
6. `docs/05_INFORMATION_ARCHITECTURE.md`
7. `docs/06_DESIGN.md`
8. `docs/07_PRODUCT_VISUALS.md`
9. `docs/08_TECHNICAL_ARCHITECTURE.md`
10. `docs/09_DATABASE_SCHEMA.md`
11. `docs/10_IMPLEMENTATION_PLAN.md`
12. `docs/11_ACCEPTANCE_CRITERIA.md`
13. `docs/12_TEST_PLAN.md`
14. `docs/13_DEPLOYMENT.md`
15. `docs/14_LEGACY_MIGRATION.md`
16. `docs/15_DECISIONS.md`
17. `docs/16_HUMAN_INPUTS.md`
18. `docs/17_LOGIN_ORBITAL_MOTION.md`

The execution prompt is `PROMPT_ONE_SHOT.md`.

## Source of truth priority

If anything appears ambiguous, resolve it in this order:

1. `PROMPT_ONE_SHOT.md`
2. numbered canonical docs in `docs/`
3. approved mockups in `docs/design/mockups/`
4. design inspiration links in `docs/design/REFERENCES.md`
5. existing repository README

Do **not** revive discarded architecture decisions such as Supabase, Neon, PostgreSQL, RLS, real-time subscriptions, or public signup.

## Non-negotiables

- Product name: **Loti**.
- The app is a private MVP for a small trusted group, initially five people.
- The app replaces a spreadsheet-based favorites + shared-purchase workflow.
- Stack: Next.js + TypeScript + Tailwind CSS + shadcn/ui + Better Auth + Drizzle ORM + SQLite (`better-sqlite3`) + Zod + React Hook Form + Playwright.
- Production target: Railway, one application replica, SQLite on a persistent volume.
- Browser code must never access SQLite directly.
- Authorization is enforced server-side with centralized helpers.
- No public signup UI.
- Only one active purchase per workspace.
- Favorites are personal but visible to the workspace.
- Active purchases are collaborative.
- Finalized purchases are immutable/read-only.
- Purchase items are snapshots; editing/deleting a favorite must never mutate historical purchase data.
- Favorites support **List** and **Cards** views; preference persists per user.
- Never use real listing/product photos. Operational surfaces use local grayscale/clay product archetype visuals; login uses separate local pastel editorial assets.
- The login page is an editorial surface: a central Loti box/symbol with community avatars and shopping/favorite objects orbiting in multiple subtle motion layers. Preserve form simplicity, accessibility and the static reduced-motion fallback. Do not replace this direction with a static centered login card, ecommerce hero, mascot, video background or heavy 3D/WebGL scene. See `docs/17_LOGIN_ORBITAL_MOTION.md`.
- Mobile navigation uses the approved rounded floating island.
- Collections live inside Favorites, not as a primary app section.
- No dashboard.
- No scraping, AI runtime generation, tracking, freight, tax, exchange-rate logic, chat, notifications, realtime, PWA, native app, or marketplace integration in the MVP.

## Mockup branding note

The approved mockups were generated before the final product name was chosen and still display **“Importa”**. Treat that word as a placeholder only. The implementation must display **Loti** everywhere.

## Execution style

Implement phase-by-phase, but continue autonomously between phases. Run lint, typecheck, tests, migrations and build continuously. Fix failures before proceeding. Stop only for a genuine human-only blocker such as missing credentials or an unavailable external account.
