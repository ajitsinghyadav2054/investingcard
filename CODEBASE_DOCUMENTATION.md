# Commodity Market Data Aggregation & Reporting System
## Complete Codebase Documentation

---

## Table of Contents
1. [Overview](#overview)
2. [Technologies & Libraries](#technologies--libraries)
3. [Architecture Overview](#architecture-overview)
4. [Data Sources & APIs](#data-sources--apis)
5. [Module-by-Module Functionality](#module-by-module-functionality)
6. [Data Pipeline & Code Flow](#data-pipeline--code-flow)
7. [Web Scraping Details](#web-scraping-details)
8. [Configuration & Environment](#configuration--environment)

---

## Overview

This codebase is a **distributed data aggregation and reporting system** that collects commodity market data from multiple sources and generates comprehensive market briefs. The system aggregates:

- **OHLC candlestick data** (Open, High, Low, Close) from internal APIs
- **Daily market data** (settlements, volumes, open interest) from internal APIs
- **Excel warehouse data** (inventory stocks, deltas) from local shared drives
- **Economic calendar events** from investing.com via web scraping

The processed data is compiled into:
1. **DOCX Word Document** - Detailed daily contract settlement summary with outrights and spreads
2. **Adaptive Cards** - Teams-compatible formatted briefs (excluded from this documentation)

**Primary Use Case:** Automated daily commodity market reports for traders and risk managers, executed on a scheduled cadence (morning and afternoon).

---

## Technologies & Libraries

### Core Dependencies
| Library | Purpose | Version |
|---------|---------|---------|
| **axios** | HTTP client for API requests | ^1.7.0 |
| **cheerio** | DOM parser for web scraping HTML | ^1.2.0 |
| **docx** | Generate Word (.docx) documents programmatically | ^9.6.1 |
| **xlsx** | Read/parse Excel files (.xlsx) | ^0.18.5 |
| **dotenv** | Load environment variables from .env file | ^16.4.0 |
| **node-cron** | Schedule recurring tasks (used in main entry points) | ^3.0.3 |

### Runtime Environment
- **Node.js** - JavaScript runtime
- **Windows 10+** - Target OS (hardcoded paths use Windows format)
- **.env file** - Stores sensitive tokens and base URLs

### External Services
- **Internal OHLC API** - Candlestick data endpoint
- **Internal Daily Market API** - Settlement and market data
- **Internal TAS API** - Trade audit/trace service for volume deltas
- **Investing.com** - Web scraping for economic calendar events

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Entry Points                              │
│                 (masterBrief.js, afternoonDocBrief.js)           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
         ┌─────────────┼──────────────┐
         │             │              │
         ▼             ▼              ▼
    ┌─────────┐  ┌──────────┐  ┌──────────────┐
    │fetchWord│  │fetchDaily│  │fetchCalendar │
    │  Data   │  │ Levels   │  │   Events     │
    └────┬────┘  └────┬─────┘  └──────┬───────┘
         │             │              │
         │        ┌────┴────────────┬─┘
         │        │                 │
         ▼        ▼                 ▼
    ┌────────┬──────────┐    ┌────────────────┐
    │Internal│Internal  │    │Investing.com   │
    │ APIs   │ APIs     │    │ Web Scraping   │
    │(OHLC,  │(Daily,   │    └────────────────┘
    │ TAS)   │ TAS)     │
    └────────┴──────────┘
         │
         └─────────────────────────┬──────────┐
                                   │          │
                              ┌────▼─┐  ┌────▼───────────┐
                              │Build │  │buildWordDoc    │
                              │Card  │  │                │
                              └──────┘  └────────────────┘
                                   │          │
                                   ▼          ▼
                              ┌──────────────────────┐
                              │  Output Delivery     │
                              │ (Teams, OneDrive)    │
                              └──────────────────────┘
```

### Design Patterns Used

1. **Parallel Data Fetching** - Multiple independent API calls run simultaneously using `Promise.all()`
2. **Batching/Chunking** - Large data sets split into smaller chunks to avoid hitting API rate limits
   - Spread OHLC: chunks of 45
   - TAS requests: chunks of 50
3. **Sequential API Calls with Delays** - When APIs are rate-sensitive, introduce throttling
   - fetchDailyLevels: 1500ms delay between settlement fetches
   - fetchWordData: 150ms delay between outright fetches, 500-2500ms between TAS batches
4. **Error Handling & Graceful Degradation** - Missing data returns null/empty arrays instead of crashing
5. **Retry Logic (Optional)** - Can be extended with exponential backoff for 429 errors

---

## Data Sources & APIs

### 1. Internal OHLC API
**Purpose:** Fetch candlestick (Open, High, Low, Close) price data

**Endpoints:**
- `https://qh-api.corp.hertshtengroup.com/api/v2/ohlc/`

**Parameters:**
```javascript
{
    instruments: "LCCK26,KCK26,CCK26,..." // comma-separated contract codes
    interval: "1H" or "1D"                 // hourly or daily candles
    start: 1234567890                      // Unix timestamp (seconds)
    end: 1234567890
    count: 1                               // recent N candles
}
```

**Authentication:** Bearer token in `Authorization` header

**Response Format:**
```json
[
    {
        "product": "LCCK26",
        "time": 1234567890,      // Unix timestamp
        "open": 2500.50,
        "high": 2510.00,
        "low": 2490.25,
        "close": 2505.75,
        "volume": 15000
    }
]
```

### 2. Internal Daily Market API
**Purpose:** Fetch daily settlement prices, volumes, and open interest

**Endpoints:**
- `https://qh-api.corp.hertshtengroup.com/api/dailymarketdata/`

**Parameters:**
```javascript
{
    qhcode: "LCCK26"           // single contract code
    limit: 2                    // retrieve N recent records
}
```

**Response Format:**
```json
{
    "results": [
        {
            "datetime": "2026-03-24T12:00:00Z",
            "close": 2505.75,      // Settlement price
            "volume": 15000,
            "oi": 250000           // Open Interest
        }
    ]
}
```

### 3. Internal TAS (Trade Audit Service) API
**Purpose:** Fetch trade-level volume deltas (buyer vs. seller volume)

**Endpoints:**
- `https://qh-api.corp.hertshtengroup.com/api/v2/tas/`

**Method:** POST with JSON body

**Request Format:**
```json
{
    "products": [
        { "id": "LCCK26", "dates": ["2026-03-24"], "start": "00:00:00", "end": "23:59:59" }
    ]
}
```

**Response Format:**
```json
{
    "data": [
        { "instrument": "LCCK26", "side": 1, "qty": 500 },   // side: 1=buy, -1=sell
        { "instrument": "LCCK26", "side": -1, "qty": 300 }
    ],
    "total_pages": 1
}
```

### 4. Investing.com Economic Calendar (Web Scraping)
**Purpose:** Fetch US high-impact economic events for today

**Endpoint:** `https://www.investing.com/economic-calendar/Service/getCalendarFilteredData`

**Method:** POST with URL-encoded form data

**Key Parameters:**
```javascript
{
    "country[]": "5",           // 5 = United States
    "importance[]": "3",        // 3 = High Impact (★★★)
    "dateFrom": "2026-03-24",
    "dateTo": "2026-03-24",
    "timeZone": "8",            // 8 = London/GMT
    "submitFilters": "1"
}
```

**Headers (Required for spoofing as browser):**
```javascript
{
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://www.investing.com/economic-calendar/",
    "Origin": "https://www.investing.com",
    "Cookie": "timezone_id=8;"
}
```

**Response:** HTML table rows (not JSON)
- Parsed using **cheerio** DOM parser
- Selects `tr.js-event-item` rows
- Extracts: time, currency, importance stars, event name, actual, forecast, previous

**Rate Limiting:** Returns HTTP 429 when rate limit exceeded; code returns empty array gracefully

### 5. Excel Warehouse Data (Local File System)
**Purpose:** Fetch inventory/stock data from local shared drives

**Files Read:**
```
C:\Users\Ajit.yadav\hertshtengroup.com\
├── Dinesh Chinnadurai - KC\coffee_cert_aggregate.xlsx
├── Dinesh Chinnadurai - RC\RC Daily and Monthly stocks.xlsx
├── Dinesh Chinnadurai - Cocoa\
│   └── Stocks\
│       ├── LDN cocoa\aggregate_report.xlsx
│       └── US cocoa\
│           ├── Cocoa_Bags_Aggregate_final.xlsx
│           └── Cocoa Certified stocks - Lots.xlsx
```

**Extraction Logic:**
- Read specific sheet names (e.g., "Daily_Changes", "Data")
- Extract last non-empty row from spreadsheet
- Parse columns: Date, Total, daily_total_delta, etc.
- Convert Excel date serials to YYYY-MM-DD format

---

## Module-by-Module Functionality

### 1. **fetchCalendarEvents()** - Web Scraping Investing.com
**File:** `helpers/fetchCalendar.js`

#### Purpose
Fetch today's 3-star (high-impact) US economic events from investing.com

#### Step-by-Step Process

**Step 1: Build Request Body**
```javascript
const body = new URLSearchParams();
body.append("country[]", "5");           // US only
body.append("importance[]", "3");        // 3-star events
body.append("dateFrom", "2026-03-24");
body.append("dateTo", "2026-03-24");
body.append("timeZone", "8");            // GMT timezone
body.append("submitFilters", "1");
```

**Step 2: POST Request with Browser Spoofing**
```javascript
// Headers make the request appear as if from a browser, not a bot
// This prevents investing.com from blocking the request
const headers = {
    "User-Agent": "Mozilla/5.0...",           // ← Pretend to be Chrome browser
    "X-Requested-With": "XMLHttpRequest",     // ← AJAX request marker
    "Referer": "https://www.investing.com/...", // ← Appear to come from their site
    "Origin": "https://www.investing.com",
    "Cookie": "timezone_id=8;"
};

const response = await axios.post(
    "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData",
    body.toString(),
    { headers }
);
```

**Step 3: Error Handling**
```javascript
try {
    // HTTP request
} catch (err) {
    // 429 = Rate limit exceeded (detected and handled gracefully)
    console.log("⚠️ Rate limit enforced (429). Skipping calendar block.");
    return [];  // Return empty array instead of crashing
}
```

**Step 4: Parse HTML Response**
Investing.com returns HTML table rows (not JSON):
```html
<tr class="js-event-item" data-event-datetime="2026/03/24 13:30:00">
    <td>US</td>
    <td>USD</td>
    <td><i class="grayFullBullishIcon"></i><i class="grayFullBullishIcon"></i><i class="grayFullBullishIcon"></i></td>
    <td>Core PCE m/m</td>
    <td>0.2%</td>
    <td>0.3%</td>
    <td>0.4%</td>
</tr>
```

Using **cheerio** (jQuery-like DOM parser):
```javascript
const $ = cheerio.load(`<table>${html}</table>`);

$("tr.js-event-item").each((_, row) => {
    const $row = $(row);
    const tds = $row.find("td");
    
    // Extract data from specific column indices
    const rawDatetime = $row.attr("data-event-datetime");  // e.g., "2026/03/24 09:30:00"
    const currency = $(tds[1]).text();                      // "USD"
    const stars = $(tds[2]).find("i.grayFullBullishIcon").length;  // Count star icons (1-3)
    const eventName = $(tds[3]).text();                     // "Core PCE m/m"
    const actual = $(tds[4]).text();                        // "0.2%"
    const forecast = $(tds[5]).text();                      // "0.3%"
    const previous = $(tds[6]).text();                      // "0.4%"
});
```

**Step 5: Timezone Conversion (NY → GMT)**
Investing.com returns times in US Eastern Time; need to convert to GMT:
```javascript
// Input: "2026/03/24 09:30:00" (in New York time)
const nyDateString = "2026-03-24T09:30:00";

// Detect if daylight saving time (EDT) or standard time (EST)
const formatterNY = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short'
});
const isEDT = formatterNY.format(tempDate).includes('EDT');
const nyOffset = isEDT ? "-04:00" : "-05:00";  // EDT = UTC-4, EST = UTC-5

// Convert to actual UTC date
const realDate = new Date(nyDateString + nyOffset);

// Format as GMT string
const formatterLondon = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
});
// Output: "2026-03-24 13:30" (GMT equivalent)
```

**Step 6: Filter & Return**
```javascript
// Only keep 3-star events with valid event names
if (stars === 3 && eventName) {
    events.push({
        datetimeUtc,    // e.g., "2026-03-24 13:30"
        currency,       // e.g., "USD"
        impact,         // "High", "Med", or "Low"
        eventName,      // e.g., "Core PCE m/m"
        actual,         // Actual released value
        forecast,       // Expected value
        previous        // Previous period value
    });
}
```

#### Why This is Web Scraping (Not an Official API)
- ✗ Response is HTML, not JSON
- ✗ Must parse DOM using cheerio library
- ✗ User-Agent spoofing required (indicates anti-bot detection)
- ✗ Rate limiting with 429 errors (indicates they don't want scrapers)
- ✗ HTML structure could break anytime
- ✓ No official documentation or API key provided

#### Return Value
```javascript
[
    {
        datetimeUtc: "2026-03-24 13:30",
        currency: "USD",
        impact: "High",
        eventName: "Core PCE Price Index m/m",
        actual: "0.2%",
        forecast: "0.3%",
        previous: "0.4%"
    }
]
```

---

### 2. **fetchDailyLevels()** - Fetch Daily Market Levels
**File:** `helpers/fetchDailyLevels.js`

#### Purpose
Fetch previous day's High, Low, Close, and current Settlement for 7 front-month commodity contracts

#### Contracts Tracked
```javascript
[
    "LCCK26"  // C (London Cocoa)
    "CCK26"   // CC (NY Cocoa)
    "KCK26"   // KC (Arabica Coffee)
    "LKCK26"  // RC (Robusta Coffee)
    "CTN26"   // CT (Cotton)
    "SGN26"   // SB (Raw Sugar)
    "LSGQ26"  // W (White Sugar)
]
```

#### Data Flow

**Phase 1: Fetch OHLC Historical Data**
```javascript
// Get last 7 days of daily candles (1D interval)
const ohlcRes = await axios.get(OHLC_API_BASE, {
    params: {
        instruments: "LCCK26,CCK26,KCK26,...",
        interval: "1D",                          // Daily candles
        start: Math.floor(Date.now()/1000) - 7*86400,  // 7 days ago
        end: Math.floor(Date.now()/1000)        // Today
    },
    headers: { Authorization: token }
});
```

**Phase 2: Extract Previous Trading Day Levels**
```javascript
// Sort candles by timestamp
const candles = ohlcRes.data.filter(c => c.product === "LCCK26");
candles.sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

// Find the most recent candle BEFORE today's midnight
const todayMidnight = new Date(Date.UTC(...)).getTime() / 1000;
const prevCandles = candles.filter(c => toSeconds(c.time) < todayMidnight);

if (prevCandles.length > 0) {
    const lastCandle = prevCandles[prevCandles.length - 1];
    prevClose = lastCandle.close;    // Yesterday's close
    prevHigh = lastCandle.high;      // Yesterday's high
    prevLow = lastCandle.low;        // Yesterday's low
}
```

**Phase 3: Fetch Current Settlement**
```javascript
// For each contract, fetch today's settlement price
// Add 1500ms delay between calls to avoid rate limiting
await sleep(1500);

const dailyRes = await axios.get(DAILY_MARKET_API_BASE, {
    params: { qhcode: "LCCK26", limit: 1 },
    headers: { Authorization: token }
});

settlement = dailyRes.data.results[0].close;  // Today's settlement
```

#### Return Value
```javascript
[
    {
        label: "C (London Cocoa)",
        close: 2505.75,        // Previous close
        settlement: 2508.50,   // Current settlement
        high: 2510.00,         // Previous high
        low: 2490.25           // Previous low
    }
]
```

---

### 3. **fetchWordData()** - Multi-Phase Data Aggregation
**File:** `helpers/fetchWordData.js`

#### Purpose
Fetch comprehensive market data for 7 commodity groups with outrights (individual contracts) and spreads (contract pairs), including volumes and deltas.

#### Commodity Groups
```javascript
{
    "C (London Cocoa)": ["LCCK26", "LCCN26", "LCCU26", ...],
    "CC (NY Cocoa)": ["CCK26", "CCN26", "CCU26", ...],
    "KC (KC Arabica)": ["KCK26", "KCN26", "KCU26", ...],
    // ... 4 more groups
}
```

#### Four-Phase Processing

**PHASE 1: Sequentially Fetch Outrights Data**

For each contract code, fetch daily market data:
```javascript
for (const contract of group.contracts) {
    await sleep(150);  // Throttle requests
    
    const res = await axios.get(DAILY_MARKET_DATA_API, {
        params: { qhcode: "LCCK26", limit: 2 },  // Get last 2 days
        headers: { Authorization: token }
    });
    
    const data = res.data.results;
    
    if (data.length >= 2) {
        contract.settle = data[0].close;                      // Today's settlement
        contract.chg = data[0].close - data[1].close;        // Change from yesterday
        contract.volume = data[0].volume;                     // Today's volume
        contract.oi = data[0].oi;                             // Open Interest
        contract.delOi = data[0].oi - data[1].oi;            // Change in OI
    }
}
```

**PHASE 2: Build Spreads Offline**

A "spread" is the price difference between two consecutive contract months:
```javascript
// For each group, create spreads between consecutive contracts
for (let i = 0; i < contracts.length - 1; i++) {
    const leg1 = contracts[i];      // e.g., LCCK26 (March)
    const leg2 = contracts[i + 1];  // e.g., LCCN26 (May)
    
    // Spread = Leg1 Price - Leg2 Price
    spread.settle = leg1.settle - leg2.settle;
    spread.chg = leg1.chg - leg2.chg;
    
    // Code format: "LCCK26-N26" (front month minus back month last 3 chars)
    spread.code = `${leg1.code}-${leg2.code.slice(-3)}`;
    spread.label = `${leg1.label}-${leg2.label.slice(-3)}`;
}
```

**PHASE 3: Fetch Spread Volumes via OHLC (Batched)**

Spreads are not in daily market data; fetch via OHLC API in chunks of 45:
```javascript
for (let i = 0; i < allSpreadCodes.length; i += 45) {
    const chunk = allSpreadCodes.slice(i, i + 45).join(",");
    
    const ohlcRes = await axios.get(OHLC_API, {
        params: {
            instruments: "LCCK26-N26,LCCN26-U26,...",
            interval: "1D",
            count: 1  // Just the latest 1D candle
        },
        headers: { Authorization: token }
    });
    
    // Map volumes back to spread objects
    for (const ohlcCandle of ohlcRes.data) {
        const matchingSpread = spreads.find(s => s.code === ohlcCandle.product);
        if (matchingSpread) {
            matchingSpread.volume = ohlcCandle.volume;
        }
    }
    
    await sleep(500);  // Throttle between chunks
}
```

**PHASE 4: Fetch Volume Deltas via TAS API (Batched)**

TAS (Trade Audit Service) provides buyer vs. seller volume data:
```javascript
// Batch all outrights + spreads into TAS request format
const tasBatchProducts = [
    { id: "LCCK26", dates: ["2026-03-24"], start: "00:00:00", end: "23:59:59" },
    { id: "LCCK26-N26", dates: ["2026-03-24"], start: "00:00:00", end: "23:59:59" },
    // ... for all contracts and spreads
];

// Fetch in chunks of 50
for (let i = 0; i < tasBatchProducts.length; i += 50) {
    const chunk = tasBatchProducts.slice(i, i + 50);
    
    const tasRes = await axios.post(TAS_API, { products: chunk }, {
        headers: { Authorization: token }
    });
    
    // Response: Array of trades with instrument, side, qty
    const trades = tasRes.data.data;
    
    // Map trades back to contracts/spreads
    // side: 1 = buy, -1 = sell
    // delVolume = buy volume - sell volume
    for (const contract of group.contracts) {
        const contractTrades = trades.filter(t => t.instrument === contract.code);
        let buyVol = 0, sellVol = 0;
        
        contractTrades.forEach(t => {
            if (t.side === 1) buyVol += t.qty;
            else if (t.side === -1) sellVol += t.qty;
        });
        
        contract.delVolume = buyVol - sellVol;
    }
    
    await sleep(2500);  // Longer throttle between TAS requests
}
```

#### Return Value
```javascript
[
    {
        title: "C (London Cocoa)",
        contracts: [
            {
                label: "LCCK26",
                settle: 2505.75,
                chg: 15.50,
                volume: 12500,
                oi: 250000,
                delOi: -5000,
                delVolume: 3500
            }
        ],
        spreads: [
            {
                label: "LCCK26-N26",
                settle: 120.25,    // March - May
                chg: 5.50,
                volume: 8900,
                delVolume: 2100
            }
        ]
    }
]
```

---

### 4. **fetchExcelData()** - Read Warehouse Excel Files
**File:** `helpers/fetchExcelData.js`

#### Purpose
Extract inventory and stock data from local Excel files maintained by analysts

#### Data Extracted

| File | Sheet | Extract | Purpose |
|------|-------|---------|---------|
| `coffee_cert_aggregate.xlsx` | "Daily_Changes" | Last row, "Total" column | KC coffee inventory |
| `RC Daily and Monthly stocks.xlsx` | "ICE EU Robusta stocks Daily" | RC-TOT column | RC robusta inventory |
| `aggregate_report.xlsx` | "Data" | daily_total_delta column | LCC cocoa delta |
| `Cocoa_Bags_Aggregate_final.xlsx` | "Daily_Changes" | "Total Bags" column | CC cocoa bags count |
| `Cocoa Certified stocks - Lots.xlsx` | "Daily_Changes" | "Total Lots" column | CC cocoa lots count |

#### Extraction Logic

**Example: KC Coffee**
```javascript
// Open file with xlsx library (preserves formulas, doesn't evaluate)
const wb = XLSX.readFile("coffee_cert_aggregate.xlsx", { cellDates: false });
const ws = wb.Sheets["Daily_Changes"];

// Convert sheet to 2D array
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

// Find header row
const headers = data[0];  // ["Date", "Cert A", "Cert B", ..., "Total"]

// Find column indices
const dateIdx = headers.indexOf("Date");
const totalIdx = headers.indexOf("Total");

// Find last non-empty row
function getLastRow(data) {
    let last = data.length - 1;
    while (last > 0 && data[last].every(c => c === null || c === "")) {
        last--;
    }
    return data[last];
}

const lastRow = getLastRow(data);
const date = lastRow[dateIdx];          // Excel serial date
const total = lastRow[totalIdx];        // Inventory number

// Convert Excel date serial to YYYY-MM-DD
// Excel serial: days since Jan 1, 1900
function excelDateToStr(serial) {
    const utcDays = Math.floor(serial - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().split("T")[0];  // "2026-03-24"
}
```

**Example: RC Robusta (Complex Layout)**
```javascript
// RC file has different structure - need to find header row first
const wb = XLSX.readFile("RC Daily and Monthly stocks.xlsx");
const ws = wb.Sheets["ICE EU Robusta stocks Daily"];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Search for row containing "Timestamp"
let headerRowIdx = 10;
for (let i = 0; i < 20; i++) {
    if (data[i]?.some(c => c === "Timestamp")) {
        headerRowIdx = i;
        break;
    }
}

// Find RC-TOT column (last numeric column > 1000)
const firstDataRow = data[headerRowIdx + 1];
let rcTotCol = -1;
for (let j = firstDataRow.length - 1; j >= 0; j--) {
    if (typeof firstDataRow[j] === "number" && firstDataRow[j] > 1000) {
        rcTotCol = j;
        break;
    }
}

// Data in first row might have formula that xlsx can't evaluate
// So we find next dated row and infer current date as +1 day
let firstDatedSerial = null;
for (let i = headerRowIdx + 1; i < headerRowIdx + 10; i++) {
    const row = data[i];
    for (let j = 0; j < row.length; j++) {
        if (typeof row[j] === "number" && row[j] > 43831) {  // Valid Excel date range
            firstDatedSerial = row[j];
            break;
        }
    }
}

// Extract data
const total = firstDataRow[rcTotCol];
const date = firstDatedSerial + 1;  // One day ahead (today)
```

#### Return Value
```javascript
{
    kc: { date: "2026-03-24", total: 125000 },
    rc: { date: "2026-03-24", total: 350000 },
    lcc: { date: "2026-03-24", daily_total_delta: 5000 },
    ccBags: { date: "2026-03-24", total: 45000 },
    ccLots: { date: "2026-03-24", total: 2800 }
}
```

---

### 5. **buildWordDocBuffer()** - Generate Word Document
**File:** `helpers/buildWordDoc.js`

#### Purpose
Create a professional .docx file with formatted tables showing:
1. Outrights data (contracts with settle, change, volume, OI, deltas)
2. Spreads data (inter-month spreads with settle, change, volume, deltas)

#### Document Structure

**Header Section:**
```
┌────────────────────────────────────────┐
│   Daily Contract Settlement Summary     │
│     Tuesday, 24 Mar 2026 | 15:00 GMT    │
└────────────────────────────────────────┘
```

**For Each Commodity Group:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ C (LONDON COCOA)                                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ OUTRIGHTS TABLE:                                                         │
│ Contract | Settle  | Chg  | Volume | OI      | ΔOI    | ΔVolume          │
│ LCCK26   | 2505.75 | +15.5| 12500  | 250000  | -5000  | +3500            │
│ LCCN26   | 2385.50 | +12.3| 11200  | 245000  | -3000  | +2800            │
├──────────────────────────────────────────────────────────────────────────┤
│ SPREADS TABLE:                                                           │
│ Contract   | Settle  | Chg  | Volume | ΔVolume                          │
│ LCCK26-N26 | 120.25  | +3.2 | 8900   | +2100                            │
│ LCCN26-U26 | 110.50  | +2.1 | 7800   | +1800                            │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Implementation

**Create Table Headers:**
```javascript
const outrightHeaders = ["Contract", "Settle", "Chg", "Volume", "OI", "ΔOI", "ΔVolume"];

function buildHeaderRow(headers) {
    return new TableRow({
        tableHeader: true,
        children: headers.map(text =>
            new TableCell({
                shading: { fill: "1E1E1E" },      // Dark background
                margins: { top: 100, bottom: 100 },
                children: [
                    new Paragraph({
                        alignment: text === "Contract" ? AlignmentType.LEFT : AlignmentType.RIGHT,
                        children: [
                            new TextRun({
                                text: text,
                                color: "A0A0A0",   // Light gray text
                                bold: true,
                                size: 20
                            })
                        ]
                    })
                ]
            })
        )
    });
}
```

**Create Data Rows with Color Coding:**
```javascript
// Green for positive changes, red for negative
function getColorCode(val) {
    if (val === null || isNaN(val)) return "FFFFFF";  // White
    if (val > 0) return "00B050";                     // Green
    if (val < 0) return "FF0000";                     // Red
    return "FFFFFF";
}

// Format numbers with thousands separator
function formatNum(val) {
    if (val === null || isNaN(val)) return "—";
    return Number(val).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Create data row
const dataRow = new TableRow({
    children: [
        new TableCell({
            shading: { fill: "242424" },  // Slightly lighter than header
            children: [
                new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [
                        new TextRun({
                            text: "LCCK26",
                            bold: true,
                            color: "E0E0E0"  // Light gray
                        })
                    ]
                })
            ]
        }),
        new TableCell({
            children: [
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({
                            text: formatNum(2505.75),
                            color: "E0E0E0"
                        })
                    ]
                })
            ]
        }),
        new TableCell({
            children: [
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({
                            text: "+15.50",
                            color: "00B050"  // Green for positive
                        })
                    ]
                })
            ]
        })
        // ... more cells
    ]
});
```

**Assemble Document:**
```javascript
const doc = new Document({
    sections: [{
        children: [
            headerParagraph,
            titleParagraph,
            outrightTable,
            spreadTable,
            footerParagraph
        ]
    }]
});

// Export to binary buffer
const packer = new Packer();
const docBuffer = await packer.toBuffer(doc);
```

#### Return Value
Binary buffer ready to write to disk or send as attachment:
```javascript
// Write to OneDrive
fs.writeFileSync("C:\\Users\\...\\Daily_Contract_Summary.docx", docBuffer);
```

---

### 6. **buildCombinedCard()** - Format Teams Adaptive Card
**File:** `helpers/buildCombinedCard.js`

*(Excluded from detailed documentation as per user request - focus on Teams alert part)*

---

## Data Pipeline & Code Flow

### Full Execution Timeline

```
AFTERNOON REPORT (15:00 Local Time)
═════════════════════════════════════

1. afternoonDocBrief.js starts
   └─ Runs: sendAfternoonDocBrief()
   
2. Promise.all() - Execute in parallel:
   ├─ fetchWordData()
   │  └─ [PHASE 1-4 data fetch & aggregate]
   │
   └─ fetchExcelData()
      └─ [Read 5 Excel files from shared drives]

3. Data Combined:
   └─ buildWordDocBuffer(wordData, excelData)
       └─ Generates binary .docx file

4. Write to OneDrive:
   └─ fs.writeFileSync("...\\Daily_Contract_Summary.docx", buffer)
       └─ Teams auto-syncs and displays to users
```

### MORNING REPORT (08:00 Local Time)
*(Excluded from detailed documentation as per user request)*

---

## Web Scraping Details

### Why Web Scraping is Used for Investing.com

Investing.com **does not provide a public economic calendar API**. Instead:

1. **Public Website:** `https://www.investing.com/economic-calendar/`
   - Accessible to human browsers
   - Has internal AJAX endpoint for data loading

2. **Internal Endpoint:** `https://www.investing.com/economic-calendar/Service/getCalendarFilteredData`
   - Used by their website to fetch calendar data
   - Expects browser headers and cookies
   - Returns HTML table rows (not JSON)

3. **Anti-Scraping Measures:**
   - Blocks requests without `User-Agent` (detects bots)
   - Tracks referer to ensure requests appear from their site
   - Implements rate limiting (returns 429 errors)
   - May block IPs that make too many requests

### How the Code Bypasses These Measures

| Protection | Code Mechanism |
|-----------|----------------|
| Bot detection | Sets User-Agent to Chrome browser string |
| Referer check | Sets Referer header to investing.com URL |
| Origin validation | Sets Origin header to investing.com |
| Cookie tracking | Includes timezone cookie |
| Rate limiting | Returns empty array on 429 (graceful degradation) |
| JSON parsing | Uses cheerio HTML parser instead |

### Risks & Limitations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Terms of Service** | Technically violates ToS | Not replicating full site, minimal traffic |
| **IP Blocking** | Could get banned | Currently accepts 429 gracefully |
| **HTML Changes** | Code breaks if structure changes | Selective parsing on class/attribute names |
| **Rate Limits** | Too many requests = 429 error | Only 1 request per day per function |
| **Seasonal Issues** | Timezone changes (EDT vs EST) | Code detects and adjusts automatically |

---

## Configuration & Environment

### Environment Variables (.env file)

```bash
# API Tokens
OHLC_API_TOKEN=your_token_here

# API Base URLs
OHLC_API_BASE=https://qh-api.corp.hertshtengroup.com/api/v2/ohlc/
DAILY_MARKET_API_BASE=https://qh-api.corp.hertshtengroup.com/api/dailymarketdata/
TAS_API_BASE=https://qh-api.corp.hertshtengroup.com/api/v2/tas/
```

### Hardcoded Paths (Windows-specific)

```javascript
// Excel file locations
const BASE = "C:\\Users\\Ajit.yadav\\hertshtengroup.com";

const PATHS = {
    KC: path.join(BASE, "Dinesh Chinnadurai - KC", "coffee_cert_aggregate.xlsx"),
    RC: path.join(BASE, "Dinesh Chinnadurai - RC", "RC Daily and Monthly stocks.xlsx"),
    LCC: path.join(BASE, "Dinesh Chinnadurai - Cocoa", "Stocks", "LDN cocoa", "aggregate_report.xlsx"),
    CC_BAGS: path.join(BASE, "Dinesh Chinnadurai - Cocoa", "Stocks", "US cocoa", "Cocoa_Bags_Aggregate_final.xlsx"),
    CC_CASH: path.join(BASE, "Dinesh Chinnadurai - Cocoa", "Stocks", "US cocoa", "Cocoa Certified stocks - Lots.xlsx")
};

// OneDrive output path
const oneDrivePath = "C:\\Users\\Ajit.yadav\\OneDrive - hertshtengroup.com\\Daily_Contract_Summary.docx";
```

### Dependencies Installation

```bash
npm install axios cheerio docx dotenv node-cron xlsx
```

### Running the System

```bash
# Test afternoon report
npm run test:afternoon

# Test calendar fetch
npm run test:fetch

# Start scheduling service (runs on cron)
npm start:afternoon
npm start:master
```

---

## Summary

This codebase is a sophisticated **multi-source data aggregation system** that:

1. **Scrapes** investing.com for economic calendar events (HTML parsing with browser spoofing)
2. **Fetches** from 3 internal APIs (OHLC, Daily Market, TAS) with intelligent batching and throttling
3. **Reads** local Excel files for inventory/delta tracking
4. **Aggregates** commodity contract data with spreads and volume analytics
5. **Generates** professional Word documents and Teams reports
6. **Handles** rate limiting and errors gracefully

**Key Technologies:** Node.js, axios, cheerio, docx, xlsx

**Key Patterns:** Parallel requests, batching, timezone conversion, graceful error handling, HTML parsing

---

*Documentation Generated: June 2026*
*Codebase: Commodity Market Data Aggregation System*
