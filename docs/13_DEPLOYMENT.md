# Deployment — Vercel + Turso/libSQL

## Production topology

```text
GitHub repository
  └─ Vercel deployment
       └─ Next.js server functions
            ├─ Better Auth + Drizzle (SQLite provider)
            └─ @libsql/client over HTTPS
                 └─ Turso production database
```

The application is stateless. Production does not use a local SQLite file, writable application filesystem, persistent volume, `better-sqlite3`, or a replica-count restriction.

## Turso databases

Keep production and development data isolated:

- `loti-prod` — production Vercel environment;
- `loti-dev` — local development and optional Preview environment.

Create one database auth token per database and store it only in the matching server-side environment. Never use a platform API token as an application database token. Never commit, log, or expose either credential.

Turso connection variables:

```text
TURSO_DATABASE_URL=libsql://<database-host>
TURSO_AUTH_TOKEN=<database-token>
```

The Vercel production environment uses `loti-prod`. Preview should use `loti-dev` so tests and previews cannot write to production. Local development may use `loti-dev` or a file-backed libSQL URL for offline work.

## Vercel project

Import the current GitHub repository as a Next.js project. Use the repository root and the intended production branch. Let Vercel detect Next.js and use its default build command (`npm run build`). No Dockerfile or Railway configuration is needed.

Vercel uses the following server-side variables:

| Variable | Production | Preview/Development |
|---|---|---|
| `TURSO_DATABASE_URL` | `loti-prod` URL | `loti-dev` URL (or local file for local development) |
| `TURSO_AUTH_TOKEN` | `loti-prod` database token | `loti-dev` database token |
| `BETTER_AUTH_SECRET` | strong random secret, at least 32 characters | separate local/preview secret |
| `BETTER_AUTH_URL` | exact production HTTPS origin | optional for Preview: derives from Vercel branch URL; local uses localhost |

Do not create `NEXT_PUBLIC_` variants of database credentials or the Better Auth secret. Changes to Vercel environment variables take effect only in a new deployment.

For Preview, leave `BETTER_AUTH_URL` unset: authentication and mutation origin checks share the HTTPS branch origin from `VERCEL_BRANCH_URL` (falling back to `VERCEL_URL`). Production has its explicit canonical origin. Open previews through their branch alias so sessions and origin checks use that canonical preview URL.

## Better Auth and URL

After the first deployment, set `BETTER_AUTH_URL` to the real `https://<project>.vercel.app` origin, plus any explicitly configured trusted-origin value if the application adds one. Redeploy after changing it. Keep public signup disabled.

## Migrations

Generate migration files from the schema during development:

```sh
npm run db:generate
```

Apply the reviewed migration set explicitly to the target database before deploying code that depends on it:

```sh
npm run db:migrate
```

Run the command with the target `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the operator environment. Production migrations are not run per request or by the Next.js startup path. Verify the schema after migration with `npm run db:verify` and `/api/health`.

## User bootstrap

The application has no public signup flow. Create the initial private members with the operator command after production migration:

```sh
LOTI_USER_PASSWORD='<secure-initial-password>' npm run user:create -- --name '<name>' --email '<real-address>'
```

Supply actual member addresses and secure initial passwords through a protected operator environment. Do not put production identities or passwords in Git. Existing accounts retain their password when rerun; membership creation is idempotent.

## Health check

`GET /api/health` runs a minimal database query and returns `{"status":"ok","database":"ok"}` when the application and Turso are reachable. Failure returns HTTP 503 without credentials or schema details.

## Data import and preservation

The supplied spreadsheet is private migration input and is not bundled in Git. Review `docs/14_LEGACY_MIGRATION.md`. Map each workbook owner to an already-created production user. Confirm whether `Compra Out26` is still active before execution. Run the dry-run report first; execute the import only after reviewing it. The importer is idempotent and does not mutate records already imported.

The previous local database contains development seed identities (`@loti.test`) and is not production data. It remains intact locally. No inaccessible Railway data is represented as migrated.

## Backups and recovery

Use the backup/restore controls available for the Turso database plan. Keep production and development recovery procedures separate. Before restoring production, confirm the target database and expected data-loss window; test the restore procedure against a non-production copy when available. After recovery, verify `/api/health`, login, favorites, active purchase, and history.

## Deployment checklist

1. Create or verify `loti-prod` and `loti-dev`.
2. Apply reviewed migrations to both databases.
3. Connect the GitHub repository to Vercel and set production/preview variables.
4. Deploy from the intended production branch.
5. Set `BETTER_AUTH_URL` to the final HTTPS URL and redeploy.
6. Verify `/login` and `/api/health` publicly.
7. Bootstrap actual private users; keep public signup disabled.
8. If importing the workbook, review the mapping and dry-run before writing.
9. Test login, session refresh, favorites, purchase, history, and one write/read round-trip against `loti-prod`.

## Deploying invitations

Apply migrations `0001` and `0002` explicitly to the target database before deploying the invitation code. No new service credentials or email provider are required. Generated links and origin validation use the same `authOrigin()` as Better Auth; configure `BETTER_AUTH_URL` for the intended public deployment. Keep Preview and Production databases distinct. Verify Profile → Meu grupo → invite → new account and existing account acceptance after deployment. Invitation links are bearer credentials; account for token paths in hosting access logs and do not share them publicly.
