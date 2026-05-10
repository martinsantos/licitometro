# Licitometro 0.2

Licitometro 0.2 starts as a Mendoza-first refactor. National Argentine sources
stay supported, but the new architecture is introduced first where the product
has the most operational knowledge: Mendoza.

## First Principles

- Source routing must be explicit, ordered, testable, and observable.
- Scrapers should eventually return normalized records plus evidence, not only
  final `LicitacionCreate` objects.
- AI extraction must be schema-bound, cached by document hash, and tied to
  evidence whenever possible.
- UX should move from "search table" to "opportunity cockpit": decide, prepare,
  present, and learn.

## Phase 1: Mendoza Ingestion Foundation

The first code change introduces a declarative Mendoza source registry in
`backend/scrapers/registry/mendoza.py`.

This preserves current scraper behavior while creating a place to attach:

- source metadata
- extraction strategy
- health probe expectations
- contract test requirements
- quality score dimensions

Next steps:

The second code change introduces `ScrapeResult` and `SourceEvidence` in
`backend/scrapers/contracts.py`. Existing scrapers can be wrapped with
`ScrapeResult.from_legacy_item()` while each Mendoza source migrates to native
evidence-aware output.

The third code change introduces source quality metrics in
`backend/services/source_quality_service.py`. Every scheduler run now stores a
`metadata.source_quality` summary with field coverage, document coverage,
direct URL coverage, and low-confidence samples.

The fourth code change introduces `backend/services/ai_extraction_pipeline.py`:
a schema-first AI extraction cache keyed by normalized document hash plus
schema/prompt version. This is the migration path for pliego intelligence with
auditable, repeatable outputs.

The fifth code change introduces canonical tender projection models in
`backend/models/tender_canonical.py` and
`backend/services/canonical_projection_service.py`. They define the target split
between a canonical business opportunity and source-specific appearances without
forcing an immediate database migration.

The sixth code change persists those projections into
`tender_canonical_projections` during Mendoza scraper runs. This is a side
collection: it does not replace `licitaciones`, but it starts building the
future canonical opportunity graph.

The seventh code change exposes the AI 0.2 extraction path at
`POST /api/cotizar-ai/pliego/{licitacion_id}/extract-v2`. It uses the
document-hash cache and schema-first output without replacing existing resumen
or chat flows.

The eighth code change exposes canonical projections in the admin UI under
`Canonical 0.2`, protects `/api/canonical` as admin-only, and adds
`POST /api/canonical/rebuild?jurisdiction=Mendoza` to backfill/rebuild side
projections from existing Mendoza `licitaciones`.

The ninth code change adds an `0.2` tab to the pliego assistant panel. It lets
operators run the schema-versioned extraction, see cache/provider metadata, and
compare detected items, documentation, technical requirements, delivery data,
and risk flags against the legacy summary/chat experience.

The tenth code change adds conservative canonical duplicate diagnostics at
`GET /api/canonical/diagnostics/duplicates`. The projection now stores a
normalized `metadata.duplicate_key`, and the admin `Canonical 0.2` panel shows
candidate merge groups with source names and confidence. This is intentionally
diagnostic-only until source evidence is rich enough for audited merges.

The eleventh code change adds audited side-collection merges at
`POST /api/canonical/merge`. A merge combines source records into the selected
primary canonical opportunity, marks duplicates as `estado=merged`, and stores
`merge_events`, `merged_from`, and `merged_into` metadata. No original
`licitaciones` records are deleted.

The twelfth code change starts using the scraper evidence contract in live
scheduler metadata. Legacy `LicitacionCreate` items are wrapped into
`ScrapeResult` summaries per run, producing `metadata.source_evidence` with
evidence coverage and kind counts. Admin Fuentes now shows both quality and
evidence coverage for each Mendoza source.

The thirteenth code change lets the scheduler consume native `ScrapeResult`
outputs through an optional scraper `run_with_evidence()` method. Mendoza Compra
and Boletin Oficial Mendoza now implement that method while preserving their
existing `run()` return type for legacy callers and tests. Admin Fuentes marks
native evidence runs so migration progress is visible per source.

The fourteenth code change persists compact per-item evidence summaries into
`licitaciones.metadata.source_evidence`, projects evidence IDs into canonical
`source_records`, and uses those evidence IDs to raise duplicate-candidate
confidence. The admin canonical panel now shows evidence counts for merge
candidates.

The fifteenth code change promotes AI extraction v2 into the cotizar workflow:
`OfertaEditor` now tries schema-first AI 0.2 before falling back to the legacy
extractor, shows AI 0.2 metadata/red flags, and auto-imports detected items.
`extract-v2` also persists `metadata.ai_extraction_v2_result` and maps the
schema into the existing `requisitos` field used by affinity scoring and
alerts. A bounded admin batch endpoint
`POST /api/cotizar-ai/pliego/extract-v2-batch` can populate Mendoza
licitaciones in groups of up to 50, with a button in `Canonical 0.2`.

The sixteenth code change extracts the batch logic into
`services.ai_extraction_cron_service`, registers a daily
`ai_extraction_v2_mendoza` cron at 10:45, stores batch run summaries in
`ai_extraction_batch_runs`, and exposes recent runs through
`GET /api/cotizar-ai/pliego/extract-v2-batch/runs`. The admin canonical panel
now shows recent AI 0.2 batch history.

The seventeenth code change surfaces AI 0.2 requirements in alerting. Alert test
results now include a compact `requirements_summary`, and Telegram alert
messages include whether a match has AI 0.2 requisitos, red flags, and required
document counts.

The eighteenth code change improves affinity-score explainability. The
company-context score endpoint now returns a compact requirements context with
AI 0.2 source/schema metadata and counts for red flags, required documents, and
technical requirements. `ScoreAfinidad` uses that context to show when a score
is backed by AI 0.2 and why the score has, or lacks, useful rule evidence.

The nineteenth code change makes AI 0.2 requirements affect the affinity score
itself. `match_score_service` now rewards technical requirement overlap against
company rubros/certifications and rewards required-document overlap against
known profile credentials, while avoiding negative scoring for incomplete
company profiles.

The twentieth code change connects score calculation with the existing company
context document inventory. The score endpoint folds `documentos_disponibles`
from `company_contexts` into the profile passed to `match_score_service`; when
that inventory exists, AI 0.2 required documents can now produce both positive
matches and explicit missing-document penalties.

The twenty-first code change makes those AI 0.2 scoring details actionable in
the UI. `match_score_service` now returns structured `ai_v2` details with
technical matches, document matches, missing documents, and whether a document
inventory was available. The licitacion requirements checklist and `OfertaEditor`
surface those details as preparation gaps instead of hiding them inside score
reason text.

The twenty-second code change persists offer-readiness snapshots. The new
`services.offer_readiness_service` builds a versioned snapshot per
licitacion/company with score, status, AI 0.2 risk flags, technical matches,
document matches, missing documents, and document coverage. The new
`GET /api/company-context/profiles/{company_id}/readiness/{licitacion_id}`
endpoint computes and upserts that snapshot into `offer_readiness_snapshots`,
and `OfertaEditor` now reads from that persisted readiness path.

The twenty-third code change adds admin triage for readiness. `GET
/api/canonical/readiness` lists persisted snapshots with joined licitacion
metadata and status summaries, and the new `Readiness 0.2` admin tab ranks
opportunities by blocked/review/ready state, missing-document burden, compatible
documents, and risk flags.

The twenty-fourth code change wires readiness recomputation into AI 0.2 batch
processing. Successful `AIExtractionCronService.run_batch` items now trigger
snapshot refreshes across company profiles, and batch run summaries include
readiness processed/snapshot/failed counts. This keeps the admin readiness
dashboard fresh after the Mendoza extraction cron runs.

The twenty-fifth code change adds notification hooks for readiness transitions.
Batch recomputation now sends a Telegram message through the existing
`NotificationService` when a snapshot transitions into `ready` or `blocked`.
Messages include score, transition, missing-document counts, risk counts,
sample gaps, and a licitacion link; screen-triggered readiness reads do not send
notifications.

The twenty-sixth code change adds value-aware readiness prioritization.
Readiness snapshots now include `priority_score`, calculated from affinity,
budget tier, readiness status, missing documents, and red flags. The admin
readiness endpoint sorts by that score, `offer_readiness_snapshots` has a
priority index, and the `Readiness 0.2` panel displays priority separately from
raw affinity.

The twenty-seventh code change adds opening-date urgency to readiness priority.
When `opening_date` or `expiration_date` is parseable, near openings raise
priority and expired opportunities are de-prioritized. Unparseable source dates
are ignored safely so Mendoza sources with heterogeneous date strings do not
break scoring.

The twenty-eighth code change adds readiness trend history. Snapshot upserts now
append compact audit events into `offer_readiness_history` only when status,
affinity score, priority score, or counts materially change. The admin API
exposes `GET /api/canonical/readiness/{licitacion_id}/history` for per-company
or all-company readiness timelines.

The twenty-ninth code change surfaces readiness history in the admin UI. Each
row in `Readiness 0.2` can expand a compact timeline showing status, priority,
and score transitions for the selected company/opportunity.

The thirtieth code change adds operational readiness filters. The admin
readiness endpoint accepts `min_priority`, `opening_days`, and `critical_only`,
returns days-to-opening when parseable, and the `Readiness 0.2` panel exposes
priority, opening-window, critical-only, and reset controls for daily triage.

The thirty-first code change adds one-click readiness recomputation. Admins can
refresh an individual row from `Readiness 0.2`; the new
`POST /api/canonical/readiness/{licitacion_id}/refresh` endpoint recomputes
snapshots for that opportunity across company profiles using the same service as
the AI 0.2 batch pipeline.

The thirty-second code change adds filtered readiness export. The new
`GET /api/canonical/readiness/export.csv` endpoint exports the current readiness
queue as CSV with the same status, priority, opening-window, and critical-only
filters used by the admin panel, and `Readiness 0.2` now has a CSV button.

The thirty-third code change adds operator actions to readiness rows. Admins can
persist owner, next action, due date, notes, and resolved state through
`PUT /api/canonical/readiness/{licitacion_id}/action?company_id=...`, and the
`Readiness 0.2` panel exposes inline editing for those fields.

The thirty-fourth code change completes the operator-action loop. Readiness
lists and CSV exports can now filter by `resolved=true/false`, CSV output
includes owner, next action, due date, resolved state, and notes, and the admin
panel exposes an actions filter for pending versus resolved rows.

The thirty-fifth code change adds due-date highlighting for readiness actions.
Unresolved operator actions now show their due date in `Readiness 0.2`, and
overdue rows are visually marked so daily triage can focus on stale work.

The thirty-sixth code change moves overdue filtering into the backend. Readiness
lists and CSV exports now accept `overdue=true/false`, the admin panel exposes a
`Vencidas` filter, and `operator_action.due_date` has an index for scalable
triage.

The thirty-seventh code change adds overdue readiness action notifications. The
new `ReadinessActionService` sends a daily Telegram digest for unresolved
operator actions whose due date is in the past, rate-limits repeated alerts per
snapshot, and is registered as the `readiness_overdue_digest` cron at 08:40.

The thirty-eighth code change adds an owner workload summary to `Readiness 0.2`.
The panel now summarizes, within the current filtered queue, total, pending, and
overdue actions per responsible owner.

The thirty-ninth code change adds source-level readiness coverage. The scheduler
`source-health` endpoint now reports, per scraper source, AI 0.2 extraction
coverage, readiness snapshot coverage, ready/blocked counts, missing documents,
and red flags. `AdminFuentes` surfaces those metrics next to source quality and
evidence so Mendoza scraper health is tied directly to offer readiness.

The fortieth code change adds source-level readiness trends. The new
`GET /api/scheduler/source-readiness-trends` endpoint returns recent readiness
snapshot points per source, and `AdminFuentes` displays compact trend chips with
priority, status, and missing-document burden.

The forty-first code change adds source-level readiness export. The new
`GET /api/scheduler/source-readiness-export.csv` endpoint exports scraper
readiness coverage metrics, and `AdminFuentes` includes a `CSV readiness` action
for governance reviews.

The forty-second code change adds source-level readiness coverage alerting.
`ReadinessActionService` can now send a Telegram digest for sources whose AI 0.2
or readiness snapshot coverage falls below target, and
`readiness_source_coverage_digest` runs daily at 11:15.

The forty-third code change adds persisted source coverage snapshots.
`ReadinessActionService.snapshot_source_coverage` stores daily source-level
readiness coverage into `source_readiness_snapshots`, indexed by source/date,
and `readiness_source_coverage_snapshot` runs nightly at 23:30.

The forty-fourth code change exposes persisted source coverage history. The new
`GET /api/scheduler/source-readiness-history` endpoint returns daily source
coverage snapshots, and `AdminFuentes` displays recent AI/snapshot coverage
history chips per source.

The forty-fifth code change extracts source readiness metrics into
`services.source_readiness_metrics_service`. Scheduler endpoints, exports,
coverage alerts, and future jobs can now share one tested coverage calculation
instead of duplicating source matching and readiness aggregation logic.

The forty-sixth code change adds guarded AI 0.2 source backfill. The scheduler
can now list under-covered Mendoza sources via
`GET /api/scheduler/source-readiness-backfill-candidates` and execute a bounded
AI extraction backfill with `POST /api/scheduler/source-readiness-backfill`.
`AdminFuentes` exposes both global and per-source `AI 0.2` actions, capped by
default to avoid uncontrolled LLM spend while closing coverage gaps.

The forty-seventh code change adds a source backfill preview in `AdminFuentes`.
Operators can now inspect under-covered sources, AI/snapshot coverage, and the
first candidate licitaciones before launching the guarded AI 0.2 backfill.

The forty-eighth code change adds source backfill audit history. Guarded AI 0.2
backfill runs are now stored in `source_backfill_runs`, indexed by source/date,
exposed through `GET /api/scheduler/source-readiness-backfill-runs`, and shown
in `AdminFuentes` as recent remediation history.

The forty-ninth code change promotes source coverage remediation into a
conservative cron. `ai_source_backfill_v2_mendoza` runs daily at 12:10, targets
only under-covered Mendoza sources below 85% AI 0.2 coverage, and caps work to
five licitaciones per run with no forced refresh.

The fiftieth code change adds per-source AI 0.2 backfill thresholds. Optional
`scraper_configs.ai_backfill` settings can override the global coverage target,
per-source candidate limit, or pause remediation for fragile sources. The
scheduler exposes `PUT /api/scheduler/source-readiness-backfill-settings`, and
`AdminFuentes` now shows quick controls for 85%, 95%, and pause/reactivate.

The fifty-first code change strengthens AI backfill tests. The AI extraction
cron service now has focused tests for disabled per-source remediation and
source-specific threshold/limit overrides, using fake async collections.

The fifty-second code change adds remediation scoring for AI 0.2 backfill
candidates. Candidate selection now ranks by source coverage gap, missing
readiness snapshots, opening-date urgency, and budget impact before selecting
the bounded per-source set. `AdminFuentes` shows the score in candidate preview.

The fifty-third code change adds CSV export for AI 0.2 backfill candidates.
`GET /api/scheduler/source-readiness-backfill-candidates.csv` exports the
current dry-run candidate set with source coverage, opening date, budget, and
`remediation_score`, and `AdminFuentes` exposes a `CSV candidatas` action.

The fifty-fourth code change adds a source remediation leaderboard. The new
`GET /api/scheduler/source-remediation-leaderboard` endpoint ranks Mendoza
sources by coverage gap, candidate volume, top candidate score, and recent
backfill success rate. `AdminFuentes` now shows the top remediation sources for
daily operator focus.

The fifty-fifth code change adds CSV export for the remediation leaderboard.
`GET /api/scheduler/source-remediation-leaderboard.csv` exports source-level
remediation score, coverage gaps, candidate counts, recent success/failure
counts, and `AdminFuentes` exposes a `CSV ranking` action.

The fifty-sixth code change adds source backfill failure diagnostics. AI 0.2
batch errors are now classified into `rate_limit`, `provider`, `input_quality`,
`schema`, or `unknown`, persisted in `source_backfill_runs.failure_diagnostics`,
returned in backfill history, and summarized in `AdminFuentes`.

The fifty-seventh code change adds aggregated failure diagnostics. The new
`GET /api/scheduler/source-backfill-failure-diagnostics` endpoint groups recent
source backfill failures by category and source, and `AdminFuentes` shows a
compact diagnostic block when failures exist.

The fifty-eighth code change adds automatic repair hints for AI 0.2 backfill
failures. Failure diagnostics now include category-specific operator guidance
for rate limits, provider issues, input quality, schema failures, and unknown
errors; `AdminFuentes` exposes those hints on diagnostic chips.

The fifty-ninth code change adds controlled retries for recoverable AI 0.2
backfill failures. `POST /api/scheduler/source-backfill-retry-failures`
retries recent `rate_limit`, `provider`, `schema`, and `unknown` failures while
excluding `input_quality` until scraper/pliego extraction is repaired.
`AdminFuentes` exposes `Retry recuperables`, and tests lock down the filter.

The sixtieth code change adds a retry-rate guard. Recoverable source backfill
retries now skip licitaciones already retried within a configurable window
(`retry_window_hours`, default six hours), persist the retry window on the run,
and report how many IDs were skipped as recent retries.

The sixty-first code change adds retry outcome analytics. The new
`GET /api/scheduler/source-backfill-retry-analytics` endpoint summarizes retry
runs by total success rate, failure count, category, and source, and
`AdminFuentes` shows whether recoverable retries are actually producing AI 0.2
extractions.

The sixty-second code change adds retry analytics CSV export.
`GET /api/scheduler/source-backfill-retry-analytics.csv` exports retry outcomes
by failure category, and `AdminFuentes` exposes `CSV retries` for weekly
operations review.

The sixty-third code change adds AI 0.2 retry outcome alerting. Retry analytics
now live in `ReadinessActionService`, `ai_backfill_retry_digest` runs daily at
12:40, and Telegram alerts fire when retry success rate is low or rate-limit
failures dominate recent backfill attempts.

The sixty-fourth code change adds configurable retry alert thresholds.
`operator_settings.ai_backfill_retry_alerts` stores minimum retry success rate,
maximum rate-limit share, and disabled state. Scheduler exposes GET/PUT
settings endpoints, `AdminFuentes` adds quick sensitivity controls, and
`operator_settings.key` is indexed unique.

The sixty-fifth code change persists retry alert events. AI 0.2 retry digests
now write `operator_alert_events` with event type, channel, delivery status,
message, payload metrics, and timestamp, so alert decisions remain auditable
even if Telegram delivery fails.

The sixty-sixth code change exposes retry alert audit history. Scheduler now
serves `GET /api/scheduler/operator-alert-events` with filters by event type and
delivery status, and `AdminFuentes` shows recent AI backfill retry digest events
with delivery outcome and success-rate context.

The sixty-seventh code change adds CSV export for operator alert events.
`GET /api/scheduler/operator-alert-events.csv` exports alert timestamp, type,
channel, delivery status, processed count, success rate, and rate-limit share;
`AdminFuentes` exposes `CSV alertas` beside retry alert history.

The sixty-eighth code change adds an input-quality repair queue. AI 0.2
backfill failures classified as `input_quality` now become a deduplicated
operator queue through `GET /api/scheduler/input-quality-repair-queue`, with
status updates, CSV export, persisted repair actions, indexes, and an
`AdminFuentes` panel for taking, resolving, or ignoring scraper/pliego repair
items.

The sixty-ninth code change adds input-quality repair alerting. Open repair
items are summarized by source, stale items are detected by age, alert events
are persisted, and `input_quality_repair_digest` runs daily at 13:10 so scraper
and pliego-input issues do not silently block AI 0.2 coverage.

The seventieth code change adds aging metrics for input-quality repairs.
`GET /api/scheduler/input-quality-repair-queue` now returns per-source open
counts, occurrences, max age, and average age; CSV includes item age, and
`AdminFuentes` surfaces the oldest/open repair pressure by source.

The seventy-first code change closes the input-quality repair loop. Operators
can now relaunch AI 0.2 for a repaired licitación through
`POST /api/scheduler/input-quality-repair-queue/{licitacion_id}/rerun`;
successful reruns mark the repair item resolved, failed reruns reopen it, and
rerun attempts are persisted in `input_quality_repair_reruns`.

The seventy-second code change adds rerun history to input-quality repairs.
Repair queue items and CSV exports now include rerun count, last rerun status,
and last rerun timestamp; `AdminFuentes` surfaces rerun history inline so
operators can see repeated unresolved pliego/text issues.

Next steps:

1. Add full-suite validation after the input-quality repair loop block.
