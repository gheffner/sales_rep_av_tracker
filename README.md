# Sales Rep Availability Tracker

A drill-down dashboard for DoorLoop's **sales demo** Calendly availability — the seven
prospect-size round-robins and every sales rep's own demo calendar. Sibling of
`ob_calendar_av_tracker`; same deployment shape, same design tokens, same three-level
drill-down.

Live data is produced by the n8n workflow **`revops_calendly_next_availability_v2`**, which
writes a snapshot into `capacity.rep_daily` with `source_key = 'sales_reps_availability'`
every 2 hours, 8am–6pm ET, weekdays.

## The three levels

| Route | View | Shows |
|---|---|---|
| `#/` | Overview | KPI tiles · 7 round-robin tier cards · rep table · band rollup · trend chart · tier table |
| `#/tier/{segment}` | Round-robin detail | That calendar's numbers and its last 28 runs |
| `#/rep/{name}` | Rep detail | That rep's latest numbers, band rank, and last 28 runs |

Routing is hash-based, so any drill-down state is a shareable link and the back button works.
Cards and table rows are clickable; a `›` chevron marks anything that drills.

## Two grains, one table

Both grains live in `capacity.rep_daily`, separated by the `type` column:

| `type` | Rows | `name` | `segment` |
|---|---|---|---|
| `RR` | 7 | Calendly event name (`DoorLoop Demo`) | unit band from the calendar's `internal_note` |
| `REP` | 21 | rep's Salesforce name | their Salesforce role band (`AE 1-20`, `SDR`, …) |

Rows written before the rep layer shipped are all `type = 'RR'`, so tier history and the
14-day sparklines are continuous across the switchover. Every query on this page filters by
`type`; adding rep rows to a query that doesn't filter would silently inflate the tier totals.

## Rep slot counts are additive — unlike the onboarding tracker's

The onboarding page deliberately refuses to sum a specialist's numbers, because one specialist
owns twelve event types that all draw on a single underlying free/busy. Here each rep is
measured on **exactly one** demo calendar, so summing across reps counts distinct people and a
band total is real capacity. That is why this page has a band rollup and the onboarding page
does not.

## What it shows

| Section | Meaning |
|---|---|
| KPI tiles | tiers available today, soonest slot anywhere, reps available today, tiers over the SLA |
| Tier cards | per size band: next slot, slots today / tomorrow / within 48h, 14-day sparkline |
| Rep table | every rep, worst availability first: band, hours to slot, today / tomorrow / 48h, status |
| Band rollup | per Salesforce role band: reps, how many are open today, total slots, earliest slot |
| Trend chart | one metric totalled across the round-robins, per run, last 14 days |
| Tier table | every tier at the latest run |

## The 1-day SLA

Health threshold = **next bookable slot within 1 day**, unchanged from v1 and from the
`RevOps Daily Calendly Av Threshold Alert` workflow. A calendar is green with a slot today,
amber tomorrow, red beyond that or with no slot at all in Calendly's 7-day horizon.

Note this is deliberately *not* the onboarding tracker's threshold, which is 48 hours.

"Days to slot" is recomputed in the browser from `next_available_at` in **Eastern** time rather
than read from the stored integer, which counts UTC days. The two agree for the current
8am–6pm ET cron; deriving it here keeps the page correct if that cron ever moves. "Hrs to slot"
is measured against **now**, not against `captured_at`, so it stays live between snapshots —
the page re-reads every 60s. Historical series stay capture-relative: a past run's distance to
its earliest slot has to be measured from that run, not from today.

## How the SQL proxy works

The dashboard never talks to AWS directly. It POSTs `{sql, params}` to `/api/sql` on its own
origin; nginx forwards to the AWS API Gateway and adds the `X-Identity` and `X-Internal-Secret`
headers from container env vars. **The credential never reaches the browser.** Numeric columns
come back as strings — the page wraps them in `Number()`.

## Deploy (deploybay)

Ships a `Dockerfile` that builds an nginx image serving `index.html` on port 80. Set these env
vars in deploybay (as a single bundled env block, then trigger a deploy):

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

`config.js` and `_local_preview.py` are gitignored (they carry the same-origin config / the
secret for local use). Note the port differs from the onboarding tracker's 8789 so both can run
at once.

There is also a dependency-free render test:

```sh
node _render_test.mjs index.html sales
```

It stubs the DOM, Chart.js and the SQL proxy, then drives every route against synthetic rows —
including fully-booked calendars and unknown hashes — and fails on any exception or stray
`undefined` in the output. It exists because the sibling onboarding dashboard shipped with an
undefined variable inside a template literal, which threw during render and left the page stuck
on "Loading availability…" with nothing in the UI to indicate why.

## Design notes

One data hue (`#2a78d6`) and **every chart is a single series**, so there is no categorical
palette and no legend — the panel title names the series. The status palette
(`#0ca30c` / `#fab219` / `#d03b3b`) is reserved for state and always ships with an icon **and**
a text label, never colour alone; amber badge text uses the darkened `#9a6a00` for contrast.
Every view pairs its chart with a table.

## Status

The round-robin tier views run on live data that has been flowing since February. The rep
views are **not yet verified against real rows** — `capacity.rep_daily` carries no
`type = 'REP'` rows until `revops_calendly_next_availability_v2` is imported and runs. Until
then the page renders the tiers and shows an inline note where the rep sections will appear.
All six routes have been exercised against synthetic rows via `_render_test.mjs`.
