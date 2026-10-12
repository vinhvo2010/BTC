# SHADOW decision journal V1

Production source baseline: Skydeal's dpl_7Cev2pL57qcccGmmf28RSeEjBii4 matched the eight runtime files in the original SCMv3-Signal15 directory, normalizing only trailing LF. Canonical maintained source is now vinhvo2010/BTC, terminal/. The SCMAT CMC worktree is a separate system.

## Trigger and clocks

A resident GitHub Actions worker polls the public Skydeal API at UTC minutes 2,7,12,... with a direct timer. It does not need an open browser or the GitHub cron trigger. Each session lasts at most five hours and requests the next workflow_dispatch session after a safe published checkpoint. Release pushes run a one-minute commissioning session to verify this handoff before starting the normal five-hour session. Only one worker is active through a concurrency group. A fatal execution/provenance/process invariant stops the worker; it does not continuously hand off a failed session. It records the target latest closed 15m cutoff at request time, all six native frame cutoffs, actual source receipts, backend decisions and HTTP receipt. A record more than five minutes after its bar cutoff is explicitly LATE_OBSERVATION. This is not a retroactive historical signal. Higher frames may be re-observed later; the first decision and all actual scan attempts remain auditable.

The GitHub cron trigger was observed not firing and is no longer the primary scheduler. Runner queue delays, cancellation, or network failures can still interrupt coverage. A heartbeat older than eight minutes is stale. The dashboard separates scheduler freshness from source quality. Skipped cutoff ranges get NOT_OBSERVED, NULL decision/receipt and MISSED_SCHEDULE_NO_POINT_IN_TIME_DECISION; they are never backfilled as decisions made earlier. Coverage before the monitoring start is UNKNOWN.

## Durable artifacts

data/scm15/scans/YYYY-MM-DD/runId.json.gz is an immutable full scan envelope, including all 12 frame assessments, the requested source payloads, source timestamps and payload hashes. data/scm15/journal/YYYY-MM-DD.ndjson is append-only. It records the first actual decision for each bar/cohort and later material gate/state changes; unchanged repeated scans remain in the immutable envelopes. state.json is a derived current index, not the historical authority. Records carry code/config hashes, snapshot hash/path and actual decision/receipt clocks.

Legacy READY plans retain their own archive and are never relabelled V3 or trade orders. Source or model changes start a separate cohort. No past journal/snapshot is overwritten or deleted by the scanner. Data errors also update the heartbeat with BLOCKED/PARTIAL, so silence cannot be mistaken for NO_SETUP.

## API and UI

GET /api/live reports release fingerprint, source receipts/hashes and all frame assessments. evidence=1 includes parsed public source response payloads for the scanner. No private/account endpoint is allowed.

GET /api/feed reports schedulerFresh, sourceHealth, validFrameCount, cohortMatches, missingBarsDetected and monitoringStartedAt. verified requires a fresh scheduler, matching cohort and all 12 valid source audits.

GET /api/history?date=YYYY-MM-DD&symbol=ENAUSDT&frame=4h&limit=30 returns recorded decisions. Dates select UTC journal files; the UI displays clocks in Vietnam time. Paging uses the last returned record ID so appends do not shift offsets. The UI filters BTC/ENA and six frames, exposes all reasons and complete record details, and identifies late or missed observations.

## Execution invariants and validation

All published records remain SHADOW, executionEnabled=false, paperOrderCreated=false and tradePermission=NO_TRADE. Entry, stop, target, size, netRR and probability remain NULL in frame assessments. The scanner rejects any payload that arms execution or exposes a non-null signal. The deployment does not alter strategy thresholds, costs, pivots, frozen Paper cohorts, account keys or financial orders.

Run npm test, npm run check, npm run build and node scripts/build-release.mjs --check in terminal/. Browser regression covers desktop/mobile history filters, actual blocked reasons and pagination. GitHub Actions runs the same tests and release-hash check before scanning. Release deployment uses the reviewed generated manifest and must match /api/live plus the cloud index afterward.

## Operations and rollback

The cloud workflow commits only data/scm15. A transport/source/provenance error is recorded explicitly instead of losing the receipt. Unexpected unsafe output makes the job fail after writing a blocked record. Source hashes must match the scanner's reviewed release. Avoid parallel senders; this release has no notification transport.

Rollback the Vercel alias to the baseline deployment if runtime/API smoke fails. If scheduler code is rolled back, preserve all recorded journal and scan files. Do not merge cohorts, fabricate missing past decisions or call fresh heartbeat trading readiness. The resident timer and automatic workflow handoff must be verified by actual receipts. This is an observed research pipeline, not a per-candle delivery SLA. Failed publishing preserves a bounded last-scan recovery artifact for 30 days; the normal Git scan/journal archive remains authoritative. No permanent credential is added; the handoff step uses the runner's repository-scoped managed workflow credential, never a Binance key.

Publication reads resolve the latest public GitHub commit feed and then fetch the state/journal at that immutable commit SHA. A cached main raw URL is never used as current receipt authority. History paging keeps the same source commit. Runtime code hash excludes the platform-managed Vercel build config; its hash is exposed separately as deploymentConfigHash.
