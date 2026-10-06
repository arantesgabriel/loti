# Login — editorial community orbit

Approved direction implemented and validated on 5 October 2026. Reference: [user-approved mockup](design/mockups/login-orbital.png). The reference guides composition rather than requiring a pixel-perfect reproduction.

## Purpose and boundary

Communicate **save → organize → buy together** through a central Loti box, shopping/favorite objects and generic community portraits. Login is an editorial surface, separate from the operational functional category markers. Keep the form simple and primary. Do not turn this into an ecommerce storefront, mascot, centered form without the scene, video background or heavy 3D/WebGL experience.

No authentication business logic changed. Better Auth configuration, API handler, validation, React Hook Form registration, sessions, cookies, errors, redirects and logout retain their existing behavior. There is no delayed success animation before navigation.

## Implementation

- New `src/components/login/orbital-scene.tsx`: decorative scene, three orbital layers, local images and visual interaction state.
- New `src/app/login/login.css`: scoped split layout, motion, responsive simplification and static reduced-motion fallback.
- Updated `src/app/login/page.tsx`: scene beside the existing form; brand inside the form card; focus capture listeners and `aria-busy` feedback. Capture listeners preserve React Hook Form's existing blur handlers.
- Updated `src/app/globals.css`: removed superseded login styles only.
- New `tests/e2e/login.spec.ts`: responsive layout, actual orbital displacement, orientation throughout a full revolution, reduced motion and complete authentication lifecycle.

CSS transform animations and React state suffice. No motion dependency, animation frame loop, canvas, external asset request, runtime image generation, or database change was introduced.

## Assets

Twelve local SVGs under `public/login-visuals/`, approximately 14 KB combined:

- `loti-box.svg`: orange central symbol with soft dimensional highlights;
- `bookmark.svg`, `bag.svg`: original illustrated favorite/shopping objects;
- `avatar-1.svg` through `avatar-4.svg`: original generic portraits, not real identities;
- `sneaker.svg`, `headphones.svg`, `smartphone.svg`, `tshirt.svg`, `package.svg`: independent editorial SVGs originally derived from the former operational archetypes; their sources are no longer runtime dependencies.

The later category-marker refactor removed the operational product renders; these login assets remain independent and unchanged. Editorial assets have pastel backplates, restrained depth, no marketplace photography or brand marks. The supplied mockup is a reference only; none of its product imagery is used by the runtime.

## Motion system

| Layer | Diameter relative to scene | Revolution | Direction | Objects |
| --- | --- | --- | --- | --- |
| Inner | 46% | 44 s | Clockwise | Bookmark and three small particles |
| Middle | 70% | 72 s | Counterclockwise | Sneaker, headphones, shirt, phone |
| Outer | 88% | 108 s | Clockwise | Four portraits, package, bag |

Individual initial angles prevent aligned starts. Each object uses equal, opposite counterrotation, keeping portraits/products upright throughout the orbit. Independent 6.5–13 s ambient cycles move objects from −2 to +3 px and −1° to +1°. The central symbol breathes from scale 1 to 1.015 over 9 s. Form entrance lasts 300 ms; normal feedback lasts 180–250 ms. Nothing blocks typing or submitting.

- **Idle:** continuous motion at the durations above.
- **Email focus:** radii contract 2%; central symbol gets a restrained highlight.
- **Password focus:** radii contract 3%; ambient object oscillation pauses.
- **Submitting:** radii contract 6%; ambient oscillation pauses; existing disabled `Entrando…` feedback and redirect remain immediate.
- **Blur/error:** no shaking or disruptive scene effect; blur restores idle, and the existing inline error remains readable.
- **Reduced motion:** all login animations/transitions stop; initial angles remain an intentional static composition; interactive radius contraction is disabled.

Focus responses deliberately change spatial scale rather than animation duration, avoiding phase jumps mid-orbit. Scene elements are `aria-hidden`, have empty image alternatives, no pointer events and no keyboard stops.

## Responsive behavior

At 900 px and above, the illustration and form use a split layout; the form remains a distinct white surface. At 768 px, the compact scene sits above the form. Below 900 px, only bookmark, sneaker, headphones and two portraits remain, with two visible orbital paths. The mini orbit is flattened into an ellipse while inverse vertical scaling keeps the illustrations undistorted.

At 390 px, the scene is 156 px high; the form and submit fit within 844 px. At narrow widths below 360 px or short mobile heights, the scene drops to 100 px and omits the bookmark layer. Horizontal overflow is clipped at the scene/page boundary. Desktop motion and mobile motion share the same orientation guarantees.

## Validation

- ESLint and TypeScript strict passed.
- All 90 Vitest tests passed: 52 unit and 38 SQLite integration tests.
- All 12 Playwright Chromium scenarios passed, including four new login cases.
- Production Next.js build passed.
- Migrations passed on an empty temporary SQLite file and on repeat execution.
- Visual QA inspected 390, 768, 1024 and 1440 px and the static reduced-motion scene; 320 px also passed automated responsive checks.
- Login E2E covered keyboard tab order, email/password scene states, incorrect password, Enter submission, held-request loading, immediate success redirect, session after reload, logout and subsequent protected-route denial.

Screenshots are local QA artifacts: `artifacts/qa/login-{320,390,768,1024,1440}.png` and `artifacts/qa/login-reduced-motion.png`. HTML/trace reports use the existing ignored Playwright directories.

## Documentation changed for this refactor

- `AGENTS.md`
- `PROMPT_ONE_SHOT.md`
- `PRODUCT.md`
- `README.md`
- `docs/04_USER_FLOWS.md`
- `docs/05_INFORMATION_ARCHITECTURE.md`
- `docs/06_DESIGN.md`
- `docs/07_PRODUCT_VISUALS.md`
- `docs/10_IMPLEMENTATION_PLAN.md`
- `docs/11_ACCEPTANCE_CRITERIA.md`
- `docs/12_TEST_PLAN.md`
- `docs/15_DECISIONS.md`
- `docs/17_LOGIN_ORBITAL_MOTION.md`
- `docs/INDEX.md`
- `docs/IMPLEMENTATION_REPORT.md`
- `docs/design/REFERENCES.md`
- `docs/design/MOCKUPS.md`

## Validation limits

Browser automation used Chromium. The artwork is lightweight local SVG illustration with dimensional styling, rather than the reference's rendered 3D imagery. The approved reference is not a pixel-perfect acceptance baseline. No deployment was requested or performed.
