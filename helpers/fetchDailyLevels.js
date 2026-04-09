const axios = require("axios");
require("dotenv").config();

// We are mapping the 7 products to their front-month contract codes
// based on the dashboard screenshot.
const CONTRACTS = [
    { label: "C (London Cocoa)", code: "LCCK26" },
    { label: "CC (NY Cocoa)", code: "CCK26" },
    { label: "KC (Arabica)", code: "KCK26" },
    { label: "RC (Robusta)", code: "LKCK26" },
    { label: "CT (Cotton)", code: "CTK26" },
    { label: "SB (Raw Sugar)", code: "SGK26" },
    { label: "W (White Sugar)", code: "LSGK26" }
];

function gmtUnix(date, hour, minute) {
    const d = new Date(date);
    d.setUTCHours(hour, minute, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

function toSeconds(ts) {
    if (ts > 1e12) return Math.floor(ts / 1000); // ms to sec
    if (ts > 1e10) return Math.floor(ts / 1000) / 1000; // ns theoretically?
    return ts;
}

/**
 * Fetches Prev Close, High, Low from OHLC, and Settlement from Daily Market API
 */
async function fetchDailyLevels() {
    const results = [];
    const token = process.env.OHLC_API_TOKEN; // Reusing the same master API token
    const dailyApiBase = process.env.DAILY_MARKET_API_BASE || "https://qh-api.corp.hertshtengroup.com/api/dailymarketdata/";

    // We fetch OHLC over the last 7 days to ensure we definitely get the previous trading day
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startTs = gmtUnix(today, 0, 0) - (7 * 86400); // Expanded to 7 days
    const endTs = gmtUnix(today, 23, 59);

    const instrumentsStr = CONTRACTS.map(c => c.code).join(",");

    console.log(`📥 Fetching OHLC for High/Low/Close...`);
    const ohlcRes = await axios.get(process.env.OHLC_API_BASE, {
        params: {
            instruments: instrumentsStr,
            interval: "1D",
            start: startTs,
            end: endTs
        },
        headers: { Authorization: token, Accept: "application/json" }
    });

    const allCandles = ohlcRes.data;

    for (const contract of CONTRACTS) {
        // ── 1. Parse OHLC Data (Close, High, Low) ──
        const cc = allCandles.filter(c => c.product === contract.code);
        cc.sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

        // Grab the latest candle that strictly precedes today (i.e., previous trading day)
        const todayMidnight = gmtUnix(today, 0, 0);
        const pastCandles = cc.filter(c => toSeconds(c.time) < todayMidnight);

        let prevHigh = "N/A", prevLow = "N/A", prevClose = "N/A";
        if (pastCandles.length > 0) {
            const lastCandle = pastCandles[pastCandles.length - 1];
            prevHigh = lastCandle.high;
            prevLow = lastCandle.low;
            prevClose = lastCandle.close;
        }

        // ── 2. Parse Daily Market Data (Settlement) ──
        let settlement = "N/A";
        // Add a 1000ms delay to avoid hitting the API rate limit easily
        await new Promise(r => setTimeout(r, 1000));
        try {
            const dailyRes = await axios.get(dailyApiBase, {
                params: { qhcode: contract.code, limit: 1 },
                headers: { Authorization: token, Accept: "application/json" }
            });

            if (dailyRes.data && dailyRes.data.results && dailyRes.data.results.length > 0) {
                // 'close' mapping inside dailymarketdata holds the settlement price
                settlement = dailyRes.data.results[0].close;
            }
        } catch (e) {
            console.error(`⚠️ Failed to fetch settlement for ${contract.code}:`, e.message);
        }

        results.push({
            label: contract.label,
            close: prevClose,
            settlement: settlement,
            high: prevHigh,
            low: prevLow
        });
    }

    return results;
}

module.exports = { fetchDailyLevels };
