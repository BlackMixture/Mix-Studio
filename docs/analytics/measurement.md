# Usage measurement

Mix Studio emits two allowlisted PostHog events: App_Launched and Generation_Started. The existing notice and Preferences switch control collection. Existing opt-outs remain off. The revised notice appears once to explain the new random browser ID.

Version 2 uses one cryptographically random ID stored per browser and origin, with a fresh visit ID per page load or re-enable. The SDK itself uses memory persistence, with person profiles, automatic page tracking, replay, surveys, feature flags, URL/device enrichment and geolocation disabled. Only the public model label, browser ID, visit ID, schema version and transport fields are sent. Opt-out clears the browser ID; re-enabling starts a new identity. Storage or cryptography failures prevent collection.

These are participating browsers, not exact people. Different browsers/devices/origins, clearing storage, and private browsing can split one person's activity. HTTP and HTTPS are different origins. Blockers and opt-outs reduce coverage. Direct requests necessarily expose a network IP to the service; confirm the PostHog project IP-discard and retention settings separately. This change does not enable location analytics.

## Metrics

- Active browsers: distinct_id on version 2 events.
- Visits: unique visit_id on version 2 App_Launched events.
- Engagement: Generation_Started counts and distinct browser/visit IDs with that event, broken down by model_name.
- Returning browsers within a time window: browsers with at least two distinct launched visits in that window. This is not lifetime retention.
- Generation_Started means an accepted browser API submission, not GPU execution, successful completion, or number of output images. Background/server-only requests are not covered.
- App_Launched measures page launches, not impressions of individual feature cards or every SPA tab navigation.

For PostHog dashboards filter measurement_version = 2 and identity_scope = browser. Use distinct_id for browser counts and visit_id for visits rather than SDK sessions. Plot daily/weekly/monthly active browsers by changing the interval. Compare launched visits with engaged visits for engagement; model event totals show usage.

Legacy events used ephemeral identities and must not be mixed with returning-browser measurements. Historical LTX 2.5 requests may have been mislabeled LTX 2.3; they cannot be repaired reliably.

## Local aggregate report

Export events as JSON objects containing event, timestamp, distinct_id, properties and uuid (for deduplication). properties may be an object or JSON string. Run:

    node scripts/report-analytics.js events.json --from 2026-09-01 --to 2026-10-01

The end boundary is exclusive and daily buckets use UTC. Output includes aggregate browser/visit/engagement counts, legacy counts, daily counts, model totals, and data-quality flags. It does not expose raw IDs or event properties. The exporter must include the full intended window; this tool cannot recover missing events. PostHog dashboard creation and historical data validation require project access and are not performed by this CLI.
