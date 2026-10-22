# Sales Rep Availability Tracker

A dashboard for DoorLoop's **sales demo** Calendly availability: the seven prospect-size
round robins (`calendly.com/doorloop/demo`, `demo-1` … `demo-6`). Sibling of
`ob_calendar_av_tracker`; same deployment shape and design tokens.

## How the pieces fit

| Piece | What it is | Schedule (US Eastern, weekdays) |
|---|---|---|
| n8n **RevOps Calendly Availability Tracker** (`qtk3MkGZvOW2YsjQ`) | Reads each round robin's open slots from Calendly. Writes one tab per run to the [Google Sheet](https://docs.google.com/spreadsheets/d/1hdbSUfrP4y8hYbuCTDeR46jrIHpQlB7YASDlLQ3KSR8) (`Run_DD_Mon_YYYY_HH00`) and the same 7 rows to `capacity.rep_daily` (`source_key = 'sales_reps_availability'`, `type = 'RR'`) | every 2 hours, 8am–4pm |
| n8n **RevOps Daily Calendly Av Threshold Alert** (`ot4pOWf1Rr2P8YEE`) | Reads that run's tab and posts to #revops-calendar-availability, linking to this page | 8:10am, 12:10pm, 4:10pm |
| This page | Reads `capacity.rep_daily` | refreshes every 60s |

All three show the same numbers for a given run. The sheet tab, the database rows and this page's
"All segments" table carry identical values; the alert quotes the same `Available_Today` /
`Available_Next_Business_Day` counts. The Slack post links only to this page; the sheet is linked from here (the header and the "All segments" table).

| Sheet column | `rep_daily` column | Page label |
|---|---|---|
| `Available_Today` | `avail_today` | Today |
| `Available_Next_Business_Day` | `avail_tomorrow` | Tomorrow (Monday on a Friday) |
| `Available_In_The_Next_24_Hours` / `_48_Hours` | `avail_24h` / `avail_48h` | Next 24h / Next 48h |
| `Days_Until_Next_Available_Slot_From_Run_Date` | `days_until_available` | Days to slot (US Eastern days) |
| `Next_Available_Date` | `next_available_at` | Next slot |

`avail_tomorrow` holds the **next business day**, not calendar tomorrow: on a Friday it is
Monday's count. Rows written before 2026-10-22 hold calendar tomorrow (0 on Fridays). The column
keeps its old name because the table belongs to the shared `capacity` schema.

## Status: the same rule as the Slack alert

A segment is **Low** when it has **3 or fewer** slots. Until the 4pm snapshot that means slots
left **today**; from the 4pm snapshot on it means slots on the **next business day**, because by
late afternoon few slots are ever left today (GTM-2773). A calendar with no slot at all in
Calendly's 7-day horizon shows **No slots**.

These are pooled round robins: Calendly spreads bookings across whoever is in each pool, so
availability is tracked per round robin, not per rep. Several pools draw on the same reps, which
is why the trend chart shows the tightest segment at each run rather than a total.

## The two levels

| Route | View | Shows |
|---|---|---|
| `#/` | Overview | KPI tiles · 7 round-robin cards · trend chart · all-segments table |
| `#/tier/{segment}` | Round-robin detail | That calendar's numbers and its last 28 runs |

Routing is hash-based, so any drill-down state is a shareable link and the back button works.

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

It stubs the DOM, Chart.js and the SQL proxy, then drives every route against synthetic rows, at a weekday-morning snapshot and at the Friday 4pm snapshot —
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

