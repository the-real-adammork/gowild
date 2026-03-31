# GoWild Flight Tracker — Design Spec

## Overview

A self-hosted Next.js application that monitors Frontier Airlines' GoWild and Discount Den flight availability. Runs on a Mac Mini, scrapes Frontier's booking system on a configurable schedule, and sends email notifications when flights matching user-defined criteria are found.

**Goal:** Eliminate the need to manually check the Frontier app/website for cheap flights by automating searches across configured routes and alerting when matching flights are available.

## Architecture

Single Next.js full-stack application:

```
┌─────────────────────────────────────────────────┐
│  Next.js App (localhost:3000)                    │
│                                                  │
│  ┌────────────────┐  ┌───────────────────────┐  │
│  │ shadcn UI      │  │ API Routes            │  │
│  │ Sidebar layout │  │ /api/routes     CRUD  │  │
│  │ 4 pages        │  │ /api/results    query │  │
│  │                │  │ /api/scrape     trigger│  │
│  │                │  │ /api/settings   CRUD  │  │
│  └────────────────┘  └───────────────────────┘  │
│                                                  │
│  ┌────────────────┐  ┌───────────────────────┐  │
│  │ Scraper        │  │ Scheduler             │  │
│  │ HTTP fetch to  │  │ node-cron             │  │
│  │ InternalSelect │  │ 4x/day + jitter       │  │
│  └────────────────┘  └───────────────────────┘  │
│                                                  │
│  ┌────────────────┐  ┌───────────────────────┐  │
│  │ SQLite         │  │ Email                 │  │
│  │ via Prisma     │  │ Nodemailer + Gmail    │  │
│  └────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Tech Stack

- **Runtime:** Node.js
- **Framework:** Next.js (App Router)
- **UI:** React + shadcn/ui + Tailwind CSS
- **ORM:** Prisma
- **Database:** SQLite (file-based, no server needed)
- **Scheduling:** node-cron (in-process)
- **Email:** Nodemailer with Gmail app password
- **Scraping:** Native fetch() to Frontier's endpoint, HTML parsing via cheerio

### Scheduler Initialization

The scheduler initializes via Next.js `instrumentation.ts` (stable since Next 15). This is the official mechanism for running code at server startup. On process restart (e.g., pm2 restart, reboot), the scheduler recalculates all run times immediately from the current SearchConfig. The "next scheduled scrape" shown on the Dashboard is always computed fresh from the cron config, not stored in memory alone.

**The app must run in production mode** (`next build && next start`) for stable scheduler behavior. Never use `next dev` for the scheduler — HMR will destroy and re-initialize it on every code change.

## Scraping Strategy

### Endpoint

Frontier's booking system (Navitaire "New Skies") exposes:

```
GET https://booking.flyfrontier.com/Flight/InternalSelect
  ?o1={origin}
  &d1={destination}
  &dd1={Mon%20DD,%20YYYY}   (e.g., Apr%2002,%202026)
  &ADT=1
  &mon=true
  &promo=
```

This returns HTML with embedded JSON in a `<script>` tag containing flight data, including fare availability and a `isGoWildFareEnabled` field.

**Note:** The `mon=true` parameter may control monthly/calendar view behavior. During implementation, we will test with and without it and document the actual response differences. The exact JSON structure will be documented in an appendix after the first manual fetch (see Implementation Prerequisites below).

### Request Headers

Each fetch request must include:
- `User-Agent`: A realistic browser user-agent string (rotated from a small pool)
- `Accept`: `text/html,application/xhtml+xml`
- `Accept-Language`: `en-US,en;q=0.9`
- `Cookie`: Empty in Phase 1; populated from Playwright session in Phase 2

### Scrape Flow

1. **Concurrency guard:** Check if a ScrapeRun with status "running" already exists. If so, reject the run.
2. Create a new ScrapeRun record with status "running".
3. Read SearchConfig and enabled Routes from database.
4. Calculate search dates: today (if `searchIncludeToday` is true) through today + `searchDaysOut` days. "Today" is determined in America/Los_Angeles timezone (follows DST).
5. For each route x each date:
   a. Fetch `Flight/InternalSelect` with route/date params and headers.
   b. Handle response codes:
      - **200:** Parse normally.
      - **302 redirect:** Follow redirect, extract any `Set-Cookie` header, retry the original request with the cookie.
      - **429 rate limit:** Exponential backoff (wait 30s, 60s, 120s), then skip if still failing.
      - **Cloudflare challenge / CAPTCHA page:** Log as error, flag that Phase 2 (Playwright auth) is likely needed. Continue with remaining routes.
   c. Parse embedded JSON from the HTML response.
   d. Extract flights for each configured fare tab (GoWild, Dollars).
   e. Wait a random 2-5 second delay before the next request.
6. For each flight found:
   a. Store in database with full segment details, price, and fare tab.
   b. Evaluate against route's filter criteria (nonstop-only, allowed layover airports, max layover duration, max price).
   c. Set `matchesFilters` flag.
7. For all matching flights in this run:
   a. Group by route, sort by price ascending.
   b. Send one consolidated email with all matches.
8. Update ScrapeRun record with statistics.
9. **Staleness check:** If a scrape run returns zero flights across all routes and all dates, mark the run status as "warning" instead of "success". This helps detect when the endpoint has changed or is returning empty/error responses.
10. **Save raw HTML:** Save one sample raw HTML response per scrape run to disk (`data/raw-responses/`) for debugging when the parser breaks due to Frontier site changes. Files older than 30 days are cleaned up automatically.

### Error Handling

- If a single request fails: log the error, skip that route/date, continue with the rest.
- ScrapeRun status: "success" if all succeeded, "warning" if all succeeded but zero flights found, "partial" if some failed, "failed" if all failed.
- Errors are stored on the ScrapeRun record and visible in the web UI.

### Deduplication

Within a single scrape run, flights are deduplicated by: `routeId + departureDate + fareTab + sorted concatenation of all segment flight numbers`. This handles multi-segment itineraries correctly (two different routings that share a first-segment flight number are treated as different flights).

Across scrape runs, new records are always created (preserving history of availability over time).

### Auth Strategy

**Phase 1 (initial build):** No authentication. Test whether `Flight/InternalSelect` returns GoWild pass-holder pricing without cookies.

**Phase 2 (if needed):** Add Playwright-based login module that:
- Launches headless Chromium
- Logs in to flyfrontier.com with stored credentials
- Saves session cookies to disk via `context.storage_state()`
- The scraper injects these cookies into fetch headers
- Re-authenticates when the session expires (detected by 302 redirect to login page)

The scraper is designed so auth is a drop-in addition — cookies are injected into fetch request headers without changing the core scrape logic.

### Implementation Prerequisites

Before writing the parser, we must:
1. Do a manual `curl` or fetch of the `Flight/InternalSelect` endpoint for a real route/date.
2. Save the raw HTML response as a test fixture.
3. Document in an appendix: how to locate the `<script>` tag containing flight JSON, the shape of the JSON object, how fare tabs are keyed, and sample data.
4. This response fixture becomes the foundation for parser tests.

## Data Model

### SearchConfig

Global settings for the scraper, editable from the Settings page. Seeded with defaults via `prisma/seed.ts` on initial setup.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | Int | | Primary key |
| searchDaysOut | Int | 7 | How many days ahead to search (valid range: 1-14) |
| searchIncludeToday | Boolean | true | Include same-day flights |
| fareTabs | String (JSON) | ["GoWild"] | Which fare tabs to scrape |
| emailTo | String | | Notification email address |
| emailEnabled | Boolean | true | Toggle notifications on/off |
| cronBaseHours | String (JSON) | [7,11,15,21] | Base scrape times in America/Los_Angeles (valid: 0-23) |
| cronJitterMinutes | Int | 30 | Random offset range (valid: 0-60) |

A default SearchConfig row is created by `prisma/seed.ts` as part of initial setup (`npx prisma db seed`).

### Route

User-configured flight routes to monitor.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| origin | String | Origin airport code (e.g., "SFO") |
| destination | String | Destination airport code (e.g., "SLC") |
| enabled | Boolean | Toggle route on/off |
| nonStopOnly | Boolean | Only match nonstop flights |
| maxLayoverMinutes | Int (nullable) | Max acceptable layover duration |
| allowedLayoverAirports | String (JSON) | Acceptable layover airports. Empty array means "any airport is acceptable" (use nonStopOnly=true to require nonstop). |
| maxPrice | Float (nullable) | Only alert below this price |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Cascade behavior:** Deleting a Route sets `routeId` to null on associated Flight records (flights are preserved for history but become "orphaned"). Alternatively, flights can be cascade-deleted — to be decided during implementation based on whether historical data for deleted routes has value.

### Flight

Individual flight results from scraping.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| routeId | Int | FK to Route |
| departureDate | String | Date searched (YYYY-MM-DD) |
| departureTime | DateTime | Departure timestamp |
| arrivalTime | DateTime | Arrival timestamp |
| totalDurationMinutes | Int | Total travel time in minutes |
| stops | Int | Number of stops (0 = nonstop) |
| segments | String (JSON) | Array of [{from, to, departTime, arriveTime, flightNo}] |
| layoverAirports | String (JSON) | e.g., ["DEN"] |
| layoverDurations | String (JSON) | Layover times in minutes, e.g., [95] |
| fareTab | String | "GoWild", "Dollars", or "Miles" |
| price | Float | Fare price (dollars for GoWild/Dollars tabs, miles for Miles tab) |
| priceUnit | String | "USD" or "miles" — derived from fareTab but stored explicitly for clarity |
| matchesFilters | Boolean | Whether this flight passed route filters |
| scrapeRunId | Int | FK to ScrapeRun |
| scrapedAt | DateTime | |

**Indexes:**
- `(routeId, departureDate)` — Results page filtering
- `(scrapeRunId)` — joining to ScrapeRun
- `(matchesFilters, scrapedAt)` — Dashboard "recent matches" query
- `(departureDate, price)` — sorting

**Assumptions:** `ADT=1` (one adult) is hardcoded. GoWild is one pass = one person.

### ScrapeRun

Audit trail for each scrape execution.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| startedAt | DateTime | |
| completedAt | DateTime (nullable) | |
| status | String | "running", "success", "warning", "partial", "failed" |
| routesSearched | Int | Total number of routes attempted |
| datesSearched | Int | Total number of date searches (routes x dates) |
| flightsFound | Int | Total flights scraped |
| matchesFound | Int | Flights that matched filters |
| error | String (nullable) | Error details if failed |

### Data Retention

Flight records are retained for 90 days. A cleanup job runs daily (as part of the midnight schedule recalculation) deleting Flight records with `scrapedAt` older than 90 days. ScrapeRun records are retained for 90 days as well.

## Web UI

### Layout

Sidebar navigation with four pages:

- **Dashboard** — summary view
- **Routes** — route CRUD
- **Results** — flight results table
- **Settings** — global config

Built with shadcn/ui components and Tailwind CSS.

### Dashboard Page

- Last scrape run status and timestamp
- Next scheduled scrape time
- Summary stats: matches found today, total routes monitored
- Quick view: cheapest matching flights across all routes (top 5-10), sorted by price
- **Empty states:** Before first scrape run: "No scrape runs yet — configure your routes and run your first scrape from Settings." During an active run: show a progress indicator.

### Routes Page

- Table of all configured routes with columns: origin, destination, nonstop-only, max price, enabled toggle
- "Add Route" button opens a form/dialog with fields:
  - Origin airport code
  - Destination airport code
  - Nonstop only (toggle)
  - Allowed layover airports (multi-input, airport codes)
  - Max layover duration (minutes)
  - Max price (dollars)
- Edit and delete actions on each row
- Enable/disable toggle per route

### Results Page

- Table of matching flights (default view), with toggle to show all results
- **Pagination:** 50 results per page with next/prev controls
- Columns: route, date, departure, arrival, duration, stops, fare type, price
- Sortable columns (default: price ascending)
- Filters: route dropdown, date range, fare tab, nonstop-only toggle
- Expandable rows showing full segment details (layover airports, layover durations, flight numbers)

### Settings Page

- Search window: days out (number input, range 1-14), include today (toggle)
- Fare tabs to scrape (multi-select: GoWild, Dollars, Miles)
- Schedule: base times (editable list of hours, range 0-23), jitter range (minutes, range 0-60)
- Email: recipient address, enable/disable toggle
- "Scrape Now" button to trigger an immediate run (disabled while a run is in progress)
- Scrape history: recent runs with status, stats, errors

## Email Notifications

One consolidated email per scrape run containing all matching flights.

### Format

```
Subject: GoWild Alert: 3 flights found — SFO->SLC from $31

Body:
==================================
 GoWild Flight Tracker — Mar 31, 2026
==================================

SFO -> SLC  |  Apr 2  |  $31 GoWild
  Nonstop  |  F9 1234
  Departs 6:15 AM -> Arrives 9:45 AM (2h 30m)

SFO -> SLC  |  Apr 3  |  $31 GoWild
  1 Stop (DEN, 1h 15m layover)
  F9 5678: SFO 9:04 PM -> DEN 12:37 AM
  F9 9012: DEN 1:52 AM -> SLC 3:20 AM (6h 16m total)

SLC -> SFO  |  Apr 1  |  $49 Discount Den
  Nonstop  |  F9 3456
  Departs 2:10 PM -> Arrives 3:45 PM (2h 35m)

==================================
2 routes searched | 7 days | 14 searches
View all results: http://localhost:3000/results
```

### Behavior

- Includes **all flights matching filters** from the current scrape run, sorted by price ascending
- One email per run (not per flight or per route)
- Only sent if there are matches
- Sent via Nodemailer with Gmail app password (configured via env var)
- Plain text format for universal compatibility
- "View all results" link uses `BASE_URL` env var (defaults to `http://localhost:3000`)

## Scheduling

- **node-cron** runs inside the Next.js process, initialized via `instrumentation.ts`
- **Timezone:** All schedule calculations use `America/Los_Angeles` (follows DST). Set `TZ=America/Los_Angeles` in environment.
- Base times configured in SearchConfig (default: 7am, 11am, 3pm, 9pm)
- Each run is offset by a random amount within the jitter range (default: +/- 30 minutes). Jitter is clamped so it never produces a negative time or wraps to the next day.
- Schedule is recalculated on process start and daily at midnight
- A "Scrape Now" button in the Settings page triggers an immediate run (guarded against concurrent runs)

## Configuration

Environment variables (`.env`):

```
DATABASE_URL="file:./prisma/gowild.db"
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
TZ="America/Los_Angeles"
NODE_ENV="production"
BASE_URL="http://localhost:3000"
```

All other configuration is stored in the database and editable through the Settings UI.

## Deployment

Runs on Mac Mini as a persistent process:

- **Build:** `next build && next start` (production mode required for stable scheduler)
- **Process manager:** Use `pm2` or a `launchd` plist to keep the app running across reboots
- Accessible at `http://localhost:3000` (or the Mac Mini's local IP from other devices on the network)
- No external hosting, no domain, no SSL needed — local network only

## Testing Strategy

Full test coverage is overkill for a personal tool. Focus on the fragile and high-value areas:

### High-Value Tests

- **`lib/scraper/parser.test.ts`** — Parse saved HTML response fixtures into typed Flight objects. This is the most fragile part of the system. When Frontier changes their HTML, this test tells you exactly what broke.
- **`lib/scraper/filters.test.ts`** — Filter logic edge cases: price exactly at maxPrice, layover exactly at maxLayoverMinutes, empty allowedLayoverAirports (means "any"), nonStopOnly with connecting flights.
- **`lib/scheduler.test.ts`** — Jitter calculation stays within bounds, never wraps to next day or goes negative.
- **`lib/email/formatter.test.ts`** — Email body formatting snapshot test.

### Test Fixtures Needed

- `tests/fixtures/frontier-response-nonstop.html` — Real saved response for a nonstop route
- `tests/fixtures/frontier-response-connecting.html` — Real saved response with connections
- `tests/fixtures/frontier-response-no-gowild.html` — Response when GoWild fares unavailable
- `tests/fixtures/frontier-response-error.html` — Error or redirect response

### Not Worth Testing

- CRUD API routes (Prisma handles this, single user)
- UI component tests (personal tool, visual verification)

## Future Upgrade Path

- **Auth module:** If GoWild pass-holder pricing requires authentication, add Playwright-based login that saves session cookies. Drop-in addition — no changes to core scraper logic.
- **Push notifications:** Could add Pushover, ntfy.sh, or similar alongside email.
- **More routes:** The system handles any number of routes; just be mindful of request volume (each route x date = one HTTP request with 2-5s delay).
