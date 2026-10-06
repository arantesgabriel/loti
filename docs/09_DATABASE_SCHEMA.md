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
- person total;
- purchase total;
- purchase unit count;
- purchase progress;
- number of no-price items.

Derive them from `purchase_items`.

## Category persistence

The existing `visual_key` column is retained as the functional category key (`visualKey` in TypeScript/API). No migration for the visual refactor. No image paths or per-item uploads are persisted. Favorite edits recalculate only their own category; purchase snapshots copy the stored key and remain independent. Unknown stored keys render the generic inline SVG.

## Finalized purchase immutability

The application service/action layer must reject mutations targeting a finalized purchase. This is a server rule and must have integration coverage.
