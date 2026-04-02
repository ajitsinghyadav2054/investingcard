const axios = require("axios");
require("dotenv").config();

const CONTRACTS = [
  { code: "CL", label: "Crude Oil", decimals: 2 },
  { code: "GC", label: "Gold", decimals: 2 },
  { code: "ES", label: "S&P 500", decimals: 2 },
  { code: "DXY", label: "DXY", decimals: 2 },
  { code: "6B", label: "GBP/USD", decimals: 4 },
  { code: "6L", label: "BRL/USD", decimals: 4 },
];

// Convert a date + hour + minute → unix seconds (always GMT/UTC)
function gmtUnix(date, hour, minute) {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0) / 1000
  );
}

// Auto-detect the API's time unit and convert to seconds
// 13-digit = milliseconds, 19-digit = nanoseconds, 10-digit = already seconds
function toSeconds(t) {
  const s = String(t);
  if (s.length >= 18) return Math.floor(t / 1e9);  // nanoseconds
  if (s.length >= 13) return Math.floor(t / 1000);  // milliseconds
  return Number(t);                                  // seconds
}

async function fetchAndCompute() {
  const now = new Date();

  // Determine the start date (previous trading day)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const eveningDate = new Date(today);

  // If today is Monday (1), go back to Friday (-3 days).
  // If today is Sunday (0), go back to Friday (-2 days).
  const dayOfWeek = today.getUTCDay();
  if (dayOfWeek === 1) {
    eveningDate.setUTCDate(eveningDate.getUTCDate() - 3);
  } else if (dayOfWeek === 0) {
    eveningDate.setUTCDate(eveningDate.getUTCDate() - 2);
  } else {
    eveningDate.setUTCDate(eveningDate.getUTCDate() - 1);
  }

  // Price reference timestamps (GMT)
  const eveningTs = gmtUnix(eveningDate, 19, 0);  // 7:00 PM GMT prev trading day
  const morningTs = gmtUnix(today, 7, 0);  // 7:00 AM GMT (8:00 AM BST) target 1H bar
  const fetchEnd = gmtUnix(today, 8, 0);  // fetch up to 8:00 AM GMT to be safe

  const instruments = CONTRACTS.map(c => c.code).join(",");

  console.log(`Fetching OHLC: ${new Date(eveningTs * 1000).toISOString()} → ${new Date(fetchEnd * 1000).toISOString()}`);

  const response = await axios.get(process.env.OHLC_API_BASE, {
    params: {
      instruments,
      interval: "1H",
      start: eveningTs,
      end: fetchEnd,
    },
    headers: {
      Authorization: process.env.OHLC_API_TOKEN,
      Accept: "application/json",
    },
  });

  const candles = response.data;
  console.log(`Received ${candles.length} candles total`);

  const results = [];

  for (const contract of CONTRACTS) {
    const cc = candles.filter(c => c.product === contract.code);

    // Sort by time ascending just in case
    cc.sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

    // Find evening candle (ideally exactly 19:00, or the latest one available before/at 19:00)
    let eveningCandle = cc.find(c => toSeconds(c.time) === eveningTs);
    if (!eveningCandle) {
      // fallback: latest candle on or before eveningTs
      const validEv = cc.filter(c => toSeconds(c.time) <= eveningTs);
      if (validEv.length > 0) eveningCandle = validEv[validEv.length - 1];
    }

    // Find morning candle (ideally exactly 08:00, or the latest one before/at fetchEnd)
    let morningCandle = cc.find(c => toSeconds(c.time) === morningTs);
    if (!morningCandle) {
      // fallback: latest candle available in the current morning fetch window
      if (cc.length > 0) morningCandle = cc[cc.length - 1];
    }

    if (!eveningCandle || !morningCandle) {
      console.warn(`⚠️  Missing candle for ${contract.code} | evening: ${!!eveningCandle} | morning: ${!!morningCandle}`);
      // Log available timestamps to help debug
      cc.slice(0, 5).forEach(c => console.log(`  ${contract.code} ts=${toSeconds(c.time)} → ${new Date(toSeconds(c.time) * 1000).toISOString()}`));
      results.push({
        code: contract.code, label: contract.label, decimals: contract.decimals,
        last: "N/A", chg: "N/A", chgPct: "N/A", chgNum: 0, sessionH: "N/A", sessionL: "N/A",
      });
      continue;
    }

    const ev = parseFloat(eveningCandle.close);
    const mv = parseFloat(morningCandle.close);

    // Change = morning close − evening close
    const chg = mv - ev;
    const chgPct = (chg / ev) * 100;

    // Session H/L across the full 7 PM → 8 AM window
    const window = cc.filter(c => {
      const t = toSeconds(c.time);
      return t >= eveningTs && t <= morningTs;
    });
    const sessionH = Math.max(...window.map(c => parseFloat(c.high)));
    const sessionL = Math.min(...window.map(c => parseFloat(c.low)));

    results.push({
      code: contract.code,
      label: contract.label,
      decimals: contract.decimals,
      last: mv.toFixed(contract.decimals),
      chg: (chg >= 0 ? "+" : "") + chg.toFixed(contract.decimals),
      chgPct: (chgPct >= 0 ? "+" : "") + chgPct.toFixed(2) + "%",
      chgNum: chg,
      sessionH: sessionH.toFixed(contract.decimals),
      sessionL: sessionL.toFixed(contract.decimals),
    });
  }

  return results;
}

module.exports = { fetchAndCompute };
