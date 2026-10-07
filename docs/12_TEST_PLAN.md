# Test Plan

## Unit tests

At minimum cover:

### URL/platform

- detect HubBuy;
- detect Weidian;
- detect Taobao;
- detect 1688;
- detect Goofish;
- detect Shopee;
- detect Shein;
- unknown → other;
- canonicalization ignores known tracking/referral noise without changing original URL.

### Money

- BRL parsing where used;
- integer cents;
- formatting;
- null price behavior;
- subtotal;
- person total;
- purchase total.
- equal, percentage and fixed allocations; exact-cent closure, deterministic largest-remainder rounding, null/zero pricing and safe limits;
- personal share totals distinct from physical total/units/progress.

### Progress

Verify quantity weighting, e.g. one `added` row of quantity 3 counts as 3 units.

### Product categories

Examples:

- `Nike Vomero 18` → sneaker;
- `Adidas Campus` → sneaker;
- `Ultraboost 5` → sneaker;
- `Crocs Bottom` → clog;
- `WD Blue SN5000` → ssd_nvme;
- `SSD NVMe` → ssd_nvme;
- `Camiseta Uniqlo` → tshirt;
- unknown → generic;
- corrupt stored key → generic marker;
- all initial category keys, accent/case normalization and ordered NVMe/SATA matching.

## Integration tests

Use isolated in-memory databases through `@libsql/client` and Drizzle's libSQL dialect.

Cover:

- workspace membership;
- favorite owner permissions;
- collection owner permissions;
- only one active purchase;
- add-favorite snapshot behavior;
- editing favorite after snapshot;
- deleting favorite with purchase snapshot;
- active purchase collaborative edits;
- finalized purchase mutation rejection;
- collection deletion preserving favorites;
- quantity/price constraints.
- additive participant backfill for active and finalized purchases;
- atomic item + participant creation/update/removal, membership validation, global status, finalized immutability and concurrent finalization;
- legacy input compatibility and rejection of ambiguous mixed payloads.

## E2E — Playwright

### E2E 01: Favorite lifecycle

`Login Gabriel → create favorite → find it → edit it`.

### E2E 02: Ownership

`Login Brunna → view Gabriel favorite → verify no supported edit/delete capability and server rejects attempted mutation`.

### E2E 03: Add to purchase

`Favorite → + Compra → change quantity/price → add → totals reflect values`.

### E2E 04: Collaborative ownership target

`Gabriel adds item for Brunna → purchase groups it under Brunna`.

### E2E 05: HubBuy operational flow

`pending item → mark added → progress changes → Pendentes filter removes it`.

### E2E 06: Finalization

`Finalize → appears in history → detail read-only → mutation rejected`.

### E2E 07: View preference

`Cards → List → reload/login again → List remains selected`.

### E2E 08: Mobile navigation

At mobile viewport, verify rounded island navigates Favorites/Purchase/History and active destination changes.

### E2E 10: Purchase controls

Verify the draggable estimated-total carousel shows all, pending, and added values; favorite actions reflect active-purchase membership and reset after removal; desktop purchase actions are separate; and the floating plus appears only when the heading add action leaves the viewport.

### E2E 11: Purchase cost sharing

Create one R$ 300 physical item shared by three members; verify each sees R$ 100, the overall purchase remains R$ 300/one unit, all groups share one status, and deletion applies to everyone. Repeat with percentage and fixed-value allocations and test invalid closure/revision behavior. Follow the BRL examples and exact expected values in [the phased cost-sharing plan](20_PURCHASE_COST_SHARING_PLAN.md).

## Visual/responsive QA

Primary reference viewports:

- desktop: approximately `1440 × 900`;
- mobile: approximately `390 × 844`.

Also smoke-test:

- 320px narrow mobile;
- 768px tablet;
- 1024px laptop/tablet landscape.

Use the four approved mockups as structural visual references, not pixel-perfect generated-image snapshots. Their large operational product renders are superseded by small category markers.

Verify Cards AND List at every reference width. At 390/1440px inspect screenshots for text hierarchy and compact markers; ensure items contain no images, markers are decorative and purchase status is more prominent. Inspect read-only history and item detail markers too. Screenshots: `artifacts/qa/favorites-{cards,list}-{mobile,desktop}.png`, `purchase-{mobile,desktop}.png`, `history-{390,1440}.png`.

## Accessibility smoke checks

- tab navigation;
- focus visibility;
- dialogs trap/restore focus;
- labels/accessible names;
- sufficient contrast;
- touch target sizing;
- no color-only status.

## Required CI/local gate

The exact scripts may differ, but the repository must support one predictable quality gate equivalent to:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Fix failures before declaring completion.

## E2E 09 — Login editorial scene and auth regression

`tests/e2e/login.spec.ts` covers four scenarios:

1. Split vs compact layouts at 320/390/768/1024/1440 px, form accessibility, local asset loading and no horizontal overflow.
2. Actual orbital displacement and upright orientation at each quadrant of every full revolution, including reverse motion.
3. Reduced motion: no login animations, balanced static scene and no focus-driven radius transition.
4. Keyboard focus, email/password visual states, invalid password, Enter, held-request loading, success redirect, session after reload, logout and protected-route denial.

Visual QA captures `artifacts/qa/login-{320,390,768,1024,1440}.png` and `login-reduced-motion.png`. Inspect desktop, tablet, mobile and reduced-motion screenshots against `design/mockups/login-orbital.png`. The complete suite currently has twelve Chromium scenarios. See `17_LOGIN_ORBITAL_MOTION.md`.

## Invitation coverage

`tests/integration/invitations.test.ts`: membership boundaries, token hashing, expiry/regeneration/revocation, credentials, rollback on injected membership failure, existing-account requirements, active workspace and persistent limits.

`tests/integration/invitation-concurrency.test.ts`: independent file-backed database connections exercising concurrent issuance, acceptance and acceptance/revocation.

`tests/unit/auth-redirect.test.ts`: only invitation paths may be login return destinations.

`tests/e2e/invitations.spec.ts`: generate/share UI, new mobile signup/session/reload, existing account and wrong-session switching, regeneration/revocation, unauthorized APIs, origin checks, external redirect denial and recovery after session failure. Screenshots under `artifacts/qa/group-{desktop,mobile}.png` and `invitation-mobile.png`.

`tests/integration/invitation-migration.test.ts` validates upgrade from the prior schema with existing users, membership, favorites and view preference, including repeat migration.

## Profile editing coverage

`tests/unit/profile-validation.test.ts` covers display-name boundaries/trim, strict payloads, password length without normalization, confirmation and immediate reuse.

`tests/integration/profile.test.ts` uses isolated libSQL and real Better Auth HTTP handlers to verify origin/session/membership guards, self-only name updates, unchanged other users, incorrect/reused passwords, current-session rotation, forced other-session revocation and old/new credential behavior.

`tests/e2e/profile.spec.ts` uses a dedicated disposable account created by the isolated E2E server. It covers name persistence and group visibility, password field visibility/cancel/focus, validation and current-password errors, other-session denial, old/new login, and responsive widths from 320 to 1440 pixels.

## Packages and costs extension coverage

Follow the scenario matrix in [the implementation plan](21_PACKAGES_AND_COSTS_PLAN.md#9-matriz-mínima-de-testes). Unit coverage exercises safe-cent fees, proportional largest-remainder allocation, unit distribution, participant weights, pending/zero/no-charge states and incomplete totals. Integration coverage exercises explicit old-purchase start, atomic finalization, idempotency, authorization, revision conflicts, quantity coverage, payment invalidation, close/reopen and migration from the prior schema. Playwright covers the fourth navigation destination, finalized purchase → costs, one and multiple packages, manual payment previews, group defaults, partial values and responsive layouts.

Use only isolated libSQL databases. Do not point local migration checks at `TURSO_DATABASE_URL` from `.env`; supply an explicit disposable `file:` target and never migrate production in this task.
