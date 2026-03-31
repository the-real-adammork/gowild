# GoWild Flight Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Next.js app that scrapes Frontier Airlines for GoWild/Discount Den flights, filters by user criteria, and sends email alerts.

**Architecture:** Single Next.js App Router application with Prisma/SQLite, shadcn/ui sidebar layout, node-cron scheduler initialized via instrumentation.ts, and Nodemailer for Gmail notifications. The scraper hits Frontier's `Flight/InternalSelect` endpoint directly via HTTP, parses embedded JSON from the HTML response.

**Tech Stack:** Next.js 15 (App Router), React, shadcn/ui, Tailwind CSS, Prisma, SQLite, node-cron, Nodemailer, cheerio, html-entities, vitest

**Spec:** `docs/superpowers/specs/2026-03-31-gowild-tracker-design.md`

---

## File Structure

```
gowild/
├── prisma/
│   ├── schema.prisma          # Data model: SearchConfig, Route, Flight, ScrapeRun
│   └── seed.ts                # Default SearchConfig row
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout with sidebar
│   │   ├── page.tsx           # Dashboard page
│   │   ├── routes/
│   │   │   └── page.tsx       # Routes CRUD page
│   │   ├── results/
│   │   │   └── page.tsx       # Results table page
│   │   ├── settings/
│   │   │   └── page.tsx       # Settings page
│   │   └── api/
│   │       ├── routes/
│   │       │   └── route.ts   # GET/POST routes
│   │       ├── routes/[id]/
│   │       │   └── route.ts   # PUT/DELETE single route
│   │       ├── results/
│   │       │   └── route.ts   # GET results with filters/pagination
│   │       ├── scrape/
│   │       │   └── route.ts   # POST trigger scrape, GET status
│   │       └── settings/
│   │           └── route.ts   # GET/PUT settings
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── scraper/
│   │   │   ├── fetcher.ts     # HTTP fetch with headers, retries, delays
│   │   │   ├── parser.ts      # Extract JSON from HTML, map to Flight objects
│   │   │   ├── filters.ts     # Apply route filters to flights
│   │   │   ├── runner.ts      # Orchestrate a full scrape run
│   │   │   └── types.ts       # TypeScript types for Frontier response
│   │   ├── scheduler/
│   │   │   └── index.ts       # node-cron setup, jitter calculation
│   │   ├── email/
│   │   │   └── formatter.ts   # Format matching flights into email body
│   │   └── email/
│   │       └── sender.ts      # Nodemailer transport and send
│   ├── components/
│   │   ├── sidebar.tsx        # Sidebar navigation
│   │   ├── routes/
│   │   │   ├── route-table.tsx
│   │   │   └── route-form.tsx
│   │   ├── results/
│   │   │   ├── results-table.tsx
│   │   │   └── results-filters.tsx
│   │   ├── settings/
│   │   │   ├── search-config-form.tsx
│   │   │   └── scrape-history.tsx
│   │   └── dashboard/
│   │       ├── stats-cards.tsx
│   │       └── recent-matches.tsx
│   └── instrumentation.ts     # Scheduler init on server start
├── tests/
│   ├── fixtures/
│   │   ├── frontier-response-nonstop.html
│   │   ├── frontier-response-connecting.html
│   │   ├── frontier-response-no-gowild.html
│   │   └── frontier-response-error.html
│   ├── lib/
│   │   ├── parser.test.ts
│   │   ├── filters.test.ts
│   │   ├── scheduler.test.ts
│   │   └── formatter.test.ts
├── data/
│   └── raw-responses/         # Saved HTML per scrape run (auto-cleaned after 30 days)
├── .env                       # Environment variables (from .env.example)
├── .env.example               # Template for environment variables
├── .gitignore
├── vitest.config.ts
├── package.json
└── tsconfig.json
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env`, `.gitignore`, `vitest.config.ts`
- Create: Next.js app structure, Tailwind config, shadcn setup

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /path/to/gowild
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-git
```

When prompted, accept defaults. Use `--no-git` since we already have a git repo. The directory has existing files (docs/, .git) — create-next-app will work in a non-empty directory but may prompt for confirmation.

- [ ] **Step 2: Install dependencies**

```bash
npm install prisma @prisma/client node-cron cheerio html-entities nodemailer date-fns
npm install -D @types/node-cron @types/nodemailer vitest @vitejs/plugin-react
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Select defaults: New York style, Zinc base color, CSS variables enabled.

Then add core components we'll need:

```bash
npx shadcn@latest add button card dialog form input label select switch table tabs badge separator sheet scroll-area toast
```

- [ ] **Step 4: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Add to `package.json` scripts:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Create .env and .env.example files**

Create `.env.example` (committed to git):

```
DATABASE_URL="file:./prisma/gowild.db"
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
TZ="America/Los_Angeles"
BASE_URL="http://localhost:3000"
```

Copy to `.env` (gitignored):

```
DATABASE_URL="file:./prisma/gowild.db"
GMAIL_USER=""
GMAIL_APP_PASSWORD=""
TZ="America/Los_Angeles"
BASE_URL="http://localhost:3000"
```

- [ ] **Step 6: Update .gitignore**

Append to `.gitignore`:

```
prisma/gowild.db
prisma/gowild.db-journal
data/raw-responses/
.superpowers/
.env
```

- [ ] **Step 7: Create data directory**

```bash
mkdir -p data/raw-responses
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with shadcn, Prisma, and test setup"
```

---

### Task 2: Prisma Schema and Seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model SearchConfig {
  id                 Int     @id @default(1)
  searchDaysOut      Int     @default(7)
  searchIncludeToday Boolean @default(true)
  fareTabs           String  @default("[\"GoWild\"]") // JSON array
  emailTo            String  @default("")
  emailEnabled       Boolean @default(true)
  cronBaseHours      String  @default("[7,11,15,21]") // JSON array
  cronJitterMinutes  Int     @default(30)
}

model Route {
  id                      Int      @id @default(autoincrement())
  origin                  String
  destination             String
  enabled                 Boolean  @default(true)
  nonStopOnly             Boolean  @default(false)
  maxLayoverMinutes       Int?
  allowedLayoverAirports  String   @default("[]") // JSON array, empty = any
  maxPrice                Float?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  flights                 Flight[]
}

model Flight {
  id                   Int      @id @default(autoincrement())
  routeId              Int
  route                Route    @relation(fields: [routeId], references: [id], onDelete: Cascade)
  departureDate        String   // YYYY-MM-DD
  departureTime        String   // e.g., "10:05 AM"
  arrivalTime          String   // e.g., "2:30 PM"
  totalDuration        String   // e.g., "9 hrs 35 min"
  stops                Int      // 0 = nonstop
  stopsText            String   // e.g., "1 Stop MCO", "Nonstop"
  segments             String   @default("[]") // JSON array
  layoverAirports      String   @default("[]") // JSON array
  layoverDurations     String   @default("[]") // JSON array of minutes
  fareTab              String   // "GoWild", "Dollars", "Miles"
  price                Float
  priceUnit            String   @default("USD") // "USD" or "miles"
  matchesFilters       Boolean  @default(false)
  scrapeRunId          Int
  scrapeRun            ScrapeRun @relation(fields: [scrapeRunId], references: [id], onDelete: Cascade)
  scrapedAt            DateTime @default(now())

  @@index([routeId, departureDate])
  @@index([scrapeRunId])
  @@index([matchesFilters, scrapedAt])
  @@index([departureDate, price])
}

model ScrapeRun {
  id             Int       @id @default(autoincrement())
  startedAt      DateTime  @default(now())
  completedAt    DateTime?
  status         String    @default("running") // running, success, warning, partial, failed
  routesSearched Int       @default(0)
  datesSearched  Int       @default(0)
  flightsFound   Int       @default(0)
  matchesFound   Int       @default(0)
  error          String?
  flights        Flight[]
}
```

- [ ] **Step 2: Create Prisma client singleton**

Create `src/lib/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 3: Create seed file**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.searchConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      searchDaysOut: 7,
      searchIncludeToday: true,
      fareTabs: JSON.stringify(['GoWild']),
      emailTo: '',
      emailEnabled: true,
      cronBaseHours: JSON.stringify([7, 11, 15, 21]),
      cronJitterMinutes: 30,
    },
  })

  console.log('Seeded default SearchConfig')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

Add to `package.json`:

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

- [ ] **Step 4: Install tsx for seed script**

```bash
npm install -D tsx
```

- [ ] **Step 5: Generate Prisma client and run seed**

```bash
npx prisma db push
npx prisma db seed
```

Expected: Database created at `prisma/gowild.db`, SearchConfig row seeded.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts src/lib/db.ts package.json package-lock.json
git commit -m "feat: add Prisma schema with SearchConfig, Route, Flight, ScrapeRun models"
```

---

### Task 3: Scraper Types

**Files:**
- Create: `src/lib/scraper/types.ts`

- [ ] **Step 1: Define TypeScript types for Frontier's response**

Create `src/lib/scraper/types.ts`:

```typescript
// Raw Frontier API response structure (embedded JSON in HTML)
export interface FrontierFlightResponse {
  journeys: FrontierJourney[]
}

export interface FrontierJourney {
  flights: FrontierFlight[] | null
}

export interface FrontierFlight {
  // GoWild fare fields
  isGoWildFareEnabled: boolean
  goWildFare: number
  goWildFareSeatsRemaining: number | null

  // Standard/Discount Den fare fields (field names to be confirmed from real response)
  // These may be in a fares array or separate fields — parser handles discovery
  fares?: Array<{ fareClass: string; price: number }> | null

  stopsText: string // e.g., "1 Stop MCO", "Nonstop"
  duration: string  // e.g., "9 hrs 35 min"
  legs: FrontierLeg[]
}

export interface FrontierLeg {
  departureDate: string           // ISO-ish, slice [5:10] gives "MM-DD"
  departureDateFormatted: string  // e.g., "10:05 AM"
  arrivalDate: string
  arrivalDateFormatted: string
  origin: string                  // IATA code
  destination: string             // IATA code
  flightNumber: string
}

// Parsed flight ready for database storage
export interface ParsedFlight {
  departureDate: string       // YYYY-MM-DD
  departureTime: string       // e.g., "10:05 AM"
  arrivalTime: string         // e.g., "2:30 PM"
  totalDuration: string       // e.g., "9 hrs 35 min"
  stops: number
  stopsText: string
  segments: ParsedSegment[]
  layoverAirports: string[]
  layoverDurations: number[]  // minutes
  fareTab: string             // "GoWild"
  price: number
  priceUnit: string           // "USD" or "miles"
}

export interface ParsedSegment {
  from: string
  to: string
  departTime: string
  arriveTime: string
  flightNo: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/scraper/types.ts
git commit -m "feat: add TypeScript types for Frontier API response and parsed flights"
```

---

### Task 4: HTML Parser (TDD)

**Files:**
- Create: `src/lib/scraper/parser.ts`
- Create: `tests/lib/parser.test.ts`
- Create: `tests/fixtures/frontier-response-nonstop.html`
- Create: `tests/fixtures/frontier-response-connecting.html`
- Create: `tests/fixtures/frontier-response-no-gowild.html`

- [ ] **Step 1: Create test fixtures**

We need realistic HTML fixtures. The key structure is: an HTML page with a `<script type="text/javascript">` tag containing a variable assignment with JSON flight data.

Create `tests/fixtures/frontier-response-nonstop.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Flight Select</title></head>
<body>
<script type="text/javascript">
var defined = {"journeys":[{"flights":[{"isGoWildFareEnabled":true,"goWildFare":31.00,"goWildFareSeatsRemaining":5,"stopsText":"Nonstop","duration":"2 hrs 30 min","legs":[{"departureDate":"2026-04-02T06:15:00","departureDateFormatted":"6:15 AM","arrivalDate":"2026-04-02T08:45:00","arrivalDateFormatted":"9:45 AM","origin":"SFO","destination":"SLC","flightNumber":"F9 1234"}]},{"isGoWildFareEnabled":true,"goWildFare":31.00,"goWildFareSeatsRemaining":3,"stopsText":"Nonstop","duration":"2 hrs 35 min","legs":[{"departureDate":"2026-04-02T14:10:00","departureDateFormatted":"2:10 PM","arrivalDate":"2026-04-02T16:45:00","arrivalDateFormatted":"5:45 PM","origin":"SFO","destination":"SLC","flightNumber":"F9 5678"}]}]}]};
</script>
</body>
</html>
```

Create `tests/fixtures/frontier-response-connecting.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Flight Select</title></head>
<body>
<script type="text/javascript">
var defined = {"journeys":[{"flights":[{"isGoWildFareEnabled":true,"goWildFare":31.00,"goWildFareSeatsRemaining":2,"stopsText":"1 Stop DEN","duration":"6 hrs 16 min","legs":[{"departureDate":"2026-04-03T21:04:00","departureDateFormatted":"9:04 PM","arrivalDate":"2026-04-04T00:37:00","arrivalDateFormatted":"12:37 AM","origin":"SFO","destination":"DEN","flightNumber":"F9 5678"},{"departureDate":"2026-04-04T01:52:00","departureDateFormatted":"1:52 AM","arrivalDate":"2026-04-04T03:20:00","arrivalDateFormatted":"3:20 AM","origin":"DEN","destination":"SLC","flightNumber":"F9 9012"}]},{"isGoWildFareEnabled":true,"goWildFare":31.00,"goWildFareSeatsRemaining":null,"stopsText":"1 Stop LAS","duration":"14 hrs 32 min","legs":[{"departureDate":"2026-04-03T19:32:00","departureDateFormatted":"7:32 PM","arrivalDate":"2026-04-03T21:14:00","arrivalDateFormatted":"9:14 PM","origin":"SFO","destination":"LAS","flightNumber":"F9 1111"},{"departureDate":"2026-04-04T06:30:00","departureDateFormatted":"6:30 AM","arrivalDate":"2026-04-04T11:04:00","arrivalDateFormatted":"11:04 AM","origin":"LAS","destination":"SLC","flightNumber":"F9 2222"}]}]}]};
</script>
</body>
</html>
```

Create `tests/fixtures/frontier-response-no-gowild.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Flight Select</title></head>
<body>
<script type="text/javascript">
var defined = {"journeys":[{"flights":[{"isGoWildFareEnabled":false,"goWildFare":0,"goWildFareSeatsRemaining":null,"stopsText":"Nonstop","duration":"2 hrs 30 min","legs":[{"departureDate":"2026-04-02T06:15:00","departureDateFormatted":"6:15 AM","arrivalDate":"2026-04-02T08:45:00","arrivalDateFormatted":"9:45 AM","origin":"SFO","destination":"SLC","flightNumber":"F9 1234"}]}]}]};
</script>
</body>
</html>
```

Create `tests/fixtures/frontier-response-error.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
<div class="error-page">
  <h1>An error occurred</h1>
  <p>We're sorry, but we were unable to process your request.</p>
</div>
</body>
</html>
```

- [ ] **Step 2: Write failing parser tests**

Create `tests/lib/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseFlightHtml } from '@/lib/scraper/parser'

const fixturesDir = join(__dirname, '..', 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8')
}

describe('parseFlightHtml', () => {
  it('parses nonstop GoWild flights', () => {
    const html = loadFixture('frontier-response-nonstop.html')
    const flights = parseFlightHtml(html, '2026-04-02')

    expect(flights).toHaveLength(2)
    expect(flights[0]).toMatchObject({
      departureDate: '2026-04-02',
      departureTime: '6:15 AM',
      arrivalTime: '9:45 AM',
      totalDuration: '2 hrs 30 min',
      stops: 0,
      stopsText: 'Nonstop',
      fareTab: 'GoWild',
      price: 31.00,
      priceUnit: 'USD',
      layoverAirports: [],
      layoverDurations: [],
    })
    expect(flights[0].segments).toHaveLength(1)
    expect(flights[0].segments[0]).toMatchObject({
      from: 'SFO',
      to: 'SLC',
      flightNo: 'F9 1234',
    })
  })

  it('parses connecting flights with layover details', () => {
    const html = loadFixture('frontier-response-connecting.html')
    const flights = parseFlightHtml(html, '2026-04-03')

    expect(flights).toHaveLength(2)

    // First flight: 1 Stop DEN
    expect(flights[0].stops).toBe(1)
    expect(flights[0].layoverAirports).toEqual(['DEN'])
    expect(flights[0].segments).toHaveLength(2)
    expect(flights[0].segments[0].from).toBe('SFO')
    expect(flights[0].segments[0].to).toBe('DEN')
    expect(flights[0].segments[1].from).toBe('DEN')
    expect(flights[0].segments[1].to).toBe('SLC')
    // Layover duration: 1:52 AM - 12:37 AM = 75 minutes
    expect(flights[0].layoverDurations[0]).toBe(75)

    // Second flight: 1 Stop LAS with long layover
    expect(flights[1].layoverAirports).toEqual(['LAS'])
  })

  it('returns empty array when no GoWild fares available', () => {
    const html = loadFixture('frontier-response-no-gowild.html')
    const flights = parseFlightHtml(html, '2026-04-02')

    expect(flights).toHaveLength(0)
  })

  it('throws on invalid HTML with no script tag', () => {
    expect(() => parseFlightHtml('<html><body></body></html>', '2026-04-02'))
      .toThrow()
  })

  it('handles null flights array in journey', () => {
    const html = `<!DOCTYPE html><html><body>
      <script type="text/javascript">
      var defined = {"journeys":[{"flights":null}]};
      </script></body></html>`
    const flights = parseFlightHtml(html, '2026-04-02')
    expect(flights).toHaveLength(0)
  })

  it('skips non-flight script tags and finds the correct one', () => {
    const html = `<!DOCTYPE html><html><body>
      <script type="text/javascript">var analytics = {"page":"flight"};</script>
      <script type="text/javascript">
      var defined = {"journeys":[{"flights":[{"isGoWildFareEnabled":true,"goWildFare":31.00,"goWildFareSeatsRemaining":5,"stopsText":"Nonstop","duration":"2 hrs 30 min","legs":[{"departureDate":"2026-04-02T06:15:00","departureDateFormatted":"6:15 AM","arrivalDate":"2026-04-02T08:45:00","arrivalDateFormatted":"9:45 AM","origin":"SFO","destination":"SLC","flightNumber":"F9 1234"}]}]}]};
      </script></body></html>`
    const flights = parseFlightHtml(html, '2026-04-02')
    expect(flights).toHaveLength(1)
    expect(flights[0].price).toBe(31)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/lib/parser.test.ts
```

Expected: FAIL — `parseFlightHtml` does not exist yet.

- [ ] **Step 4: Implement the parser**

Create `src/lib/scraper/parser.ts`:

```typescript
import * as cheerio from 'cheerio'
import { decode } from 'html-entities'
import type { FrontierFlightResponse, FrontierFlight, ParsedFlight, ParsedSegment } from './types'

export function parseFlightHtml(html: string, departureDate: string, fareTabs: string[] = ['GoWild']): ParsedFlight[] {
  const data = extractJsonFromHtml(html)
  const flights: ParsedFlight[] = []

  for (const journey of data.journeys) {
    if (!journey.flights) continue

    for (const flight of journey.flights) {
      // Extract GoWild fares if configured and available
      if (fareTabs.includes('GoWild') && flight.isGoWildFareEnabled && flight.goWildFare > 0) {
        flights.push(mapFrontierFlight(flight, departureDate, 'GoWild', flight.goWildFare, 'USD'))
      }

      // Extract Dollars/Discount Den fares if configured
      // Note: the exact field names for standard fares need to be confirmed from a real
      // response. The fares array or individual fare fields will be mapped here.
      // For now, if the flight has a fares array, extract matching fare tabs.
      if (flight.fares) {
        for (const fare of flight.fares) {
          if (fareTabs.includes('Dollars') && fare.fareClass === 'Dollars') {
            flights.push(mapFrontierFlight(flight, departureDate, 'Dollars', fare.price, 'USD'))
          }
          if (fareTabs.includes('Miles') && fare.fareClass === 'Miles') {
            flights.push(mapFrontierFlight(flight, departureDate, 'Miles', fare.price, 'miles'))
          }
        }
      }
    }
  }

  return flights
}

function extractJsonFromHtml(html: string): FrontierFlightResponse {
  const $ = cheerio.load(html)
  const scriptTags = $('script[type="text/javascript"]')

  // Try each script tag until we find one with flight data
  for (let i = 0; i < scriptTags.length; i++) {
    const scriptContent = $(scriptTags[i]).html()
    if (!scriptContent) continue

    const decoded = decode(scriptContent)
    const startIdx = decoded.indexOf('{')
    const endIdx = decoded.lastIndexOf('}')

    if (startIdx === -1 || endIdx === -1) continue

    try {
      const jsonStr = decoded.substring(startIdx, endIdx + 1)
      const parsed = JSON.parse(jsonStr)

      // Validate this is actually flight data
      if (parsed.journeys && Array.isArray(parsed.journeys)) {
        return parsed as FrontierFlightResponse
      }
    } catch {
      // Not valid JSON, try next script tag
      continue
    }
  }

  throw new Error('No script tag found containing flight data with journeys array')
}

function mapFrontierFlight(
  flight: FrontierFlight,
  departureDate: string,
  fareTab: string,
  price: number,
  priceUnit: string,
): ParsedFlight {
  const segments: ParsedSegment[] = flight.legs.map((leg) => ({
    from: leg.origin,
    to: leg.destination,
    departTime: leg.departureDateFormatted,
    arriveTime: leg.arrivalDateFormatted,
    flightNo: leg.flightNumber,
  }))

  const layoverAirports: string[] = []
  const layoverDurations: number[] = []

  // Calculate layovers between consecutive legs
  for (let i = 0; i < flight.legs.length - 1; i++) {
    const arriveTime = new Date(flight.legs[i].arrivalDate)
    const departTime = new Date(flight.legs[i + 1].departureDate)
    const layoverMinutes = Math.round((departTime.getTime() - arriveTime.getTime()) / 60000)

    layoverAirports.push(flight.legs[i].destination)
    layoverDurations.push(layoverMinutes)
  }

  const stops = flight.legs.length - 1
  const lastLeg = flight.legs[flight.legs.length - 1]

  return {
    departureDate,
    departureTime: flight.legs[0].departureDateFormatted,
    arrivalTime: lastLeg.arrivalDateFormatted,
    totalDuration: flight.duration,
    stops,
    stopsText: flight.stopsText,
    segments,
    layoverAirports,
    layoverDurations,
    fareTab,
    price,
    priceUnit,
  }
}

/** Generate dedup key for within-run deduplication */
export function flightDedupKey(routeId: number, departureDate: string, fareTab: string, segments: ParsedSegment[]): string {
  const sortedFlightNos = segments.map((s) => s.flightNo).sort().join('|')
  return `${routeId}:${departureDate}:${fareTab}:${sortedFlightNos}`
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/parser.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scraper/parser.ts tests/lib/parser.test.ts tests/fixtures/
git commit -m "feat: add Frontier HTML parser with test fixtures"
```

---

### Task 5: Flight Filters (TDD)

**Files:**
- Create: `src/lib/scraper/filters.ts`
- Create: `tests/lib/filters.test.ts`

- [ ] **Step 1: Write failing filter tests**

Create `tests/lib/filters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyFilters } from '@/lib/scraper/filters'
import type { ParsedFlight } from '@/lib/scraper/types'

function makeFlight(overrides: Partial<ParsedFlight> = {}): ParsedFlight {
  return {
    departureDate: '2026-04-02',
    departureTime: '6:15 AM',
    arrivalTime: '9:45 AM',
    totalDuration: '2 hrs 30 min',
    stops: 0,
    stopsText: 'Nonstop',
    segments: [{ from: 'SFO', to: 'SLC', departTime: '6:15 AM', arriveTime: '9:45 AM', flightNo: 'F9 1234' }],
    layoverAirports: [],
    layoverDurations: [],
    fareTab: 'GoWild',
    price: 31,
    priceUnit: 'USD',
    ...overrides,
  }
}

const defaultRouteFilters = {
  nonStopOnly: false,
  maxLayoverMinutes: null as number | null,
  allowedLayoverAirports: [] as string[],
  maxPrice: null as number | null,
}

describe('applyFilters', () => {
  it('passes a nonstop flight with no filters', () => {
    const flight = makeFlight()
    expect(applyFilters(flight, defaultRouteFilters)).toBe(true)
  })

  it('filters out connecting flights when nonStopOnly is true', () => {
    const flight = makeFlight({ stops: 1, layoverAirports: ['DEN'] })
    expect(applyFilters(flight, { ...defaultRouteFilters, nonStopOnly: true })).toBe(false)
  })

  it('passes nonstop flights when nonStopOnly is true', () => {
    const flight = makeFlight({ stops: 0 })
    expect(applyFilters(flight, { ...defaultRouteFilters, nonStopOnly: true })).toBe(true)
  })

  it('filters out flights above maxPrice', () => {
    const flight = makeFlight({ price: 50 })
    expect(applyFilters(flight, { ...defaultRouteFilters, maxPrice: 40 })).toBe(false)
  })

  it('passes flights at exactly maxPrice', () => {
    const flight = makeFlight({ price: 40 })
    expect(applyFilters(flight, { ...defaultRouteFilters, maxPrice: 40 })).toBe(true)
  })

  it('filters out flights with disallowed layover airports', () => {
    const flight = makeFlight({ stops: 1, layoverAirports: ['MCO'], layoverDurations: [60] })
    expect(applyFilters(flight, { ...defaultRouteFilters, allowedLayoverAirports: ['DEN', 'LAS'] })).toBe(false)
  })

  it('passes flights with allowed layover airports', () => {
    const flight = makeFlight({ stops: 1, layoverAirports: ['DEN'], layoverDurations: [60] })
    expect(applyFilters(flight, { ...defaultRouteFilters, allowedLayoverAirports: ['DEN', 'LAS'] })).toBe(true)
  })

  it('treats empty allowedLayoverAirports as "any airport OK"', () => {
    const flight = makeFlight({ stops: 1, layoverAirports: ['MCO'], layoverDurations: [60] })
    expect(applyFilters(flight, { ...defaultRouteFilters, allowedLayoverAirports: [] })).toBe(true)
  })

  it('filters out flights exceeding maxLayoverMinutes', () => {
    const flight = makeFlight({ stops: 1, layoverAirports: ['DEN'], layoverDurations: [180] })
    expect(applyFilters(flight, { ...defaultRouteFilters, maxLayoverMinutes: 120 })).toBe(false)
  })

  it('passes flights at exactly maxLayoverMinutes', () => {
    const flight = makeFlight({ stops: 1, layoverAirports: ['DEN'], layoverDurations: [120] })
    expect(applyFilters(flight, { ...defaultRouteFilters, maxLayoverMinutes: 120 })).toBe(true)
  })

  it('checks ALL layovers against max duration', () => {
    const flight = makeFlight({
      stops: 2,
      layoverAirports: ['DEN', 'LAS'],
      layoverDurations: [60, 180],
    })
    expect(applyFilters(flight, { ...defaultRouteFilters, maxLayoverMinutes: 120 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/filters.test.ts
```

Expected: FAIL — `applyFilters` does not exist.

- [ ] **Step 3: Implement filters**

Create `src/lib/scraper/filters.ts`:

```typescript
import type { ParsedFlight } from './types'

export interface RouteFilters {
  nonStopOnly: boolean
  maxLayoverMinutes: number | null
  allowedLayoverAirports: string[]
  maxPrice: number | null
}

export function applyFilters(flight: ParsedFlight, filters: RouteFilters): boolean {
  // Nonstop filter
  if (filters.nonStopOnly && flight.stops > 0) {
    return false
  }

  // Max price filter
  if (filters.maxPrice !== null && flight.price > filters.maxPrice) {
    return false
  }

  // Allowed layover airports (empty array = any allowed)
  if (filters.allowedLayoverAirports.length > 0 && flight.stops > 0) {
    const allowed = new Set(filters.allowedLayoverAirports)
    for (const airport of flight.layoverAirports) {
      if (!allowed.has(airport)) return false
    }
  }

  // Max layover duration
  if (filters.maxLayoverMinutes !== null && flight.stops > 0) {
    for (const duration of flight.layoverDurations) {
      if (duration > filters.maxLayoverMinutes) return false
    }
  }

  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/filters.test.ts
```

Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraper/filters.ts tests/lib/filters.test.ts
git commit -m "feat: add flight filter logic with edge case handling"
```

---

### Task 6: HTTP Fetcher

**Files:**
- Create: `src/lib/scraper/fetcher.ts`

- [ ] **Step 1: Implement the fetcher**

Create `src/lib/scraper/fetcher.ts`:

```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
]

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function formatDateParam(date: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mon = months[date.getMonth()]
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${mon}%20${day},%20${year}`
}

export function buildSearchUrl(origin: string, destination: string, date: Date): string {
  const dateStr = formatDateParam(date)
  return `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${dateStr}&ADT=1&mon=true&promo=`
}

export interface FetchResult {
  ok: boolean
  html?: string
  error?: string
  statusCode?: number
}

export async function fetchFlightPage(
  origin: string,
  destination: string,
  date: Date,
  cookies?: string,
): Promise<FetchResult> {
  const url = buildSearchUrl(origin, destination, date)

  const headers: Record<string, string> = {
    'User-Agent': randomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }

  if (cookies) {
    headers['Cookie'] = cookies
  }

  const maxRetries = 3
  let lastError = ''
  let currentCookies = cookies || ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const reqHeaders = { ...headers }
      if (currentCookies) reqHeaders['Cookie'] = currentCookies

      const response = await fetch(url, {
        headers: reqHeaders,
        redirect: 'manual', // Handle redirects manually to capture Set-Cookie
      })

      // Handle 302 redirect: extract cookies and retry
      if (response.status === 302 || response.status === 301) {
        const setCookie = response.headers.get('set-cookie')
        if (setCookie) {
          // Extract cookie name=value pairs from Set-Cookie header
          const cookieParts = setCookie.split(',').map((c) => c.split(';')[0].trim())
          currentCookies = cookieParts.join('; ')
        }
        const location = response.headers.get('location')
        if (location) {
          // Follow the redirect, then retry original URL with cookies
          await fetch(location.startsWith('http') ? location : `https://booking.flyfrontier.com${location}`, {
            headers: { ...reqHeaders, Cookie: currentCookies },
            redirect: 'follow',
          })
        }
        // Retry the original request with the captured cookies
        continue
      }

      if (response.status === 200) {
        const html = await response.text()

        // Check for Cloudflare challenge
        if (html.includes('cf-challenge') || html.includes('Just a moment')) {
          return { ok: false, error: 'Cloudflare challenge detected — Phase 2 auth likely needed', statusCode: 200 }
        }

        return { ok: true, html }
      }

      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 30000 // 30s, 60s, 120s
        lastError = `Rate limited (429), backing off ${backoffMs / 1000}s`
        await sleep(backoffMs)
        continue
      }

      return { ok: false, error: `HTTP ${response.status}`, statusCode: response.status }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return { ok: false, error: `Failed after ${maxRetries} retries: ${lastError}` }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomDelay(): Promise<void> {
  const ms = 2000 + Math.random() * 3000 // 2-5 seconds
  return sleep(ms)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/scraper/fetcher.ts
git commit -m "feat: add HTTP fetcher with user-agent rotation, retries, and rate limit handling"
```

---

### Task 7: Email Formatter (TDD)

**Files:**
- Create: `src/lib/email/formatter.ts`
- Create: `tests/lib/formatter.test.ts`

- [ ] **Step 1: Write failing formatter test**

Create `tests/lib/formatter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatEmail } from '@/lib/email/formatter'

describe('formatEmail', () => {
  it('formats a nonstop flight correctly', () => {
    const result = formatEmail({
      flights: [
        {
          origin: 'SFO',
          destination: 'SLC',
          departureDate: '2026-04-02',
          departureTime: '6:15 AM',
          arrivalTime: '9:45 AM',
          totalDuration: '2 hrs 30 min',
          stops: 0,
          stopsText: 'Nonstop',
          segments: [{ from: 'SFO', to: 'SLC', departTime: '6:15 AM', arriveTime: '9:45 AM', flightNo: 'F9 1234' }],
          fareTab: 'GoWild',
          price: 31,
        },
      ],
      routesSearched: 2,
      datesSearched: 14,
      baseUrl: 'http://localhost:3000',
    })

    expect(result.subject).toContain('1 flight found')
    expect(result.subject).toContain('SFO')
    expect(result.subject).toContain('$31')
    expect(result.body).toContain('SFO -> SLC')
    expect(result.body).toContain('Apr 2')
    expect(result.body).toContain('$31 GoWild')
    expect(result.body).toContain('Nonstop')
    expect(result.body).toContain('F9 1234')
    expect(result.body).toContain('6:15 AM')
    expect(result.body).toContain('9:45 AM')
    expect(result.body).toContain('2 hrs 30 min')
    expect(result.body).toContain('2 routes searched')
  })

  it('formats connecting flights with layover details', () => {
    const result = formatEmail({
      flights: [
        {
          origin: 'SFO',
          destination: 'SLC',
          departureDate: '2026-04-03',
          departureTime: '9:04 PM',
          arrivalTime: '3:20 AM',
          totalDuration: '6 hrs 16 min',
          stops: 1,
          stopsText: '1 Stop DEN',
          segments: [
            { from: 'SFO', to: 'DEN', departTime: '9:04 PM', arriveTime: '12:37 AM', flightNo: 'F9 5678' },
            { from: 'DEN', to: 'SLC', departTime: '1:52 AM', arriveTime: '3:20 AM', flightNo: 'F9 9012' },
          ],
          fareTab: 'GoWild',
          price: 31,
        },
      ],
      routesSearched: 1,
      datesSearched: 7,
      baseUrl: 'http://localhost:3000',
    })

    expect(result.body).toContain('1 Stop')
    expect(result.body).toContain('F9 5678')
    expect(result.body).toContain('F9 9012')
    expect(result.body).toContain('SFO')
    expect(result.body).toContain('DEN')
    expect(result.body).toContain('SLC')
  })

  it('sorts flights by price ascending', () => {
    const result = formatEmail({
      flights: [
        {
          origin: 'SLC', destination: 'SFO', departureDate: '2026-04-01',
          departureTime: '2:10 PM', arrivalTime: '3:45 PM', totalDuration: '2 hrs 35 min',
          stops: 0, stopsText: 'Nonstop',
          segments: [{ from: 'SLC', to: 'SFO', departTime: '2:10 PM', arriveTime: '3:45 PM', flightNo: 'F9 3456' }],
          fareTab: 'Dollars', price: 49,
        },
        {
          origin: 'SFO', destination: 'SLC', departureDate: '2026-04-02',
          departureTime: '6:15 AM', arrivalTime: '9:45 AM', totalDuration: '2 hrs 30 min',
          stops: 0, stopsText: 'Nonstop',
          segments: [{ from: 'SFO', to: 'SLC', departTime: '6:15 AM', arriveTime: '9:45 AM', flightNo: 'F9 1234' }],
          fareTab: 'GoWild', price: 31,
        },
      ],
      routesSearched: 2,
      datesSearched: 14,
      baseUrl: 'http://localhost:3000',
    })

    const lines = result.body.split('\n')
    const firstPrice = lines.findIndex((l) => l.includes('$31'))
    const secondPrice = lines.findIndex((l) => l.includes('$49'))
    expect(firstPrice).toBeLessThan(secondPrice)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/formatter.test.ts
```

Expected: FAIL — `formatEmail` does not exist.

- [ ] **Step 3: Implement the formatter**

Create `src/lib/email/formatter.ts`:

```typescript
import { format, parse } from 'date-fns'

interface EmailFlight {
  origin: string
  destination: string
  departureDate: string // YYYY-MM-DD
  departureTime: string
  arrivalTime: string
  totalDuration: string
  stops: number
  stopsText: string
  segments: Array<{ from: string; to: string; departTime: string; arriveTime: string; flightNo: string }>
  fareTab: string
  price: number
}

interface FormatEmailInput {
  flights: EmailFlight[]
  routesSearched: number
  datesSearched: number
  baseUrl: string
}

interface FormatEmailOutput {
  subject: string
  body: string
}

export function formatEmail(input: FormatEmailInput): FormatEmailOutput {
  const sorted = [...input.flights].sort((a, b) => a.price - b.price)
  const cheapest = sorted[0]

  const subject = `GoWild Alert: ${sorted.length} flight${sorted.length === 1 ? '' : 's'} found — ${cheapest.origin}->${cheapest.destination} from $${cheapest.price}`

  const today = format(new Date(), 'MMM d, yyyy')
  const lines: string[] = []

  lines.push('==================================')
  lines.push(` GoWild Flight Tracker — ${today}`)
  lines.push('==================================')
  lines.push('')

  for (const flight of sorted) {
    const dateObj = parse(flight.departureDate, 'yyyy-MM-dd', new Date())
    const dateStr = format(dateObj, 'MMM d')

    lines.push(`${flight.origin} -> ${flight.destination}  |  ${dateStr}  |  $${flight.price} ${flight.fareTab}`)

    if (flight.stops === 0) {
      lines.push(`  Nonstop  |  ${flight.segments[0].flightNo}`)
      lines.push(`  Departs ${flight.departureTime} -> Arrives ${flight.arrivalTime} (${flight.totalDuration})`)
    } else {
      lines.push(`  ${flight.stopsText}`)
      for (const seg of flight.segments) {
        lines.push(`  ${seg.flightNo}: ${seg.from} ${seg.departTime} -> ${seg.to} ${seg.arriveTime}`)
      }
      lines.push(`  Total: ${flight.totalDuration}`)
    }

    lines.push('')
  }

  lines.push('==================================')
  lines.push(`${input.routesSearched} routes searched | ${input.datesSearched} searches`)
  lines.push(`View all results: ${input.baseUrl}/results`)

  return { subject, body: lines.join('\n') }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/formatter.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/formatter.ts tests/lib/formatter.test.ts
git commit -m "feat: add email formatter with flight sorting and segment details"
```

---

### Task 8: Email Sender

**Files:**
- Create: `src/lib/email/sender.ts`

- [ ] **Step 1: Implement the sender**

Create `src/lib/email/sender.ts`:

```typescript
import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  }
  return transporter
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const transport = getTransporter()

  await transport.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    text: body,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/sender.ts
git commit -m "feat: add Nodemailer email sender with Gmail transport"
```

---

### Task 9: Scrape Runner (Orchestrator)

**Files:**
- Create: `src/lib/scraper/runner.ts`

- [ ] **Step 1: Implement the scrape runner**

Create `src/lib/scraper/runner.ts`:

```typescript
import { prisma } from '@/lib/db'
import { fetchFlightPage, randomDelay } from './fetcher'
import { parseFlightHtml, flightDedupKey } from './parser'
import { applyFilters, type RouteFilters } from './filters'
import { formatEmail } from '@/lib/email/formatter'
import { sendEmail } from '@/lib/email/sender'
import type { ParsedFlight } from './types'
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'

let isRunning = false

export async function runScrape(): Promise<void> {
  // Concurrency guard (in-memory + DB check)
  if (isRunning) {
    console.log('Scrape already in progress (memory guard), skipping')
    return
  }
  const runningInDb = await prisma.scrapeRun.findFirst({ where: { status: 'running' } })
  if (runningInDb) {
    console.log('Scrape already in progress (DB guard), skipping')
    return
  }

  isRunning = true
  const scrapeRun = await prisma.scrapeRun.create({ data: {} })

  try {
    const config = await prisma.searchConfig.findUnique({ where: { id: 1 } })
    if (!config) throw new Error('No SearchConfig found — run prisma db seed')

    const routes = await prisma.route.findMany({ where: { enabled: true } })
    if (routes.length === 0) {
      await prisma.scrapeRun.update({
        where: { id: scrapeRun.id },
        data: { status: 'success', completedAt: new Date(), routesSearched: 0, datesSearched: 0 },
      })
      return
    }

    // Calculate search dates and read fare tab config
    const dates = getSearchDates(config.searchDaysOut, config.searchIncludeToday)
    const fareTabs = JSON.parse(config.fareTabs) as string[]
    const totalSearches = routes.length * dates.length
    let totalFlights = 0
    let totalMatches = 0
    let failedSearches = 0
    let sampleHtmlSaved = false
    const seenFlights = new Set<string>() // Within-run deduplication

    const allMatchingFlights: Array<ParsedFlight & { origin: string; destination: string }> = []

    for (const route of routes) {
      const routeFilters: RouteFilters = {
        nonStopOnly: route.nonStopOnly,
        maxLayoverMinutes: route.maxLayoverMinutes,
        allowedLayoverAirports: JSON.parse(route.allowedLayoverAirports) as string[],
        maxPrice: route.maxPrice,
      }

      for (const date of dates) {
        const result = await fetchFlightPage(route.origin, route.destination, date)

        if (!result.ok || !result.html) {
          console.error(`Failed: ${route.origin}->${route.destination} ${date.toISOString().slice(0, 10)}: ${result.error}`)
          failedSearches++
          await randomDelay()
          continue
        }

        // Save one sample HTML per run for debugging
        if (!sampleHtmlSaved) {
          saveSampleHtml(scrapeRun.id, result.html)
          sampleHtmlSaved = true
        }

        try {
          const dateStr = date.toISOString().slice(0, 10)
          const flights = parseFlightHtml(result.html, dateStr, fareTabs)

          for (const flight of flights) {
            // Within-run deduplication
            const dedupKey = flightDedupKey(route.id, flight.departureDate, flight.fareTab, flight.segments)
            if (seenFlights.has(dedupKey)) continue
            seenFlights.add(dedupKey)

            const matchesFilters = applyFilters(flight, routeFilters)

            await prisma.flight.create({
              data: {
                routeId: route.id,
                departureDate: flight.departureDate,
                departureTime: flight.departureTime,
                arrivalTime: flight.arrivalTime,
                totalDuration: flight.totalDuration,
                stops: flight.stops,
                stopsText: flight.stopsText,
                segments: JSON.stringify(flight.segments),
                layoverAirports: JSON.stringify(flight.layoverAirports),
                layoverDurations: JSON.stringify(flight.layoverDurations),
                fareTab: flight.fareTab,
                price: flight.price,
                priceUnit: flight.priceUnit,
                matchesFilters,
                scrapeRunId: scrapeRun.id,
              },
            })

            totalFlights++
            if (matchesFilters) {
              totalMatches++
              allMatchingFlights.push({
                ...flight,
                origin: route.origin,
                destination: route.destination,
              })
            }
          }
        } catch (parseErr) {
          console.error(`Parse error: ${route.origin}->${route.destination}: ${parseErr}`)
          failedSearches++
        }

        await randomDelay()
      }
    }

    // Determine final status
    let status: string
    if (failedSearches === totalSearches) {
      status = 'failed'
    } else if (failedSearches > 0) {
      status = 'partial'
    } else if (totalFlights === 0) {
      status = 'warning'
    } else {
      status = 'success'
    }

    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: {
        status,
        completedAt: new Date(),
        routesSearched: routes.length,
        datesSearched: totalSearches,
        flightsFound: totalFlights,
        matchesFound: totalMatches,
      },
    })

    // Send email if there are matches
    if (allMatchingFlights.length > 0 && config.emailEnabled && config.emailTo) {
      const emailData = formatEmail({
        flights: allMatchingFlights,
        routesSearched: routes.length,
        datesSearched: totalSearches,
        baseUrl: process.env.BASE_URL || 'http://localhost:3000',
      })
      await sendEmail(config.emailTo, emailData.subject, emailData.body)
    }

    // Cleanup old data (90 day retention)
    await cleanupOldData()

    console.log(`Scrape complete: ${status} — ${totalFlights} flights, ${totalMatches} matches`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: { status: 'failed', completedAt: new Date(), error: errorMsg },
    })
    console.error('Scrape run failed:', errorMsg)
  } finally {
    isRunning = false
  }
}

function getSearchDates(daysOut: number, includeToday: boolean): Date[] {
  const dates: Date[] = []
  const now = new Date()
  const startOffset = includeToday ? 0 : 1

  for (let i = startOffset; i <= daysOut; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() + i)
    date.setHours(0, 0, 0, 0)
    dates.push(date)
  }

  return dates
}

function saveSampleHtml(runId: number, html: string): void {
  try {
    const dir = join(process.cwd(), 'data', 'raw-responses')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `run-${runId}.html`), html)
  } catch {
    // Non-critical, ignore
  }
}

async function cleanupOldData(): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  // Delete flights first to avoid cascade issues, then scrape runs
  await prisma.flight.deleteMany({ where: { scrapedAt: { lt: cutoff } } })
  await prisma.scrapeRun.deleteMany({
    where: { startedAt: { lt: cutoff }, flights: { none: {} } },
  })

  // Cleanup old HTML files
  try {
    const dir = join(process.cwd(), 'data', 'raw-responses')
    const files = readdirSync(dir)
    for (const file of files) {
      const filePath = join(dir, file)
      const stat = statSync(filePath)
      if (stat.mtime < cutoff) {
        unlinkSync(filePath)
      }
    }
  } catch {
    // Non-critical
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/scraper/runner.ts
git commit -m "feat: add scrape runner orchestrating fetch, parse, filter, email, and cleanup"
```

---

### Task 10: Scheduler (TDD)

**Files:**
- Create: `src/lib/scheduler/index.ts`
- Create: `src/instrumentation.ts`
- Create: `tests/lib/scheduler.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

Create `tests/lib/scheduler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateJitteredHours } from '@/lib/scheduler'

describe('calculateJitteredHours', () => {
  it('returns the correct number of scheduled times', () => {
    const times = calculateJitteredHours([7, 11, 15, 21], 30)
    expect(times).toHaveLength(4)
  })

  it('keeps times within jitter bounds', () => {
    // Run multiple times to test randomness
    for (let i = 0; i < 100; i++) {
      const times = calculateJitteredHours([7, 11, 15, 21], 30)
      for (let j = 0; j < times.length; j++) {
        const base = [7, 11, 15, 21][j]
        const baseMinutes = base * 60
        const { hour, minute } = times[j]
        const totalMinutes = hour * 60 + minute
        expect(totalMinutes).toBeGreaterThanOrEqual(baseMinutes - 30)
        expect(totalMinutes).toBeLessThanOrEqual(baseMinutes + 30)
      }
    }
  })

  it('clamps times to stay within 0:00-23:59', () => {
    // Base hour 0 with 30 min jitter should never go negative
    for (let i = 0; i < 100; i++) {
      const times = calculateJitteredHours([0], 30)
      expect(times[0].hour).toBeGreaterThanOrEqual(0)
      expect(times[0].minute).toBeGreaterThanOrEqual(0)
    }

    // Base hour 23 with 60 min jitter should never exceed 23:59
    for (let i = 0; i < 100; i++) {
      const times = calculateJitteredHours([23], 60)
      expect(times[0].hour).toBeLessThanOrEqual(23)
      expect(times[0].minute).toBeLessThanOrEqual(59)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/scheduler.test.ts
```

Expected: FAIL — `calculateJitteredHours` does not exist.

- [ ] **Step 3: Implement the scheduler**

Create `src/lib/scheduler/index.ts`:

```typescript
import cron from 'node-cron'
import { prisma } from '@/lib/db'
import { runScrape } from '@/lib/scraper/runner'

export interface ScheduledTime {
  hour: number
  minute: number
}

export function calculateJitteredHours(baseHours: number[], jitterMinutes: number): ScheduledTime[] {
  return baseHours.map((baseHour) => {
    const baseMinutes = baseHour * 60
    const jitter = Math.floor(Math.random() * (jitterMinutes * 2 + 1)) - jitterMinutes
    const totalMinutes = Math.max(0, Math.min(23 * 60 + 59, baseMinutes + jitter))
    return {
      hour: Math.floor(totalMinutes / 60),
      minute: totalMinutes % 60,
    }
  })
}

let scheduledJobs: cron.ScheduledTask[] = []
let currentScheduledTimes: ScheduledTime[] = []

export async function initScheduler(): Promise<void> {
  // Clear any existing jobs
  for (const job of scheduledJobs) {
    job.stop()
  }
  scheduledJobs = []

  const config = await prisma.searchConfig.findUnique({ where: { id: 1 } })
  if (!config) {
    console.log('No SearchConfig found, scheduler not started')
    return
  }

  const baseHours = JSON.parse(config.cronBaseHours) as number[]
  const times = calculateJitteredHours(baseHours, config.cronJitterMinutes)
  currentScheduledTimes = times

  for (const time of times) {
    const cronExpr = `${time.minute} ${time.hour} * * *`
    const job = cron.schedule(cronExpr, () => {
      console.log(`Scheduled scrape triggered at ${time.hour}:${String(time.minute).padStart(2, '0')}`)
      runScrape().catch((err) => console.error('Scheduled scrape failed:', err))
    }, { timezone: 'America/Los_Angeles' })
    scheduledJobs.push(job)
  }

  // Schedule daily reschedule at midnight to get new jitter values
  const rescheduleJob = cron.schedule('0 0 * * *', () => {
    console.log('Rescheduling with new jitter values')
    initScheduler().catch((err) => console.error('Reschedule failed:', err))
  }, { timezone: 'America/Los_Angeles' })
  scheduledJobs.push(rescheduleJob)

  const timeStrs = times.map((t) => `${t.hour}:${String(t.minute).padStart(2, '0')}`).join(', ')
  console.log(`Scheduler initialized: scrapes at ${timeStrs} PT`)
}

export function getScheduledTimes(): ScheduledTime[] {
  return currentScheduledTimes
}

export function getNextScheduledTime(): string | null {
  if (currentScheduledTimes.length === 0) return null

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // Find the next scheduled time today
  const upcoming = currentScheduledTimes
    .map((t) => t.hour * 60 + t.minute)
    .filter((m) => m > nowMinutes)
    .sort((a, b) => a - b)

  if (upcoming.length > 0) {
    const next = upcoming[0]
    return `${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')} PT (today)`
  }

  // All times passed today, next is tomorrow's first time
  const sorted = [...currentScheduledTimes].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  const first = sorted[0]
  return `${first.hour}:${String(first.minute).padStart(2, '0')} PT (tomorrow)`
}
```

- [ ] **Step 4: Create instrumentation.ts**

Create `src/instrumentation.ts`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('@/lib/scheduler')
    await initScheduler()
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/scheduler.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scheduler/index.ts src/instrumentation.ts tests/lib/scheduler.test.ts
git commit -m "feat: add node-cron scheduler with jitter, midnight reschedule, and instrumentation.ts init"
```

---

### Task 11: API Routes

**Files:**
- Create: `src/app/api/routes/route.ts`
- Create: `src/app/api/routes/[id]/route.ts`
- Create: `src/app/api/results/route.ts`
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/api/scrape/route.ts`

- [ ] **Step 1: Routes API (list + create)**

Create `src/app/api/routes/route.ts`:

```typescript
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const routes = await prisma.route.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(routes)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const route = await prisma.route.create({
    data: {
      origin: body.origin.toUpperCase().trim(),
      destination: body.destination.toUpperCase().trim(),
      enabled: body.enabled ?? true,
      nonStopOnly: body.nonStopOnly ?? false,
      maxLayoverMinutes: body.maxLayoverMinutes ?? null,
      allowedLayoverAirports: JSON.stringify(body.allowedLayoverAirports ?? []),
      maxPrice: body.maxPrice ?? null,
    },
  })
  return NextResponse.json(route, { status: 201 })
}
```

- [ ] **Step 2: Routes API (update + delete)**

Create `src/app/api/routes/[id]/route.ts`:

```typescript
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const route = await prisma.route.update({
    where: { id: parseInt(id) },
    data: {
      origin: body.origin?.toUpperCase().trim(),
      destination: body.destination?.toUpperCase().trim(),
      enabled: body.enabled,
      nonStopOnly: body.nonStopOnly,
      maxLayoverMinutes: body.maxLayoverMinutes,
      allowedLayoverAirports: body.allowedLayoverAirports !== undefined
        ? JSON.stringify(body.allowedLayoverAirports)
        : undefined,
      maxPrice: body.maxPrice,
    },
  })
  return NextResponse.json(route)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.route.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Results API**

Create `src/app/api/results/route.ts`:

```typescript
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = 50
  const matchesOnly = searchParams.get('matchesOnly') !== 'false'
  const routeId = searchParams.get('routeId')
  const fareTab = searchParams.get('fareTab')
  const nonStopOnly = searchParams.get('nonStopOnly') === 'true'
  const sortBy = searchParams.get('sortBy') || 'price'
  const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc'

  const where: Record<string, unknown> = {}
  if (matchesOnly) where.matchesFilters = true
  if (routeId) where.routeId = parseInt(routeId)
  if (fareTab) where.fareTab = fareTab
  if (nonStopOnly) where.stops = 0

  const [flights, total] = await Promise.all([
    prisma.flight.findMany({
      where,
      include: { route: true },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.flight.count({ where }),
  ])

  return NextResponse.json({
    flights,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
```

- [ ] **Step 4: Settings API**

Create `src/app/api/settings/route.ts`:

```typescript
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { initScheduler } from '@/lib/scheduler'

export async function GET() {
  const config = await prisma.searchConfig.findUnique({ where: { id: 1 } })
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const config = await prisma.searchConfig.update({
    where: { id: 1 },
    data: {
      searchDaysOut: body.searchDaysOut,
      searchIncludeToday: body.searchIncludeToday,
      fareTabs: body.fareTabs !== undefined ? JSON.stringify(body.fareTabs) : undefined,
      emailTo: body.emailTo,
      emailEnabled: body.emailEnabled,
      cronBaseHours: body.cronBaseHours !== undefined ? JSON.stringify(body.cronBaseHours) : undefined,
      cronJitterMinutes: body.cronJitterMinutes,
    },
  })

  // Reinitialize scheduler with new settings
  await initScheduler()

  return NextResponse.json(config)
}
```

- [ ] **Step 5: Scrape API**

Create `src/app/api/scrape/route.ts`:

```typescript
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { runScrape } from '@/lib/scraper/runner'

export async function POST() {
  // Check if already running
  const running = await prisma.scrapeRun.findFirst({ where: { status: 'running' } })
  if (running) {
    return NextResponse.json({ error: 'Scrape already in progress' }, { status: 409 })
  }

  // Run in background, return immediately
  runScrape().catch((err) => console.error('Manual scrape failed:', err))

  return NextResponse.json({ status: 'started' })
}

export async function GET() {
  const latestRun = await prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } })
  const recentRuns = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  return NextResponse.json({ latestRun, recentRuns })
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/
git commit -m "feat: add API routes for routes CRUD, results, settings, and scrape trigger"
```

---

### Task 12: Sidebar Layout

**Files:**
- Create: `src/components/sidebar.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create sidebar component**

Create `src/components/sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Route, Search, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/routes', label: 'Routes', icon: Route },
  { href: '/results', label: 'Results', icon: Search },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-muted/40">
      <div className="flex h-14 items-center border-b px-4">
        <h1 className="text-lg font-semibold">GoWild Tracker</h1>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Install lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 3: Update root layout**

Modify `src/app/layout.tsx` to use the sidebar:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GoWild Flight Tracker',
  description: 'Monitor Frontier Airlines GoWild flight availability',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add sidebar navigation layout with shadcn styling"
```

---

### Task 13: Dashboard Page

**Files:**
- Create: `src/components/dashboard/stats-cards.tsx`
- Create: `src/components/dashboard/recent-matches.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create stats cards component**

Create `src/components/dashboard/stats-cards.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface StatsCardsProps {
  lastRun: {
    status: string
    completedAt: string | null
    matchesFound: number
    flightsFound: number
  } | null
  totalRoutes: number
  matchesToday: number
}

export function StatsCards({ lastRun, totalRoutes, matchesToday }: StatsCardsProps) {
  const statusColors: Record<string, string> = {
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    partial: 'bg-orange-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500',
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Last Scrape</CardTitle>
          {lastRun && (
            <Badge className={statusColors[lastRun.status] || 'bg-gray-500'}>
              {lastRun.status}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {lastRun?.completedAt
              ? new Date(lastRun.completedAt).toLocaleString()
              : 'Never'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Routes Monitored</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalRoutes}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Matches Today</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{matchesToday}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Flights Found</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{lastRun?.flightsFound ?? 0}</div>
          <p className="text-xs text-muted-foreground">last run</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Create recent matches component**

Create `src/components/dashboard/recent-matches.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface MatchFlight {
  id: number
  departureDate: string
  departureTime: string
  arrivalTime: string
  totalDuration: string
  stops: number
  stopsText: string
  fareTab: string
  price: number
  route: { origin: string; destination: string }
}

export function RecentMatches({ flights }: { flights: MatchFlight[] }) {
  if (flights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cheapest Matching Flights</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No matches found yet. Configure your routes and run your first scrape from Settings.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cheapest Matching Flights</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead>Fare</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flights.map((flight) => (
              <TableRow key={flight.id}>
                <TableCell className="font-medium">
                  {flight.route.origin} → {flight.route.destination}
                </TableCell>
                <TableCell>{flight.departureDate}</TableCell>
                <TableCell>{flight.departureTime}</TableCell>
                <TableCell>{flight.arrivalTime}</TableCell>
                <TableCell>{flight.totalDuration}</TableCell>
                <TableCell>{flight.stopsText}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{flight.fareTab}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">${flight.price}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Wire up the dashboard page**

Modify `src/app/page.tsx`:

```tsx
import { prisma } from '@/lib/db'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentMatches } from '@/components/dashboard/recent-matches'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [lastRun, totalRoutes, matchesToday, cheapestFlights] = await Promise.all([
    prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.route.count({ where: { enabled: true } }),
    prisma.flight.count({
      where: {
        matchesFilters: true,
        scrapedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.flight.findMany({
      where: { matchesFilters: true },
      include: { route: true },
      orderBy: { price: 'asc' },
      take: 10,
    }),
  ])

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      <StatsCards
        lastRun={lastRun ? {
          status: lastRun.status,
          completedAt: lastRun.completedAt?.toISOString() ?? null,
          matchesFound: lastRun.matchesFound,
          flightsFound: lastRun.flightsFound,
        } : null}
        totalRoutes={totalRoutes}
        matchesToday={matchesToday}
      />
      <RecentMatches flights={cheapestFlights.map((f) => ({
        ...f,
        route: { origin: f.route.origin, destination: f.route.destination },
      }))} />
    </div>
  )
}
```

- [ ] **Step 4: Verify the app starts**

```bash
npm run dev
```

Open http://localhost:3000 — should see the dashboard with sidebar nav and empty state cards.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ src/app/page.tsx
git commit -m "feat: add dashboard page with stats cards and recent matches table"
```

---

### Task 14: Routes Page

**Files:**
- Create: `src/components/routes/route-table.tsx`
- Create: `src/components/routes/route-form.tsx`
- Create: `src/app/routes/page.tsx`

- [ ] **Step 1: Create route form component**

Create `src/components/routes/route-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface RouteFormProps {
  route?: {
    id: number
    origin: string
    destination: string
    nonStopOnly: boolean
    maxLayoverMinutes: number | null
    allowedLayoverAirports: string
    maxPrice: number | null
  }
  onSave: () => void
}

export function RouteForm({ route, onSave }: RouteFormProps) {
  const isEdit = !!route
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(route?.origin ?? '')
  const [destination, setDestination] = useState(route?.destination ?? '')
  const [nonStopOnly, setNonStopOnly] = useState(route?.nonStopOnly ?? false)
  const [maxLayoverMinutes, setMaxLayoverMinutes] = useState<string>(
    route?.maxLayoverMinutes?.toString() ?? ''
  )
  const [allowedLayoverAirports, setAllowedLayoverAirports] = useState(
    route ? JSON.parse(route.allowedLayoverAirports).join(', ') : ''
  )
  const [maxPrice, setMaxPrice] = useState<string>(route?.maxPrice?.toString() ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const airports = allowedLayoverAirports
      .split(',')
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean)

    const body = {
      origin,
      destination,
      nonStopOnly,
      maxLayoverMinutes: maxLayoverMinutes ? parseInt(maxLayoverMinutes) : null,
      allowedLayoverAirports: airports,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
    }

    const url = isEdit ? `/api/routes/${route.id}` : '/api/routes'
    const method = isEdit ? 'PUT' : 'POST'

    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setOpen(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? 'ghost' : 'default'} size={isEdit ? 'sm' : 'default'}>
          {isEdit ? 'Edit' : 'Add Route'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Route' : 'Add Route'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origin">Origin</Label>
              <Input id="origin" placeholder="SFO" value={origin} onChange={(e) => setOrigin(e.target.value)} maxLength={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destination">Destination</Label>
              <Input id="destination" placeholder="SLC" value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={3} required />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="nonStopOnly" checked={nonStopOnly} onCheckedChange={setNonStopOnly} />
            <Label htmlFor="nonStopOnly">Nonstop only</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowedAirports">Allowed layover airports (comma-separated)</Label>
            <Input id="allowedAirports" placeholder="DEN, LAS" value={allowedLayoverAirports} onChange={(e) => setAllowedLayoverAirports(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxLayover">Max layover (minutes)</Label>
              <Input id="maxLayover" type="number" placeholder="120" value={maxLayoverMinutes} onChange={(e) => setMaxLayoverMinutes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPrice">Max price ($)</Label>
              <Input id="maxPrice" type="number" placeholder="50" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
          </div>
          <Button type="submit" className="w-full">{isEdit ? 'Update' : 'Add Route'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create route table component**

Create `src/components/routes/route-table.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RouteForm } from './route-form'
import { Trash2 } from 'lucide-react'

interface Route {
  id: number
  origin: string
  destination: string
  enabled: boolean
  nonStopOnly: boolean
  maxLayoverMinutes: number | null
  allowedLayoverAirports: string
  maxPrice: number | null
}

export function RouteTable() {
  const [routes, setRoutes] = useState<Route[]>([])

  const fetchRoutes = useCallback(async () => {
    const res = await fetch('/api/routes')
    setRoutes(await res.json())
  }, [])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  async function toggleEnabled(id: number, enabled: boolean) {
    await fetch(`/api/routes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    fetchRoutes()
  }

  async function deleteRoute(id: number) {
    if (!confirm('Delete this route?')) return
    await fetch(`/api/routes/${id}`, { method: 'DELETE' })
    fetchRoutes()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Routes</h2>
        <RouteForm onSave={fetchRoutes} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Origin</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Nonstop Only</TableHead>
            <TableHead>Max Price</TableHead>
            <TableHead>Layover Airports</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {routes.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No routes configured. Add one to get started.
              </TableCell>
            </TableRow>
          )}
          {routes.map((route) => {
            const airports = JSON.parse(route.allowedLayoverAirports) as string[]
            return (
              <TableRow key={route.id}>
                <TableCell className="font-medium">{route.origin}</TableCell>
                <TableCell className="font-medium">{route.destination}</TableCell>
                <TableCell>{route.nonStopOnly ? <Badge>Yes</Badge> : 'No'}</TableCell>
                <TableCell>{route.maxPrice ? `$${route.maxPrice}` : '—'}</TableCell>
                <TableCell>
                  {airports.length > 0 ? airports.join(', ') : <span className="text-muted-foreground">Any</span>}
                </TableCell>
                <TableCell>
                  <Switch checked={route.enabled} onCheckedChange={(v) => toggleEnabled(route.id, v)} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <RouteForm route={route} onSave={fetchRoutes} />
                    <Button variant="ghost" size="sm" onClick={() => deleteRoute(route.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Create routes page**

Create `src/app/routes/page.tsx`:

```tsx
import { RouteTable } from '@/components/routes/route-table'

export default function RoutesPage() {
  return <RouteTable />
}
```

- [ ] **Step 4: Verify routes page works**

```bash
npm run dev
```

Navigate to http://localhost:3000/routes — add a test route (SFO → SLC) and verify it appears.

- [ ] **Step 5: Commit**

```bash
git add src/components/routes/ src/app/routes/
git commit -m "feat: add routes page with CRUD table, form dialog, and enable toggle"
```

---

### Task 15: Results Page

**Files:**
- Create: `src/components/results/results-table.tsx`
- Create: `src/components/results/results-filters.tsx`
- Create: `src/app/results/page.tsx`

- [ ] **Step 1: Create results filters component**

Create `src/components/results/results-filters.tsx`:

```tsx
'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface Route {
  id: number
  origin: string
  destination: string
}

interface FiltersProps {
  routes: Route[]
  filters: {
    routeId: string
    fareTab: string
    nonStopOnly: boolean
    matchesOnly: boolean
  }
  onChange: (filters: FiltersProps['filters']) => void
}

export function ResultsFilters({ routes, filters, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="space-y-1">
        <Label className="text-xs">Route</Label>
        <Select value={filters.routeId} onValueChange={(v) => onChange({ ...filters, routeId: v })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All routes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id.toString()}>
                {r.origin} → {r.destination}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Fare Type</Label>
        <Select value={filters.fareTab} onValueChange={(v) => onChange({ ...filters, fareTab: v })}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All fares" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fares</SelectItem>
            <SelectItem value="GoWild">GoWild</SelectItem>
            <SelectItem value="Dollars">Dollars</SelectItem>
            <SelectItem value="Miles">Miles</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-2 pt-5">
        <Switch id="nonstop" checked={filters.nonStopOnly} onCheckedChange={(v) => onChange({ ...filters, nonStopOnly: v })} />
        <Label htmlFor="nonstop">Nonstop only</Label>
      </div>
      <div className="flex items-center space-x-2 pt-5">
        <Switch id="matches" checked={filters.matchesOnly} onCheckedChange={(v) => onChange({ ...filters, matchesOnly: v })} />
        <Label htmlFor="matches">Matches only</Label>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create results table component**

Create `src/components/results/results-table.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ResultsFilters } from './results-filters'

interface Flight {
  id: number
  departureDate: string
  departureTime: string
  arrivalTime: string
  totalDuration: string
  stops: number
  stopsText: string
  segments: string
  layoverAirports: string
  layoverDurations: string
  fareTab: string
  price: number
  matchesFilters: boolean
  route: { origin: string; destination: string }
}

interface Route {
  id: number
  origin: string
  destination: string
}

export function ResultsTable() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filters, setFilters] = useState({
    routeId: 'all',
    fareTab: 'all',
    nonStopOnly: false,
    matchesOnly: true,
  })

  const fetchResults = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), matchesOnly: filters.matchesOnly.toString() })
    if (filters.routeId !== 'all') params.set('routeId', filters.routeId)
    if (filters.fareTab !== 'all') params.set('fareTab', filters.fareTab)
    if (filters.nonStopOnly) params.set('nonStopOnly', 'true')

    const res = await fetch(`/api/results?${params}`)
    const data = await res.json()
    setFlights(data.flights)
    setTotalPages(data.totalPages)
  }, [page, filters])

  useEffect(() => {
    fetch('/api/routes').then((r) => r.json()).then(setRoutes)
  }, [])

  useEffect(() => { fetchResults() }, [fetchResults])

  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold tracking-tight">Results</h2>
      <ResultsFilters routes={routes} filters={filters} onChange={(f) => { setFilters(f); setPage(1) }} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Route</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Departure</TableHead>
            <TableHead>Arrival</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Stops</TableHead>
            <TableHead>Fare</TableHead>
            <TableHead className="text-right">Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flights.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">No flights found.</TableCell>
            </TableRow>
          )}
          {flights.map((flight) => {
            const isExpanded = expandedId === flight.id
            const segments = JSON.parse(flight.segments) as Array<{from: string; to: string; departTime: string; arriveTime: string; flightNo: string}>
            return (
              <>
                <TableRow key={flight.id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : flight.id)}>
                  <TableCell>
                    {flight.stops > 0 ? (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
                  </TableCell>
                  <TableCell className="font-medium">{flight.route.origin} → {flight.route.destination}</TableCell>
                  <TableCell>{flight.departureDate}</TableCell>
                  <TableCell>{flight.departureTime}</TableCell>
                  <TableCell>{flight.arrivalTime}</TableCell>
                  <TableCell>{flight.totalDuration}</TableCell>
                  <TableCell>{flight.stopsText}</TableCell>
                  <TableCell><Badge variant="secondary">{flight.fareTab}</Badge></TableCell>
                  <TableCell className="text-right font-medium">${flight.price}</TableCell>
                </TableRow>
                {isExpanded && flight.stops > 0 && (
                  <TableRow key={`${flight.id}-details`}>
                    <TableCell></TableCell>
                    <TableCell colSpan={8} className="bg-muted/50 text-sm">
                      <div className="space-y-1 py-2">
                        {segments.map((seg, i) => (
                          <div key={i}>
                            <span className="font-medium">{seg.flightNo}</span>: {seg.from} {seg.departTime} → {seg.to} {seg.arriveTime}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create results page**

Create `src/app/results/page.tsx`:

```tsx
import { ResultsTable } from '@/components/results/results-table'

export default function ResultsPage() {
  return <ResultsTable />
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/results/ src/app/results/
git commit -m "feat: add results page with filterable, sortable, paginated table and expandable rows"
```

---

### Task 16: Settings Page

**Files:**
- Create: `src/components/settings/search-config-form.tsx`
- Create: `src/components/settings/scrape-history.tsx`
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Create settings form component**

Create `src/components/settings/search-config-form.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SearchConfigForm() {
  const [config, setConfig] = useState({
    searchDaysOut: 7,
    searchIncludeToday: true,
    fareTabs: ['GoWild'] as string[],
    emailTo: '',
    emailEnabled: true,
    cronBaseHours: [7, 11, 15, 21] as number[],
    cronJitterMinutes: 30,
  })
  const [saving, setSaving] = useState(false)
  const [scraping, setScraping] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((data) => {
      if (data) {
        setConfig({
          ...data,
          fareTabs: JSON.parse(data.fareTabs),
          cronBaseHours: JSON.parse(data.cronBaseHours),
        })
      }
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
  }

  async function handleScrapeNow() {
    setScraping(true)
    await fetch('/api/scrape', { method: 'POST' })
    setScraping(false)
  }

  function toggleFareTab(tab: string) {
    setConfig((prev) => ({
      ...prev,
      fareTabs: prev.fareTabs.includes(tab)
        ? prev.fareTabs.filter((t) => t !== tab)
        : [...prev.fareTabs, tab],
    }))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Search Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Days to search ahead</Label>
              <Input type="number" min={1} max={14} value={config.searchDaysOut}
                onChange={(e) => setConfig({ ...config, searchDaysOut: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="flex items-center space-x-2 pt-7">
              <Switch checked={config.searchIncludeToday}
                onCheckedChange={(v) => setConfig({ ...config, searchIncludeToday: v })} />
              <Label>Include today</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Fare tabs to scrape</Label>
            <div className="flex gap-2">
              {['GoWild', 'Dollars', 'Miles'].map((tab) => (
                <Button key={tab} variant={config.fareTabs.includes(tab) ? 'default' : 'outline'}
                  size="sm" onClick={() => toggleFareTab(tab)}>
                  {tab}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Base scrape times (hours, PT)</Label>
            <Input value={config.cronBaseHours.join(', ')}
              onChange={(e) => setConfig({
                ...config,
                cronBaseHours: e.target.value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n >= 0 && n <= 23),
              })} placeholder="7, 11, 15, 21" />
          </div>
          <div className="space-y-2">
            <Label>Jitter range (minutes)</Label>
            <Input type="number" min={0} max={60} value={config.cronJitterMinutes}
              onChange={(e) => setConfig({ ...config, cronJitterMinutes: parseInt(e.target.value) || 0 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Email Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email address</Label>
            <Input type="email" value={config.emailTo}
              onChange={(e) => setConfig({ ...config, emailTo: e.target.value })} placeholder="you@example.com" />
          </div>
          <div className="flex items-center space-x-2">
            <Switch checked={config.emailEnabled}
              onCheckedChange={(v) => setConfig({ ...config, emailEnabled: v })} />
            <Label>Send email notifications</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
        <Button variant="outline" onClick={handleScrapeNow} disabled={scraping}>
          {scraping ? 'Starting...' : 'Scrape Now'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create scrape history component**

Create `src/components/settings/scrape-history.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface ScrapeRun {
  id: number
  startedAt: string
  completedAt: string | null
  status: string
  routesSearched: number
  datesSearched: number
  flightsFound: number
  matchesFound: number
  error: string | null
}

const statusColors: Record<string, string> = {
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  partial: 'bg-orange-500',
  failed: 'bg-red-500',
  running: 'bg-blue-500',
}

export function ScrapeHistory() {
  const [runs, setRuns] = useState<ScrapeRun[]>([])

  useEffect(() => {
    fetch('/api/scrape').then((r) => r.json()).then((data) => setRuns(data.recentRuns || []))
  }, [])

  return (
    <Card>
      <CardHeader><CardTitle>Scrape History</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Routes</TableHead>
              <TableHead>Flights</TableHead>
              <TableHead>Matches</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">No scrape runs yet.</TableCell>
              </TableRow>
            )}
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="text-sm">{new Date(run.startedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge className={statusColors[run.status] || 'bg-gray-500'}>{run.status}</Badge>
                </TableCell>
                <TableCell>{run.routesSearched}</TableCell>
                <TableCell>{run.flightsFound}</TableCell>
                <TableCell>{run.matchesFound}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-48 truncate">{run.error || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create settings page**

Create `src/app/settings/page.tsx`:

```tsx
import { SearchConfigForm } from '@/components/settings/search-config-form'
import { ScrapeHistory } from '@/components/settings/scrape-history'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      <SearchConfigForm />
      <ScrapeHistory />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/ src/app/settings/
git commit -m "feat: add settings page with search config, schedule, email, and scrape history"
```

---

### Task 17: End-to-End Verification

- [ ] **Step 1: Start the dev server and verify all pages**

```bash
npm run dev
```

Visit each page and verify:
- http://localhost:3000 — Dashboard with empty state
- http://localhost:3000/routes — Add routes SFO→SLC and SLC→SFO
- http://localhost:3000/settings — Configure email, verify settings save
- http://localhost:3000/results — Empty state

- [ ] **Step 2: Test manual scrape**

Go to Settings, click "Scrape Now". Check the scrape history table for a new run. Check the Results page for any flights found.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (parser, filters, scheduler, formatter).

- [ ] **Step 4: Build for production**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit any fixes**

If any issues were found during verification, fix and commit.

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```

---

### Task 18: Production Deployment Config

**Files:**
- Create: `ecosystem.config.js` (pm2 config)

- [ ] **Step 1: Create pm2 config**

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'gowild-tracker',
    script: 'npm',
    args: 'start',
    cwd: '/path/to/gowild',
    env: {
      NODE_ENV: 'production',
      TZ: 'America/Los_Angeles',
    },
    restart_delay: 5000,
    max_restarts: 10,
  }],
}
```

- [ ] **Step 2: Document startup commands in README**

This is not creating documentation — it's the operational instructions needed to run the app. Add to the top of `ecosystem.config.js` as comments:

```javascript
// Setup:
//   npm install
//   npx prisma db push
//   npx prisma db seed
//   cp .env.example .env  (then fill in GMAIL credentials)
//   npm run build
//
// Run with pm2:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup  (to persist across reboots)
//
// Or run directly:
//   npm start
```

- [ ] **Step 3: Commit**

```bash
git add ecosystem.config.js
git commit -m "feat: add pm2 config for production deployment on Mac Mini"
```
