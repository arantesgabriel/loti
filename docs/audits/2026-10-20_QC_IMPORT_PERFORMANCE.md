# QC import performance — local execution record

Date: 2026-10-20
Contract: [`32_QC_IMPORT_PERFORMANCE_PLAN.md`](../32_QC_IMPORT_PERFORMANCE_PLAN.md)

## Scope and preservation

Implemented phases 0–9 locally. The canonical documentation, HubBuy QC handoff and financial invariants were reviewed before code changes. The checkout’s pre-existing `docs/INDEX.md` entry and `next-env.d.ts` edit were preserved. No schema or migration, dependency, service, secret, bucket, remote configuration, production data, deployment or publication was added or changed.

QC remains server-authorized and workspace-scoped. Purchase and additional-product snapshots, financial calculations, package state, gallery/viewer authorization, manual cover behavior, tombstones, content deduplication, quota reservations, leases and uncertain PUT recovery retain their existing boundaries. The pipeline and decoder limits are request-local; they do not define a global instance memory cap.

## Implementation

- Added request-local stage/counter/memory metrics without network telemetry or sensitive values. Production uses a no-op collector unless a local caller injects one.
- Reused validated original bytes for preview generation; the recovery path still reads the private R2 object and checks its hash when the buffer is absent.
- Grouped relevant preparation, confirmation and progress reads; limited each manifest batch to five sources.
- Added per-request FIFO pipeline slots, one shared heavy-image slot and a short serial DB queue. Destination lanes preserve source order; remote I/O stays outside the DB queue. Admitted work is drained or cancelled/settled before releasing the persisted lease.
- Added optional server-only `LOTI_QC_PIPELINE_CONCURRENCY` (integer 1–3, default 3, sanitized configuration error for invalid values). Mock-backed benchmark injection may use 5 or 10; the browser and production path cannot set those values.
- Batch responses include the persisted, sanitized progress snapshot. The browser continues successful batches without a twelve-call cap, retains GET for initial/recovery reads, handles bounded rate-limit and transport recovery, and does not replay an uncertain POST blindly.
- Added `npm run benchmark:qc`, deterministic quota/reimport controls, and a separate real-decoder high-resolution memory probe. No dependencies were installed.

## Synthetic benchmark

Artifacts are in `artifacts/benchmarks/qc-import/`: `baseline.json`, `final-concurrency-{1,2,3,5,10}.json`, and `memory-concurrency-{1,3,5,10}.json`. Each timed scenario used five repeats, local disposable SQLite, synthetic storage/download services, and 2 ms controlled delays. The benchmark advances its domain clock across synthetic rate-limit windows; these wall times are simulation results, not end-to-end production estimates. Runtime was Node v24.21.0 on Windows x64.

### Wall-time medians and ranges

| Photos, one destination | Baseline | Final c=1 | Final c=2 | Final c=3 | Final c=5 | Final c=10 |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 5.83 s (3.04–6.89) | 8.31 s (2.31–8.42) | 2.33 s (2.20–2.44) | 2.64 s (2.43–5.49) | 2.51 s (2.40–2.58) | 2.55 s (2.53–2.58) |
| 50 | 14.21 s (13.99–14.52) | 10.80 s (10.70–27.67) | 10.94 s (10.57–20.28) | 12.02 s (11.94–12.27) | 11.69 s (11.65–30.75) | 12.20 s (11.78–18.86) |
| 100 | 28.57 s (28.31–38.14) | 21.76 s (21.33–29.20) | 21.61 s (21.32–21.68) | 24.17 s (23.12–41.36) | 23.20 s (23.09–35.11) | 23.89 s (23.31–24.21) |

Baseline and c=1/2/5/10 timings were collected before the review fixes. The c=3 timed benchmark was rerun against the final code. The 10-photo one-destination c=1 median was slower than baseline and its range was wide. At 50 and 100 photos, every final concurrency median was lower than baseline on this host, but c=3 was not the fastest at each workload. The observed variation and serial destination lane mean these measurements do not establish a general speedup guarantee.

The 10-photo / 10-destination medians were 2.98 s baseline and 2.29 s, 4.31 s, 2.24 s, 2.10 s and 2.16 s at concurrency 1, 2, 3, 5 and 10 respectively. This small scenario was noisy; concurrency 2 was slower than 1 and does not support an adaptive/high production setting.

### Operation and integrity counts

Across the five timed repeats, each 10/50/100-photo scenario performed respectively 50/250/500 synthetic downloads and 100/500/1000 PUTs in both baseline and final runs. Baseline made 50/250/500 original-object GETs; every final concurrency made zero. Every final run reimported the ready manifest with zero additional downloads and zero PUTs. The separate real-decoder probe also made zero original-object GETs for its five new photos.

At concurrency 1, 2, 3, 5 and 10, each standard benchmark passed both deterministic controls: 300 photos in one manifest returned `QC_IMPORT_LIMIT` before any transfer call, and manifests of 200 plus 100 photos completed all 300. Five-photo selection and persisted snapshots are covered by the QC service and browser tests below.

### High-resolution sampled memory

The separate probe generated five compressed 3000×2000 JPEGs locally (1,611,703 encoded input bytes total), then used the real QC validator and WebP preview generator. Process memory was sampled every 5 ms during processing; these are sampled peaks, not exact maxima or memory ceilings.

| Injected concurrency | Wall time | Sampled RSS | Sampled external | Sampled array buffers |
|---:|---:|---:|---:|---:|
| 1 | 1.25 s | 338.4 MB | 77.8 MB | 9.1 MB |
| 3 | 1.24 s | 355.2 MB | 81.6 MB | 4.4 MB |
| 5 | 1.18 s | 330.3 MB | 77.8 MB | 9.1 MB |
| 10 | 1.18 s | 334.9 MB | 77.8 MB | 4.2 MB |

The concurrency 3 high-resolution sample was rerun against the final code; the other memory samples predate the review fixes. The high-resolution sample did not show a monotonic memory increase as concurrency rose; the shared decoder slot and five-photo batch bound this small workload. It does not establish a cross-request or cross-instance memory ceiling.

## Validation results

- `npm run typecheck`: passed.
- `npm run lint`: passed after removing generated temporary build trees from the workspace lint traversal.
- Final QC-targeted Vitest: 9 files, 76 tests passed with one worker (serialized local SQLite fixtures and no remote token). This includes all 41 `qc-services` integration tests.
- Full Vitest run: 53 files, 353 passed, 7 skipped, 14 failed. Failures were in the independent-process account-deletion, refund-concurrency and purchase-order-corrections suites. A control copy using the original `src/lib/db/connection.ts` reproduced the same `SQLITE_BUSY` in the purchase-order-corrections concurrency test. This proves that failure is not caused by the DB queue change; the full suite is not reported as passing.
- Focused Chromium E2E: the 92-photo automatic drain plus structured 429 test passed; the QC queue/failure/recovery test passed after its expectation was updated to the batch-level activity status; and a new repeated-snapshot regression passed with exactly one batch POST.
- Full E2E: 48 tests, 39 passed and 9 failed in 9.2 minutes on a fresh disposable SQLite DB. The new 92-photo test, manual four-photo test, QC cover/thumbnail test, progress/recovery test, and other non-QC flows passed. Failures were two HubBuy account/balance tests, six existing QC UI tests whose cost-table/gallery selectors or visual fixtures no longer match the current presentation (including an expected 40 px marker that rendered at 36 px), and the refund-readability test’s 180-second login navigation timeout. No cost, gallery, account or refund UI was changed by this implementation; these failures remain visible and are not called passes.
- Production build passed in the disposable E2E copy with a temporary `experimental.cpus: 1` build-only setting before the final review fixes. Two root-output attempts had Windows `EPERM` creating Next route directories; the successful build compiled the app and included the QC routes. After the small review fixes, final typecheck, lint and focused browser/service tests passed; the production build was not rerun. No repository build configuration was changed.
- A read-only code review by GPT-6.1-SOL at high effort found two actionable gaps: repeated successful snapshots could inflate counters and continue the loop; a queued preview marker write could consume the remaining budget before PUT. Both were fixed. The browser now compares persisted revision, next source and photo states before accepting another batch; preview storage calls receive the request signal combined with the remaining batch deadline, and the budget is rechecked after the marker write. Regression tests for both cases pass.
- Final `npm run typecheck`, `npm run lint`, targeted QC Vitest (9 files / 76 tests), and repeated-snapshot Chromium E2E passed. The full Vitest and E2E runs above predate these two review fixes; the full suites were not rerun afterward.
- `git diff --check`: passed after the review fixes.

All benchmark and E2E databases were disposable local files. SQLite left several benchmark files locked briefly after client close; they were removed after each process exited. No remote database, R2 bucket, HubBuy URL or hosted environment was contacted.

## Limits and future remote validation

The local benchmark measures controlled synthetic delays and local SQLite/decoder work, not HubBuy, Turso, R2, Vercel cold starts or hosted memory pressure. A later separately authorized non-production smoke test can validate the hosted duration, credentials, bucket policy and transport behavior. No external credential is required for the completed local scope, and no hosted setting has been changed.
