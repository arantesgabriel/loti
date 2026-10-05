# Deployment — Railway + SQLite

## Production topology

One Railway service runs the Next.js Node server and Better Auth. A Railway persistent volume stores the SQLite file.

```text
Railway service
  Next.js
  Better Auth
  Drizzle
  better-sqlite3
      |
      v
/data/loti.sqlite
      |
Railway persistent volume
```

## One replica

Run exactly **one application replica** while using local SQLite. Do not enable horizontal autoscaling/multiple replicas.

If the product later requires multiple app replicas, that is a trigger to migrate the persistence layer to a network database such as PostgreSQL; do not attempt shared local-file hacks.

## Volume

Mount a persistent volume at:

`/data`

Production DB path:

`/data/loti.sqlite`

## Environment variables

Minimum expected variables:

```text
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://<production-domain>
DATABASE_PATH=/data/loti.sqlite
```

Add only variables actually required by the final Better Auth/Next.js configuration.

Development example:

```text
BETTER_AUTH_URL=http://localhost:3000
DATABASE_PATH=./data/loti.sqlite
```

Never commit secrets.

## Migrations

The database lives on the mounted volume. Ensure migrations execute in a context that actually has volume access.

Preferred production start lifecycle:

1. application container starts with volume mounted;
2. run pending Drizzle migrations safely;
3. start Next.js server.

For one replica, a simple sequential start script is acceptable. Migrations must be idempotent and safe to re-run when no pending migration exists.

## Health endpoint

Provide `/api/health` or equivalent that checks application/database reachability without exposing secrets, schema contents or user information.

## Backups

Enable/document Railway volume backups, ideally:

- daily;
- weekly;
- monthly.

Also document how to restore a backup before production use. A backup that has never been tested/documented is not considered sufficient.

## Initial production setup

Human/operator steps:

1. create/connect Railway project;
2. attach persistent volume at `/data`;
3. set environment variables;
4. deploy;
5. create initial private users with operator script;
6. ensure all five users are members of the singleton workspace;
7. optionally run legacy migration;
8. configure backups;
9. verify health endpoint and auth from production domain.

## Domain

Use Railway-provided domain initially if desired. A custom domain is optional for MVP.

## Future migration triggers away from SQLite

Consider PostgreSQL only when real needs appear, such as:

- horizontal scaling/multiple replicas;
- sustained concurrent writes;
- many simultaneous users;
- multiple services writing to the same DB;
- HA requirements;
- operational analytics requiring a network DB.

Do not migrate merely because the favorite count grows from hundreds to thousands.
