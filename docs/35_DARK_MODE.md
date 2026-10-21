# Dark Mode — implementation and local validation

Date: 20 October 2026. Authorized after the technical investigation. Scope: presentation only, with Claro, Escuro and Sistema. No dependency, schema, migration, backend or external configuration change is required.

## User behavior

Profile → Aparência changes the theme immediately. The `loti.theme` localStorage key holds `light`, `dark` or `system`. Missing/invalid storage defaults to light, preserving the current experience. A shared browser keeps its preference through logout and account changes; this intentionally does not synchronize devices or attach appearance to financial/workspace data. Blocked storage permits an in-memory choice until a full reload.

System mode follows `prefers-color-scheme` changes. Explicit light/dark ignores OS changes. Storage events synchronize other tabs, including removal/clear. Theme selection does not remount the app, reset a form, alter requests or invalidate QC client caches.

## Architecture

- `src/lib/theme.ts`: typed preferences, self-contained head bootstrap and browser subscription lifecycle. The root gets `data-theme` and `data-theme-preference` before React paints. Only valid values reach those attributes.
- `src/components/theme-provider.tsx`: a small independent React context backed by `useSyncExternalStore`; the deterministic server snapshot avoids hydration-dependent markup. The root layout suppresses only its intentional root-attribute difference.
- `src/app/theme.css`: light/dark semantic tokens, theme-choice styles and Sonner palette alignment. `globals.css` imports it through the existing Tailwind 4 pipeline.
- `src/components/profile/profile-theme.tsx`: native radio group with Claro/Escuro/Sistema, visible focus and browser-specific help.
- Existing financial V4, account notice, login and QC transfer styles consume tokens. Existing component geometry and business conditions are unchanged. The Sonner instance receives the resolved theme.

The root attribute covers Radix portals under body as well as unauthenticated routes. CSS `color-scheme` follows the resolved theme for native browser controls. Avoid a theme attribute on a page-local wrapper and avoid adding `dark:` copies of every component.

## Visual boundaries

Dark uses warm neutral background/surfaces with restrained borders and orange actions. Financial partial/paid/refund states keep their existing labels and conditions. Text, surface, focus, success, error, warning and information colors have separate semantic roles. `--brand` no longer doubles as text on orange buttons or the profile avatar background.

Light surface/layout values are preserved. Limited accessibility corrections darken the primary hover, financial audit/accent and account link colors, and strengthen input/checkbox borders. These are theme-related contrast corrections, not a layout redesign.

QC image bytes, previews, source/fallback requests, matching, cover associations, storage and cache are untouched. The viewer stays a dark stage under either app theme and defines its own local surface/text tokens. The black external import icon is replaced by the existing currentColor Lucide icon. No additional QC imagery or presentation surface is introduced. Login keeps the actual existing story carousel and its assets/motion; this task does not reconcile the older orbital documentation by rebuilding the login.

For future styles, reuse the closest semantic token. If a role differs (for example text on a destructive fill versus an error message), create an explicit role in both palettes instead of changing a global text token into a background color.

## Validation

New unit tests exercise preference lifecycle and actual palette contrast. New browser tests exercise pre-hydration behavior, keyboard selection, System updates, persistence, blocked storage, cross-tab drafts/focus, responsive routes and unchanged financial DTOs/snapshots. Existing login, favorite, purchase, account, invitation, recovery, profile and QC journeys are reused in both themes where applicable.

Local captures are under `artifacts/qa/dark-mode/`: `before/`, preliminary `after/` and test-verified `verified/`. All data is synthetic and databases are disposable. Browser QA uses the installed Chromium; Safari/iOS real-device validation and hosted production behavior are not claimed. Automated palette checks do not certify every composed rendered screen for WCAG conformance.

### Results

- TypeScript passed with `npm run typecheck -- --incremental false`; ESLint passed without warnings. The nonincremental check avoids stale generated Next type caches in this shared Windows checkout.
- The final production build passed in the isolated `.next-dark-mode` directory, with an explicit disposable local SQLite URL and local-only auth settings.
- All 15 new theme/lifecycle/contrast unit tests passed.
- The complete Vitest run reported 424 passed, 7 skipped and 2 `SQLITE_BUSY` failures across 433 cases. Repeating the two affected files in isolation passed 17/18: all nine account-deletion races passed, while the identical additional-order correction race still returned one success and one `SQLITE_BUSY`. That exact failure was reproduced against a disposable archive of the unchanged baseline HEAD `663c315` (8/9 passed). No financial service or retry policy was changed to make the theme task pass. The global Vitest suite is therefore **not fully green** on this host.
- The final dark browser regression passed 30/30, covering themes, login/motion, Favorites, Purchase/History, account balances/rights, invitations, recovery, refunds and responsive keyboard dialogs.
- The light regression passed 29/30 before identifying an obsolete nested refund toggle in the test. After aligning the test with the existing flat refund layout, the refund journey passed separately together with all three selected QC journeys (4/4). The account test's old “Direitos individuais” locator was similarly aligned to the existing “Saldo por pessoa” label. These are test expectation corrections, not product layout changes.
- The final isolated dark QC/Profile run also passed 4/4: manual photo association/import completion, selected cover and distinct previews on desktop/mobile, exact-image navigation across gallery pages, and profile name/password/session changes. QC media and storage were simulated, never live HubBuy/R2 resources.
- The 56 optional theme captures include both palettes on public/authenticated routes at 390/1440 px, plus financial and history detail. Automated geometry checks also cover 320/768/1024 px. Representative Login, Favorites, Profile and financial desktop/mobile captures were visually inspected.

No production deployment, remote database access, R2 operation or migration was executed. Browser fixture setup and integration tests apply existing migrations only to their disposable local databases.
