# Loti Specification Index

This folder is the canonical product and engineering handoff for the Loti MVP.

Authentication email extension: [`31_AUTH_EMAIL_SECURITY_PLAN.md`](31_AUTH_EMAIL_SECURITY_PLAN.md) specifies Resend, native recovery/verification, pending invitations, legacy compatibility, atomic persistent limits and publication gates.

| File | Purpose |
|---|---|
| `00_CONTEXT.md` | Current spreadsheet workflow, pains and why Loti exists |
| `01_PRODUCT.md` | Product model, users, value proposition and core concepts |
| `02_MVP_SCOPE.md` | Exact MVP boundary and explicit non-goals |
| `03_BUSINESS_RULES.md` | Domain rules, permissions, states and edge cases |
| `04_USER_FLOWS.md` | Human-readable flows for all key journeys |
| `05_INFORMATION_ARCHITECTURE.md` | Routes, navigation, screens, drawers and modals |
| `06_DESIGN.md` | Canonical visual system and responsive behavior |
| `07_PRODUCT_VISUALS.md` | Functional category markers and sparse editorial illustrations |
| `08_TECHNICAL_ARCHITECTURE.md` | Vercel, Turso/libSQL runtime and application boundaries |
| `09_DATABASE_SCHEMA.md` | Canonical SQLite/Drizzle model for Turso and constraints |
| `10_IMPLEMENTATION_PLAN.md` | Ordered build phases |
| `11_ACCEPTANCE_CRITERIA.md` | Feature-level and product-level acceptance criteria |
| `12_TEST_PLAN.md` | Unit, integration, E2E and responsive testing |
| `13_DEPLOYMENT.md` | Vercel + Turso/libSQL deployment model |
| `RESET_PASSWORD.md` | Passo a passo para redefinir senhas pelo comando administrativo |
| `14_LEGACY_MIGRATION.md` | One-time migration from the attached workbook |
| `15_DECISIONS.md` | Final product/technical decisions and rejected alternatives |
| `16_HUMAN_INPUTS.md` | Credentials and deployment inputs that an agent cannot invent |
| `17_LOGIN_ORBITAL_MOTION.md` | Editorial login, orbital motion, responsive behavior and validation |
| `18_WORKSPACE_INVITATIONS_PLAN.md` | Private group invitations, implementation decisions and validation |
| `19_PROFILE_EDITING_PLAN.md` | Profile editing implementation, server rules, sessions, validation and deployment status |
| `20_PURCHASE_COST_SHARING_PLAN.md` | Phased handoff for equal, percentage and fixed-value sharing of purchase item costs |
| `21_PACKAGES_AND_COSTS_PLAN.md` | Phased handoff for packages, manual costs, transaction fees, payments and financial closure |
| `22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md` | Phased refactoring of package costs with progressive disclosure, accurate partial totals and responsive editing |
| `23_PRODUCT_REFUNDS_PLAN.md` | Phased handoff for product/China-freight refunds, cancelled shipping units, preserved payment fees, manual receipt and audit |
| `24_HUBBUY_QC_IMPORT_PLAN.md` | V1 + V1.1 HubBuy QC import plus gated shared-cover/private-preview viewer evolution |
| `26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md` | Approved phased implementation for CNY HubBuy balance, individual rights, explicit advances, mixed payments, refunds and same-tracking additional orders |
| `27_HUBBUY_ACCOUNT_CREATION_UX_PLAN.md` | Implemented local account creation in known zero and atomic account creation during a confirmed refund receipt |
| `28_HUBBUY_ACCOUNT_DELETION_PLAN.md` | Logical deletion of unused HubBuy accounts, retained audit, concurrency guards and local validation |
| `30_REFUNDS_FINANCIAL_READABILITY_PLAN.md` | Approved handoff for remaining-product costs, grouped refund tables, retained cancellation costs and progressive payment history |
| `32_QC_IMPORT_PERFORMANCE_PLAN.md` | Phased execution plan for bounded QC import pipelines, five-photo batches, preview byte reuse, grouped persistence, automatic continuation and synthetic benchmarks |
| `33_QC_VIEWER_PERFORMANCE_PLAN.md` | Implementation plan for private QC preview caching, conditional HTTP revalidation, batched presentation reads, visibility-based loading and performance validation |
| `34_HUBBUY_INDIVIDUAL_RIGHTS_ORIGINS_PLAN.md` | Individual HubBuy rights broken down by remaining product credits, reconciled opening balances and restored credits |
| `35_DARK_MODE.md` | Browser theme preference, semantic light/dark palettes, accessibility and local validation |
| `37_HUBBUY_MANUAL_BALANCE_ADJUSTMENTS_PLAN.md` | Implementation handoff for manual CNY credits/debits, promotional bonuses, audited reversals, individual ownership and zero-BRL refund compatibility |
| `38_HUBBUY_BALANCE_TRACEABILITY_PLAN.md` | Implementation plan for historical balance origins, paid costs, received credits, consumption destinations, exhausted lots and audited restorations per person |
| `39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md` | Complete handoff for Orders/warehouse, packages across purchases in the same account, restricted refunds, conservative legacy migration and a mandatory synthetic development rehearsal |
| `audits/2026-10-17_HUBBUY_BALANCE_AND_MIXED_PAYMENTS.md` | Technical and functional investigation supporting the HubBuy balance and mixed-payment proposal |
| `design/REFERENCES.md` | Figma and palette inspiration URLs |
| `design/PACKAGES_AND_COSTS_REFERENCES.md` | Approved A/B/C/D visual references, images and acceptance for Pacotes e custos |
| `design/MOCKUPS.md` | Approved visual references and interpretation notes |

The root `PROMPT_ONE_SHOT.md` is the final implementation prompt.
