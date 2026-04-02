const axios = require("axios");

const PRODUCT_GROUPS = [
    { title: "C (London Cocoa)", contracts: ["LCCK26", "LCCN26", "LCCU26", "LCCZ26", "LCCH27", "LCCK27", "LCCN27", "LCCU27", "LCCZ27"].map(c => ({ label: c, code: c })) },
    { title: "CC (NY Cocoa)", contracts: ["CCK26", "CCN26", "CCU26", "CCZ26", "CCH27", "CCK27", "CCN27", "CCU27", "CCZ27"].map(c => ({ label: c, code: c })) },
    { title: "KC (KC Arabica)", contracts: ["KCK26", "KCN26", "KCU26", "KCZ26", "KCH27", "KCK27", "KCN27", "KCU27", "KCZ27", "KCH28"].map(c => ({ label: c, code: c })) },
    { title: "RC (Robusta)", contracts: ["LKCK26", "LKCN26", "LKCU26", "LKCX26", "LKCF27", "LKCH27", "LKCK27", "LKCN27", "LKCU27"].map(c => ({ label: c, code: c })) },
    { title: "CT (Cotton)", contracts: ["CTK26", "CTN26", "CTV26", "CTZ26", "CTH27", "CTK27", "CTN27", "CTZ27"].map(c => ({ label: c, code: c })) },
    { title: "SB (Raw Sugar)", contracts: ["SGK26", "SGN26", "SGV26", "SGH27", "SGK27", "SGN27", "SGV27", "SGH28", "SGK28", "SGN28", "SGV28"].map(c => ({ label: c, code: c })) },
    { title: "W (White Sugar)", contracts: ["LSGK26", "LSGQ26", "LSGV26", "LSGZ26", "LSGH27", "LSGK27", "LSGQ27", "LSGV27", "LSGZ27", "LSGH28", "LSGK28", "LSGQ28", "LSGV28"].map(c => ({ label: c, code: c })) }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWordData() {
    console.log("📥 [Word Generator] Fetching Market Data for Outrights & Spreads...");
    const token = process.env.OHLC_API_TOKEN;
    const baseUrl = "https://qh-api.corp.hertshtengroup.com/api/dailymarketdata/";
    const ohlcUrl = "https://qh-api.corp.hertshtengroup.com/api/v2/ohlc/";
    const tasUrl = "https://qh-api.corp.hertshtengroup.com/api/v2/tas/";

    const groupsData = JSON.parse(JSON.stringify(PRODUCT_GROUPS));
    let globalPrimaryDateStr = null;
    const tasBatchProducts = [];

    // ─────────────────────────────────────────────────────────────────
    // PHASE 1: Sequentially GET Outrights (dailymarketdata)
    // ─────────────────────────────────────────────────────────────────
    for (const group of groupsData) {
        for (const contract of group.contracts) {
            let targetDateStr = null;
            try {
                const res = await axios.get(baseUrl, {
                    params: { qhcode: contract.code, limit: 2 },
                    headers: { Authorization: token, Accept: "application/json" }
                });

                const data = res.data?.results || [];

                if (data.length >= 2) {
                    contract.settle = data[0].close;
                    contract.chg = data[0].close !== null && data[1].close !== null ? (data[0].close - data[1].close) : null;
                    contract.volume = data[0].volume;
                    contract.oi = data[0].oi;
                    contract.delOi = data[0].oi !== null && data[1].oi !== null ? (data[0].oi - data[1].oi) : null;
                    targetDateStr = data[0].datetime ? data[0].datetime.split("T")[0] : null;
                } else if (data.length === 1) {
                    contract.settle = data[0].close; contract.chg = null; contract.volume = data[0].volume; contract.oi = data[0].oi; contract.delOi = null;
                    targetDateStr = data[0].datetime ? data[0].datetime.split("T")[0] : null;
                } else {
                    contract.settle = null; contract.chg = null; contract.volume = null; contract.oi = null; contract.delOi = null;
                }
            } catch (err) {
                contract.settle = null; contract.chg = null; contract.volume = null; contract.oi = null; contract.delOi = null;
            }

            contract.delVolume = null;

            if (targetDateStr) {
                globalPrimaryDateStr = globalPrimaryDateStr || targetDateStr;
                tasBatchProducts.push({
                    id: contract.code,
                    dates: [targetDateStr],
                    start: "00:00:00",
                    end: "23:59:59"
                });
            }
            await sleep(150);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // PHASE 2: Build Spread Pairs Offline & Map Spread Variables
    // ─────────────────────────────────────────────────────────────────
    const allSpreadCodes = [];

    for (const group of groupsData) {
        group.spreads = [];
        for (let i = 0; i < group.contracts.length - 1; i++) {
            const leg1 = group.contracts[i];
            const leg2 = group.contracts[i + 1];

            const spreadLabel = `${leg1.label}-${leg2.label.slice(-3)}`;
            const spreadCode = `${leg1.code}-${leg2.code.slice(-3)}`;
            allSpreadCodes.push(spreadCode);

            let settle = null;
            if (leg1.settle !== null && leg2.settle !== null) settle = leg1.settle - leg2.settle;

            let chg = null;
            if (leg1.chg !== null && leg2.chg !== null) chg = leg1.chg - leg2.chg;

            group.spreads.push({
                label: spreadLabel,
                code: spreadCode,
                settle: settle,
                chg: chg,
                volume: null,
                delVolume: null
            });

            // Inject into mass TAS bucket automatically for Delta computation
            if (globalPrimaryDateStr) {
                tasBatchProducts.push({
                    id: spreadCode,
                    dates: [globalPrimaryDateStr],
                    start: "00:00:00",
                    end: "23:59:59"
                });
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // PHASE 3: Fetch OHLC strictly for SPREAD VOLUMES (Chunks of 45)
    // ─────────────────────────────────────────────────────────────────
    console.log(`📦 Fetching explicit Spread Volume clusters via OHLC API...`);
    for (let i = 0; i < allSpreadCodes.length; i += 45) {
        const chunk = allSpreadCodes.slice(i, i + 45).join(",");
        try {
            const ohlcRes = await axios.get(ohlcUrl, {
                params: { instruments: chunk, interval: "1D", count: 1 },
                headers: { Authorization: token, Accept: "application/json" }
            });
            const ohlcData = ohlcRes.data || [];

            for (const group of groupsData) {
                for (const spread of group.spreads) {
                    const match = ohlcData.filter(d => d.product === spread.code);
                    if (match.length > 0) {
                        // Sum volumes implicitly or just take the latest 1D slice (match[0].volume)
                        let vSum = 0;
                        match.forEach(m => { vSum += m.volume || 0; });
                        spread.volume = vSum;
                    }
                }
            }
        } catch (err) {
            console.error("❌ Spread Volume OHLC fetch failed.", err.message);
        }
        await sleep(500);
    }

    // ─────────────────────────────────────────────────────────────────
    // PHASE 4: Mass Fetch TAS (Outrights + Spreads unified) chunks of 50
    // ─────────────────────────────────────────────────────────────────
    console.log(`📦 Fetching ${tasBatchProducts.length} TAS instruments (Outrights + Spreads) for Volume Deltas...`);
    let allTasRecords = [];

    for (let i = 0; i < tasBatchProducts.length; i += 50) {
        const chunk = tasBatchProducts.slice(i, i + 50);

        let currentPage = 1;
        let totalPages = 1;

        do {
            try {
                const fetchUrl = currentPage === 1 ? tasUrl : `${tasUrl}?page=${currentPage}`;
                const tasRes = await axios.post(fetchUrl, { products: chunk }, {
                    headers: { Authorization: token, Accept: "application/json", "Content-Type": "application/json" }
                });

                if (tasRes.data?.data) {
                    allTasRecords = allTasRecords.concat(tasRes.data.data);
                    totalPages = tasRes.data.total_pages || 1;
                } else {
                    break;
                }
            } catch (err) {
                console.error(`❌ TAS Chunk Fetch Failed on page ${currentPage}.`, err.message);
                break;
            }
            currentPage++;
            await sleep(2500); // Respect generic 429 limits between POSTs
        } while (currentPage <= totalPages);
    }

    console.log(`✅ Server responded with ${allTasRecords.length} total TAS trace rows today.`);

    // Map TAS explicitly back to Outrights AND Spreads universally
    for (const group of groupsData) {
        // Outrights
        for (const contract of group.contracts) {
            const matchedTrades = allTasRecords.filter(t => t.instrument === contract.code);
            if (matchedTrades.length > 0) {
                let b = 0; let s = 0;
                matchedTrades.forEach(t => { if (t.side === 1) b += (t.qty || 0); else if (t.side === -1) s += (t.qty || 0); });
                contract.delVolume = b - s;
            }
        }
        // Spreads
        for (const spread of group.spreads) {
            const matchedTrades = allTasRecords.filter(t => t.instrument === spread.code);
            if (matchedTrades.length > 0) {
                let b = 0; let s = 0;
                matchedTrades.forEach(t => { if (t.side === 1) b += (t.qty || 0); else if (t.side === -1) s += (t.qty || 0); });
                spread.delVolume = b - s;
            }
        }
    }

    console.log("✅ Final Spreads & Outrights Assembly constructed.");

    if (globalPrimaryDateStr) {
        groupsData[0].reportDateStr = globalPrimaryDateStr;
    }
    return groupsData;
}

module.exports = { fetchWordData };
