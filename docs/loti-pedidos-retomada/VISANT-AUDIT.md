# Audit: src/components/orders

## Surfaces

One row per screen. **Fill this in before fixing anything.** Classifying
after changing things is justifying what was already done.

- **A acquisition**: whoever is not a customer yet. Persuade, prove, convert.
- **B work**: whoever uses it every day. Speed, density, keyboard.
- **C trust**: money, permission, destructive action. It cannot lie.

Applying A instincts to a B screen is the most expensive Visant frontend mistake.

| File | Surface (A/B/C) | Business variable it moves | Notes |
|---|---|---|---|
| src/components/orders/logistics-package-detail.tsx |  |  |  |
| src/components/orders/logistics-packages-screen.tsx |  |  |  |
| src/components/orders/order-detail-panel.tsx |  |  |  |
| src/components/orders/order-item-actions.tsx |  |  |  |
| src/components/orders/order-preparation-panel.tsx |  |  |  |
| src/components/orders/orders-catalog.tsx |  |  |  |
| src/components/orders/orders-context-surface.tsx |  |  |  |
| src/components/orders/orders-filter-surface.tsx |  |  |  |
| src/components/orders/orders-qc-import.tsx |  |  |  |
| src/components/orders/orders-screen.tsx |  |  |  |
| src/components/orders/orders-stepper.tsx |  |  |  |
| src/components/orders/orders-workspace.tsx |  |  |  |

## Screen seen

One row per screen OPENED, with what was seen. Without this the gate does not
open: a frozen AnimatePresence passes tsc, ESLint, motion-lint, impeccable,
audit:design and copy-lint without lighting anything up.

Each row carries: route, width, data state, and what happened.
Before measuring anything, check that the page hydrated (see
`visant-killer/references/environment.md`): half the findings of one session
were the dev server lying, not the screen.

-

## Findings

