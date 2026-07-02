# Sales Rep Availability Tracker

A single-page dashboard for DoorLoop's **sales demo round-robin** Calendly
availability, broken down by prospect size tier. Data comes from the internal
RDS SQL proxy (`agent_platform` schema).

Live data is produced by the n8n workflow **RevOps Calendly Availability
Tracker**, which writes a snapshot every 2 hours (8am–6pm ET, weekdays) into
`capacity.rep_daily` with `source_key = 'sales_reps_availability'`.

## What it shows

| Section | Meaning |
|---|---|
| KPI tiles | tiers available today, soonest slot, open slots in next 24h, tiers over the SLA threshold |
| Tier cards | per size-tier: next slot, 24h / 48h counts, health status, 14-day sparkline |
| Trend chart | total (or average) of a chosen metric across all tiers, per run |
| Table | every tier's latest-run numbers |

Health / SLA threshold = next slot within **1 day** (matches the RevOps
threshold alert).

## How the SQL proxy works

The dashboard never talks to AWS directly. It POSTs `{sql, params}` to `/api/sql`
on its own origin; nginx forwards to the AWS API Gateway and adds the
`X-Identity` and `X-Internal-Secret` headers from container env vars. **The
credential never reaches the browser.** Numeric columns come back as strings — the
page wraps them in `Number()`.

## Deploy (deploybay)

Ships a `Dockerfile` that builds an nginx image serving `index.html` on port 80.
Set these env vars in deploybay (as a single bundled env block, then trigger a
deploy):

| Env var | Value |
|---|---|
| `SQL_IDENTITY` | `gheffner` — sent as `X-Identity` |
| `SQL_SECRET` | the `X-Internal-Secret` for the AWS SQL proxy |

Verify injection from an authenticated browser: `fetch('/debug-env.json').then(r=>r.json()).then(console.log)`.

## Local development

```sh
python3 _local_preview.py   # serves on :8788 and proxies /api/sql with headers
# open http://localhost:8788/
```
`config.js` and `_local_preview.py` are gitignored (they carry the same-origin
config / the secret for local use).
