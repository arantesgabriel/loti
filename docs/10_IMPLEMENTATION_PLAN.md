# Implementation Plan

Implement in this order. Each phase must leave the repository in a passing build/test state before moving on.

## Phase 01 — Foundation

- initialize/normalize Next.js TypeScript app;
- TypeScript strict;
- Tailwind;
- shadcn/ui foundation;
- Geist;
- Lucide;
- ESLint and formatting conventions;
- Drizzle;
- Better Auth;
- Zod;
- React Hook Form;
- Playwright;
- `.env.example`;
- initial folder structure;
- basic scripts for lint/typecheck/build/test.

Gate: local app starts; lint, typecheck and build pass.

## Phase 02 — Database

- Better Auth schema/integration;
- application Drizzle schema;
- migrations;
- Turso/libSQL runtime through `@libsql/client` and the existing SQLite schema dialect;
- explicit migration command for local and remote databases;
- partial unique active-purchase index;
- constraints/indexes;
- dev seed foundation;
- migration command using the libSQL migrator.

Gate: empty DB migrates successfully; constraints tested.

## Phase 03 — Authentication and authorization

- Better Auth email/password;
- `/login` with the editorial community-orbit composition specified in `17_LOGIN_ORBITAL_MOTION.md`: desktop split, compact mobile, three motion layers, upright subjects and static reduced motion;
- protected app layout;
- logout;
- no public signup;
- `scripts/create-user.ts` or equivalent operator command;
- singleton/default workspace bootstrap/member assignment;
- centralized authorization helpers.

Gate: session works; favorite ownership/workspace access integration tests pass; login focus/loading/error, Enter, redirect/logout and responsive/reduced-motion E2E pass.

## Phase 04 — Application shell

- desktop sidebar;
- mobile rounded navigation island;
- active navigation states;
- page container/header primitives;
- profile/logout affordance;
- design tokens and responsive foundations.

Gate: responsive checks at 390/768/1024/1440 widths.

## Phase 05 — Favorites

- Favorites page;
- Todos/Meus;
- search;
- filters;
- list/card toggle persisted to user preferences;
- favorite card/list components;
- detail sheet;
- create/edit/delete;
- platform detection;
- URL canonicalization/duplicate warning;
- QC;
- external product opening;
- add-to-purchase entry point;
- category resolver and small inline SVG marker integration.

Gate: all Favorites acceptance criteria + E2E flow pass.

## Phase 06 — Collections

- integrated collection navigation;
- create/rename/delete;
- owner-only mutations;
- deleting collection sets favorite collection to null;
- collection filtering.

Gate: collection tests pass.

## Phase 07 — Active Purchase

- empty state/create purchase;
- one-active-purchase enforcement;
- header metadata;
- total/progress;
- Todos/Pendentes/Adicionados;
- person summaries;
- grouped item list;
- add from favorite;
- add manual item;
- edit/remove item;
- quantity/pricing;
- no-price states;
- pending/added toggle;
- finalize with warnings;
- finalized mutation protection.

Gate: purchase calculations, permissions and E2E flows pass.

## Phase 08 — History

- history list;
- historical detail;
- reuse read-only purchase components;
- direct URL access;
- verify immutability.

Gate: finalize→history E2E passes.

## Phase 09 — Functional category markers

The resolver may be built earlier to unblock Favorites, but this phase completes it:

- full initial key list;
- keyword normalization/matching;
- internal vector marker library, with consistent neutral strokes;
- compact Cards/List/Purchase/History and drawer representation;
- separate sparse editorial illustration direction inspired by Visor Finance;
- generic fallback;
- unit tests using names from the legacy workbook and mockups.

Gate: no real remote product images or large 3D item renders; Cards/List and Purchase/History inspected at 390/1440px. Existing `visual_key` persistence and independent snapshots require no migration.

## Phase 10 — Legacy migration

- implement one-time workbook importer;
- map users/collections/purchases;
- preserve useful values;
- make execution idempotent;
- dry-run/report mode if practical;
- validate totals/counts after migration.

Gate: repeated run does not duplicate imported data.

## Phase 11 — QA and production readiness

No new features.

- fix lint/type/build/test issues;
- Playwright critical flows;
- accessibility pass;
- visual QA against four mockups;
- production env docs;
- Vercel production environment and Turso connection;
- explicit remote migration step before deploy;
- health endpoint;
- Turso backup/recovery guidance;
- final build.

## Autonomous execution rule

Do not stop for approval between phases. Stop only for a genuine human-only blocker (credentials, external account login, domain ownership, etc.). Bugs and documented design decisions are not blockers; solve them and continue.

## Private invitation extension

Implementation order: additive schema → atomic invitation services and integration/race tests → Meu grupo API/UI → public acceptance and login return → browser journeys and existing regression checks → migrations and build. Detailed decisions and acceptance criteria: `18_WORKSPACE_INVITATIONS_PLAN.md`.
