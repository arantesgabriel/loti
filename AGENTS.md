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
- Stack: Next.js + TypeScript + Tailwind CSS + shadcn/ui + Better Auth + Drizzle ORM + SQLite schema dialect via Turso/libSQL (`@libsql/client`) + Zod + React Hook Form + Playwright.
- Production target: Vercel + Turso/libSQL. Local development may use a file-backed libSQL database.
- Production must not depend on a writable local filesystem, Railway persistent volumes, or `better-sqlite3`. Better Auth remains on the Drizzle adapter with `provider: "sqlite"`; database access uses server-only environment variables `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- Migrations are applied explicitly to the target database; never run them inside a request lifecycle or automatically per request.
- Browser code must never access SQLite directly.
- Authorization is enforced server-side with centralized helpers.
- No public signup UI. Token-gated private invitations are approved: Profile → Meu grupo → email → generated link → acceptance → Favorites. See `docs/18_WORKSPACE_INVITATIONS_PLAN.md`.
- Only one active purchase per workspace.
- Favorites are personal but visible to the workspace.
- Active purchases are collaborative.
- Finalized purchases are immutable/read-only.
- Purchase items are snapshots; editing/deleting a favorite must never mutate historical purchase data.
- Favorites support **List** and **Cards** views; preference persists per user.
- Never use large product images, real product thumbnails, or generic 3D product renders inside operational product cards/lists. Favorites, Purchase, History and item drawers use small functional category markers. Visor-inspired soft 3D/pastel illustrations are reserved for sparse editorial/branding surfaces such as login, empty states, collection covers and marketing. No new editorial surfaces are required by this rule.
- Persist category keys in the existing `visual_key` fields, including independent purchase snapshots. Use `resolveProductCategory()` and the internal SVG marker library; do not restore the removed product render assets.
- The login page is an editorial surface: a central Loti box/symbol with community avatars and shopping/favorite objects orbiting in multiple subtle motion layers. Preserve form simplicity, accessibility and the static reduced-motion fallback. Do not replace this direction with a static centered login card, ecommerce hero, mascot, video background or heavy 3D/WebGL scene. See `docs/17_LOGIN_ORBITAL_MOTION.md`.
- Mobile navigation uses the approved rounded floating island.
- Collections live inside Favorites, not as a primary app section.
- No dashboard.
- No scraping, AI runtime generation, tracking, freight, tax, exchange-rate logic, chat, notifications, realtime, PWA, native app, or marketplace integration in the MVP.

## Mockup branding note

The approved mockups were generated before the final product name was chosen and still display **“Importa”**. Treat that word as a placeholder only. The implementation must display **Loti** everywhere.

## Execution style

Implement phase-by-phase, but continue autonomously between phases. Run lint, typecheck, tests, migrations and build continuously. Fix failures before proceeding. Stop only for a genuine human-only blocker such as missing credentials or an unavailable external account.
