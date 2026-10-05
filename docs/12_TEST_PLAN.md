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

### Progress

Verify quantity weighting, e.g. one `added` row of quantity 3 counts as 3 units.

### Product visuals

Examples:

- `Nike Vomero 18` → sneaker;
- `Adidas Campus` → sneaker;
- `Ultraboost 5` → sneaker;
- `Crocs Bottom` → clog;
- `WD Blue SN5000 NVMe` → ssd_nvme;
- `Camiseta Uniqlo` → tshirt;
- unknown → generic.

## Integration tests

Use an isolated test SQLite database.

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

## Visual/responsive QA

Primary reference viewports:

- desktop: approximately `1440 × 900`;
- mobile: approximately `390 × 844`.

Also smoke-test:

- 320px narrow mobile;
- 768px tablet;
- 1024px laptop/tablet landscape.

Use the four approved mockups as structural visual references, not pixel-perfect generated-image snapshots.

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
