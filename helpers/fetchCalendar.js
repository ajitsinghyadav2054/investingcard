const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Fetches today's 3-star (High Impact) US economic calendar events
 * from Investing.com's internal API and parses the HTML response.
 */
async function fetchCalendarEvents() {
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    console.log(`📅 Fetching US 3-star economic events for ${dateStr}...`);

    const body = new URLSearchParams();
    body.append("country[]", "5");    // 5 = United States
    body.append("importance[]", "3");    // 3 = High Impact (3 stars)
    body.append("dateFrom", dateStr);
    body.append("dateTo", dateStr);
    body.append("timeZone", "8");    // 8 = London/GMT
    body.append("timeFilter", "timeRemain");
    body.append("currentTab", "today");
    body.append("submitFilters", "1");
    body.append("limit_from", "0");

    let res;
    let html = "";

    try {
        res = await axios.post(
            "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData",
            body.toString(),
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "X-Requested-With": "XMLHttpRequest",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://www.investing.com/economic-calendar/",
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Origin": "https://www.investing.com",
                    "Cookie": "timezone_id=8;"
                }
            }
        );
        html = res.data.data || "";
    } catch (err) {
        console.log("⚠️  Investing.com rate limit enforced (429). Skipping calendar block for today.");
        return [];
    }

    if (!html || (res && res.data.rows_num === 0)) {
        console.log("ℹ️  No 3-star US events found for today.");
        return [];
    }

    const $ = cheerio.load(`<table>${html}</table>`);
    const events = [];

    $("tr.js-event-item").each((_, row) => {
        const $row = $(row);
        const tds = $row.find("td");

        // Full datetime from the row attribute e.g. "2026/03/23 09:30:00" in US Eastern Time
        const rawDatetime = $row.attr("data-event-datetime") || "";
        let datetimeUtc = "";

        if (rawDatetime) {
            try {
                const nyDateString = rawDatetime.replace(/\//g, "-").replace(" ", "T");
                const tempDate = new Date(nyDateString + "Z");

                const formatterNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
                const isEDT = formatterNY.format(tempDate).includes('EDT');
                const nyOffset = isEDT ? "-04:00" : "-05:00";

                const realDate = new Date(nyDateString + nyOffset);

                const formatterLondon = new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Europe/London',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });

                const parts = formatterLondon.formatToParts(realDate);
                const p = {};
                parts.forEach(part => { p[part.type] = part.value; });
                datetimeUtc = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
            } catch (e) {
                datetimeUtc = rawDatetime.replace(/\//g, "-").slice(0, 16);
            }
        }

        // Currency code (e.g. "USD") — td[1] text
        const currency = $(tds[1]).text().replace(/\s+/g, " ").trim();

        // Stars count
        const stars = $(tds[2]).find("i.grayFullBullishIcon").length;

        // Impact label — td[2] title = "High Volatility Expected"
        const impactTitle = $(tds[2]).attr("title") || "";
        const impact = impactTitle.toLowerCase().includes("high") ? "High" :
            impactTitle.toLowerCase().includes("mod") ? "Med" : "Low";

        // Event name
        const eventName = $(tds[3]).text().trim().replace(/\s+/g, " ");

        // Actual / Forecast / Previous — return empty when no data (matches reference design)
        const clean = (td) => {
            const txt = $(td).text().trim();
            return (txt && txt !== "\u00a0") ? txt : "";
        };
        const actual = clean(tds[4]);
        const forecast = clean(tds[5]);
        const previous = clean(tds[6]);

        if (stars === 3 && eventName) {
            events.push({ datetimeUtc, currency, impact, eventName, actual, forecast, previous });
        }
    });

    console.log(`✅ Found ${events.length} high-impact US event(s).`);
    return events;
}

module.exports = { fetchCalendarEvents };
