# Decision: Vercel + Turso/libSQL

## Status

Accepted — 5 October 2026

## Previous

Railway + persistent volume + local SQLite through `better-sqlite3`, with the production database at `/data/loti.sqlite`.

## New

Vercel hosts the Next.js application. Turso/libSQL stores the SQLite-compatible database remotely. The application uses Drizzle's SQLite schema dialect with `@libsql/client`; Better Auth continues to use its Drizzle adapter with `provider: "sqlite"`.

## Why

- Keep infrastructure cost at zero for the current usage.
- Remove dependence on a writable persistent application filesystem.
- Preserve SQLite, Drizzle, Better Auth, and the existing domain schema.
- Minimize changes to domain behavior.
- Support serverless deployment on Vercel.
- Simplify infrastructure and Git-based deployments.

## Consequences

### Positive

- No application volume or container state is required.
- Deployments are Git-based.
- The database is independent of the application runtime.
- The existing SQLite schema and Better Auth provider remain in place.

### Trade-offs

- The application now depends on the remote Turso service.
- Database credentials must be stored in server-side environment variables.
- Database access is asynchronous and remote latency becomes part of request handling.

## Compatibility

The schema remains SQLite. This decision does not introduce PostgreSQL, Supabase, Neon, RLS, or real-time subscriptions. Migrations are applied explicitly; they are not run per request.
