# Database Schema

## Database

The schema uses Drizzle's SQLite dialect and runs on Turso/libSQL in production through `@libsql/client`. Local development and isolated tests may use a local file or in-memory libSQL database.

Production connection variables are `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. They are server-only and must never use a `NEXT_PUBLIC_` prefix. The schema does not depend on a local production database path, WAL configuration, or a persistent application volume.

Apply versioned files in `drizzle/` explicitly with `npm run db:migrate`. Migrations are not run during requests.

## ID convention

Use text IDs generated application-side (for example `crypto.randomUUID()`) for application entities. Better Auth user IDs remain Better Auth's canonical string IDs.

## Timestamp convention

Use one consistent Drizzle/SQLite timestamp representation for app tables, preferably integer Unix milliseconds (`timestamp_ms`) surfaced to TypeScript as `Date` where supported.

## Better Auth tables

Generated/managed according to the official Better Auth Drizzle/SQLite integration, typically including concepts such as:

- `user`
- `session`
- `account`
- `verification`

Do not hand-roll password/session storage.

## `workspaces`

| Column | Type | Rules |
|---|---|---|
| id | text PK | generated |
| name | text | required |
| created_at | integer timestamp | required |

## `workspace_members`

| Column | Type | Rules |
|---|---|---|
| workspace_id | text FK | required |
| user_id | text FK Better Auth user | required |
| created_at | integer timestamp | required |

Composite unique constraint/index on `(workspace_id, user_id)`.

## `collections`

| Column | Type | Rules |
|---|---|---|
| id | text PK | generated |
| workspace_id | text FK | required |
| owner_id | text FK user | required |
| name | text | required, trimmed |
| created_at | timestamp | required |
| updated_at | timestamp | required |

Deleting a user/workspace should be handled deliberately; not a casual UI operation in MVP.

## `favorites`

| Column | Type | Rules |
|---|---|---|
| id | text PK | generated |
| workspace_id | text FK | required |
| owner_id | text FK user | required |
| collection_id | text FK nullable | `ON DELETE SET NULL` |
| name | text | required |
| url | text | required |
| platform | text | required |
| canonical_product_key | text nullable | indexed, not unique |
| price_cents | integer nullable | `>= 0` when present |
| variant | text nullable | |
| notes | text nullable | |
| qc_status | text | default `not_reviewed`, checked |
| visual_key | text | category key; default `generic` |
| created_at | timestamp | required |
| updated_at | timestamp | required |

QC allowed values:

- `not_reviewed`
- `approved`
- `rejected`

Indexes:

- workspace_id
- owner_id
- collection_id
- canonical_product_key
- created_at as useful for newest-first retrieval

## `purchases`

| Column | Type | Rules |
|---|---|---|
| id | text PK | generated |
| workspace_id | text FK | required |
| name | text | required |
| hubbuy_account | text nullable | free-form email/account metadata |
| status | text | `active` or `finalized` |
| created_by | text FK user | required |
| created_at | timestamp | required |
| finalized_at | timestamp nullable | required when finalized by application logic |

Create a **partial unique index** so only one active purchase exists per workspace, conceptually:

```sql
CREATE UNIQUE INDEX one_active_purchase_per_workspace
ON purchases(workspace_id)
WHERE status = 'active';
```

## `purchase_items`

Migration `0003_*` adds `sharing_mode` (`equal`, `percentage`, `fixed`, default `equal`). The required `person_id` column remains as a compatibility mirror of the first participant by persisted allocation order; it is not used to determine recipients, access, filters or totals after this migration.

| Column | Type | Rules |
|---|---|---|
| id | text PK | generated |
| purchase_id | text FK | required, cascade with purchase only if product chooses permanent purchase deletion tooling later; no delete UI for history in MVP |
| source_favorite_id | text FK nullable | `ON DELETE SET NULL` |
| person_id | text FK user | required |
| created_by | text FK user | required |
| name | text | required snapshot |
| url | text | required snapshot |
| platform | text | required snapshot |
| visual_key | text | required category-key snapshot |
| variant | text nullable | purchase-specific snapshot |
| notes | text nullable | |
| quantity | integer | required, `>= 1`, default 1 |
| unit_price_cents | integer nullable | `>= 0` when present |
| cart_status | text | `pending` or `added`, default `pending` |
| created_at | timestamp | required |
| updated_at | timestamp | required |

Do not store subtotal or total columns.

Indexes:

- purchase_id
- person_id
- cart_status
- source_favorite_id

## `purchase_item_participants`

One row per selected member and physical purchase item. The composite primary key `(purchase_item_id, person_id)` prevents duplicates; `(purchase_item_id, allocation_order)` is also unique. `purchase_item_id` references the item with cascade delete, and `person_id` references `user`. Membership is validated by the purchase domain service.

Fields: `purchase_item_id` (text FK, cascade with item), `person_id` (text FK user), `allocation_order` (integer `>= 0`, stable rounding order), `percentage_bps` (nullable integer from 0–10,000), and `amount_cents` (nullable nonnegative integer). The two financial fields cannot both be set. Domain validation requires mode-appropriate fields and an exact total. Equal shares need neither field. A migration backfills each existing row as one equal participant without changing the item, including finalized history. See [the cost-sharing plan](20_PURCHASE_COST_SHARING_PLAN.md).

## `user_preferences`

| Column | Type | Rules |
|---|---|---|
| user_id | text PK/FK user | one row per user |
| favorites_view | text | `list` or `cards` |
| created_at | timestamp | required |
| updated_at | timestamp | required |

Default view may be `list` because it is closest to the primary Bookmark App reference, unless the final implemented mockup behavior strongly favors cards. The user's explicit selection always persists.

## Derived values

Never persist these:

- purchase item subtotal;
- person total or derived equal/percentage allocation;
- purchase total;
- purchase unit count;
- purchase progress;
- number of no-price items.

Derive physical values once from `purchase_items`; derive participant shares from the physical subtotal and `purchase_item_participants`. Fixed share amounts are explicit inputs and are persisted.

## Category persistence

The existing `visual_key` column is retained as the functional category key (`visualKey` in TypeScript/API). No migration for the visual refactor. No image paths or per-item uploads are persisted. Favorite edits recalculate only their own category; purchase snapshots copy the stored key and remain independent. Unknown stored keys render the generic inline SVG.

## Finalized purchase immutability

The application service/action layer must reject mutations targeting a finalized purchase. This is a server rule and must have integration coverage.

## Invitation extension

`workspace_invitations`: id, workspace_id FK, normalized email, unique token_hash, created_by FK, created_at, expires_at, nullable accepted_at/accepted_by FK, nullable revoked_at/revoked_by FK. State derives from terminal dates and expiration. Partial unique index on workspace/email for unconsumed/unrevoked rows; constraint prevents accepted and revoked dates both being set.

`invitation_limits`: key primary key, integer window and count; persistent shared request limits.

`user_preferences.active_workspace_id`: nullable workspace FK selected by successful invitation acceptance. Central authorization still verifies membership before using it; existing rows use their prior membership context until selection occurs. Favorites view mode remains unchanged.

Migrations: `0001_bouncy_inertia.sql` adds invitation/limiter tables; `0002_loose_shocker.sql` adds active workspace preference. Apply both before deploying invitation code.

## Packages and costs extension

The additive extension in [the phased plan](21_PACKAGES_AND_COSTS_PLAN.md) adds `workspace_cost_settings`, `purchase_cost_trackings`, `purchase_item_costs`, `purchase_cost_participants`, `purchase_packages`, `purchase_package_items`, `purchase_cost_charges`, and `purchase_cost_reopenings`. It keeps the original purchase/item rows immutable and stores all money and percentage weights as bounded integers. Only one tracking row exists per purchase; tracking revision and closed/open state guard its mutations. Legacy purchases receive no automatic tracking row from the migration: a member starts one explicitly. New finalizations create their row and initial cost/package snapshots in the finalization transaction.

Cross-row invariants (package quantities, participant membership/weights, payment completeness and closure readiness) are checked in transactional domain services in addition to SQLite row constraints. Migrations remain explicit and must target a disposable local database for local validation; never run them in request code or against production as part of this implementation.

## Product refund follow-up

Migration `0005_*` adds `purchase_cost_refunds`, `purchase_cost_refund_participants` and `purchase_cost_refund_events`. These records reference the authorized cost tracking/item, preserve original product/China unit bases and payment-fee snapshots, capture participant weights/shares, and append ordered audit events. Money remains nonnegative integer cents; refund values are stored separately from original costs. No refund is inferred from purchase names or migrated automatically. See [the migration and state contract](23_PRODUCT_REFUNDS_PLAN.md#7-modelo-de-dados-proposto-e-migração).

HubBuy QC adds occurrence records scoped to a purchase/workspace, image records scoped to an occurrence, source-URL/content aliases, bounded import manifests/claims, append-only QC events and persistent namespaced limits. Internal IDs are generated server-side; foreign ownership relationships are checked in services. Ready state and deletion tombstones gate gallery visibility. R2 keys are deterministic server-generated metadata, not browser input; tombstones survive manifest cleanup. QC migrations are additive after the real refund baseline and do not alter any existing financial or finalized-snapshot column. See [24 — HubBuy QC import](24_HUBBUY_QC_IMPORT_PLAN.md#5-modelo-de-dados-proposto-e-migração).

QC viewer evolution adds `qc_presentations`, keyed by `purchase_item_id`, with a nullable primary image, optimistic revision and update actor/time. It also adds `qc_image_previews`, one private generated WebP object per QC image, with transform version, bounded output metadata, processing/deletion state, claim and recovery fields. These are additive and are not part of purchase snapshots or cost calculations. Ownership-chain validation stays in the domain service because independent foreign keys cannot prove that the selected ready image is linked to the same purchase item. See [the viewer evolution contract](24_HUBBUY_QC_IMPORT_PLAN.md#14-evolução-de-capa-compartilhada-e-visualizador--fases-1-e-2).

The approved financial extension adds `hubbuy_accounts`, idempotent `financial_operations`, append-only balance entries, individual credit shares, exact consumption links and member-advance entries. Migration `0008_*` introduces this empty ledger foundation; it does not backfill accounts or convert historical BRL refunds into CNY. Subsequent order/payment/refund schema changes are described in [26 — HubBuy balance and mixed payments](26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md). Keep order/item origin exclusive and use rebuild migrations only after preserving every legacy identifier, snapshot and FK.

Migration `0018_amused_mikhail_rasputin.sql` adds nullable `hubbuy_accounts.deleted_at` (integer milliseconds) and `deleted_by` (user FK). Existing rows remain unmarked. Lifecycle triggers enforce paired metadata, archived/zero state, revision increment, immutable tombstones, absence of financial/history references and denial of new references to deleted accounts, including financial/refund JSON events. Physical DELETE remains blocked by the original audit-retention trigger. Future table rebuilds must preserve these custom triggers; `db:verify` checks their presence. See [28](28_HUBBUY_ACCOUNT_DELETION_PLAN.md).

Migration `0019_discard_incorrect_hubbuy_registration.sql` narrows an exception in that eligibility trigger for an explicitly audited incorrect registration: reconciliation-only credits must be fully compensated with linked reversal entries and exact share consumptions, with no operational references or prior use. No table or original financial record is removed or rewritten. This migration does not correct any account automatically. `db:verify` requires the updated guard, as well as the retained triggers.
