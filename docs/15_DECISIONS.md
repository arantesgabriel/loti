# Final Decisions

This file prevents old alternatives from re-entering implementation.

## Product name

**Loti**.

## Product structure

Final primary areas:

- Favorites
- Active Purchase
- History

Collections are inside Favorites. No dashboard.

## Visual direction

- Bookmark App = structural reference;
- Clozy = component/interaction polish;
- warm orange Loti palette;
- Geist + Lucide;
- desktop sidebar;
- mobile rounded floating navigation island;
- List + Cards favorite modes;
- local grayscale/clay product archetypes;
- no real product photos.

## Final backend architecture

Chosen:

**Next.js monolith + Better Auth + Drizzle + SQLite/better-sqlite3 on Railway persistent volume.**

Rejected for MVP:

### Supabase

Powerful but unnecessary for this five-user private product. Direct browser data API/RLS, managed auth and extra platform services add concepts the MVP does not need.

### Neon/PostgreSQL

Also valid, and likely a future migration target if scaling requirements appear. Rejected for initial MVP because network database + managed auth/service setup is more infrastructure than required.

### Vercel + local SQLite

Rejected because local function/container filesystem persistence is not the right model for a shared persistent SQLite file.

### Turso/libSQL

Valid alternative if serverless/Vercel becomes a hard requirement. Not chosen because Railway + local persistent SQLite is simpler operationally for this MVP.

### PocketBase

Very simple, but would move application architecture toward PocketBase's backend model/API. The selected Next.js + Better Auth + Drizzle stack is nearly as simple while remaining more application-controlled.

### Firebase / document DB

Rejected because the domain is naturally relational and SQL-friendly.

## Authorization

Chosen: centralized server-side authorization helpers. No RLS because the DB is never exposed directly to the browser.

## Realtime

Not needed. Explicit mutation + revalidation/refetch is sufficient.

## Product visuals

Chosen: deterministic keyword → local archetype key. Runtime AI/image generation rejected.

## History

Chosen: purchase-item snapshots. Historical records never read mutable favorite fields as their source of truth.

## Active purchase rule

Exactly one active purchase per workspace, enforced at the database level with a partial unique index and at the application level for user-friendly errors.

## Login visual direction

Chosen: editorial community-orbit composition to communicate **save → organize → buy together**. Desktop uses a split layout with a central Loti box, multiple subtle continuous orbital layers, products and people. Mobile uses fewer objects and a compact composition above the primary form. Motion includes gentle ambient loops, focus/submitting reactions and a fully static reduced-motion fallback.

Use separate local pastel editorial assets. Preserve Better Auth and the existing form behavior. Reject a lone centered card, ecommerce storefront, mascot, video background, heavy 3D/WebGL and animation-delayed login. Detailed contract: [17_LOGIN_ORBITAL_MOTION.md](17_LOGIN_ORBITAL_MOTION.md).
