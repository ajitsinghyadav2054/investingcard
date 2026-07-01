const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Fetches today's 3-star (High Impact) US economic calendar events
 * from Investing.com's internal API.
 * Retries up to 3 times with a 5-second delay on 429 rate-limit errors.
 */
async function fetchCalendarEvents() {
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    console.log(`📅 Fetching US 3-star economic events for ${dateStr}...`);

    const body = new URLSearchParams();
    body.append("country[]", "5");       // 5 = United States
    body.append("importance[]", "3");    // 3 = High Impact (3 stars)
    body.append("dateFrom", dateStr);
    body.append("dateTo", dateStr);
    body.append("timeZone", "8");        // 8 = London/GMT
    body.append("timeFilter", "timeRemain");
    body.append("currentTab", "today");
    body.append("submitFilters", "1");
    body.append("limit_from", "0");

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000;

    let res;
    let html = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            res = await axios.post(
                "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData",
                body.toString(),
                {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": "https://www.investing.com/economic-calendar/",
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Origin": "https://www.investing.com",
                        "Cookie": "timezone_id=8;"
                    },
                    timeout: 10000
                }
            );
            html = res.data.data || "";
            break; // success — exit retry loop

        } catch (err) {
            const status = err.response?.status;
            if (status === 429 && attempt < MAX_RETRIES) {
                console.log(`⚠️  Investing.com 429 on attempt ${attempt}/${MAX_RETRIES}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            } else {
                console.log(`⚠️  Investing.com calendar unavailable (attempt ${attempt}): ${err.message}. Skipping calendar.`);
                return [];
            }
        }
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

        const rawDatetime = $row.attr("data-event-datetime") || "";
        let datetimeUtc = "";

        if (rawDatetime) {
            try {
                const nyDateString = rawDatetime.replace(/\//g, "-").replace(" ", "T");
                const tempDate = new Date(nyDateString + "Z");

                const formatterNY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
                const isEDT = formatterNY.format(tempDate).includes("EDT");
                const nyOffset = isEDT ? "-04:00" : "-05:00";
                const realDate = new Date(nyDateString + nyOffset);

                const parts = {};
                new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Europe/London",
                    year: "numeric", month: "2-digit", day: "2-digit",
                    hour: "2-digit", minute: "2-digit", hour12: false
                }).formatToParts(realDate).forEach(p => { parts[p.type] = p.value; });

                datetimeUtc = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
            } catch (e) {
                datetimeUtc = rawDatetime.replace(/\//g, "-").slice(0, 16);
            }
        }

        const currency = $(tds[1]).text().replace(/\s+/g, " ").trim();
        const stars = $(tds[2]).find("i.grayFullBullishIcon").length;
        const impactTitle = $(tds[2]).attr("title") || "";
        const impact = impactTitle.toLowerCase().includes("high") ? "High" :
            impactTitle.toLowerCase().includes("mod") ? "Med" : "Low";
        const eventName = $(tds[3]).text().trim().replace(/\s+/g, " ");

        const clean = (td) => {
            const txt = $(td).text().trim();
            return (txt && txt !== "\u00a0") ? txt : "";
        };
        const actual   = clean(tds[4]);
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
