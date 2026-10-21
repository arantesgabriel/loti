# Sidebar refinement — 21 October 2026

User reference: slim navigation with bottom settings, appearance switch and a separated profile row. Desktop sidebar now supports a persistent icon-only state (`loti.sidebar.collapsed`); mobile retains the floating navigation island. Collection shortcuts remain available in expanded Favorites.

The shared theme preference remains `loti.theme`, including System in Profile. The sidebar switch selects explicit light/dark. The sun uses the bookmark's primary orange in light mode; in dark mode it becomes muted and the moon gains a lilac highlight. CSS coordinates icon rotation, thumb travel and palette transitions. Reduced motion disables those transitions. No new dependency or domain/database change.

Validation: TypeScript, ESLint, 15 theme unit/contrast tests and isolated production build passed. Chromium browser regression passed (1/1). Browser regression lives in `tests/e2e/sidebar.spec.ts` and covers keyboard toggle, collapse persistence, navigation and mobile/reduced-motion behavior. Local screenshots are written under `artifacts/qa/sidebar/`.

## Follow-up: script and session errors

The root theme bootstrap now uses Next Script with `beforeInteractive`, so client recovery/navigation no longer attempts to mount an executable raw script. Its browser regression exercises default/stored theme, navigation, reload, keyboard, login/logout and captures console errors. The previous test that blocked every Next bundle was removed: Next manages beforeInteractive execution through its bootstrap, before React hydration.

A read-only connection check against the configured development database returned HTTP 401. This is an external credential blocker; no token, remote schema or remote data was changed. `requireUser` now distinguishes rejected/missing sessions (401) from failed session storage (503 / SESSION_UNAVAILABLE). Protected pages show a retry state for the latter, and API consumers receive the controlled error rather than an unhandled Better Auth exception. Unexpected programming errors still propagate. Logs include only the auth error code/status.

Validation: 19 unit tests and three Chromium scenarios passed; TypeScript and targeted ESLint passed. Restoring actual development database access requires a valid TURSO_AUTH_TOKEN in the local environment and a server restart.
