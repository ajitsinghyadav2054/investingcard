const XLSX = require("xlsx");
const path = require("path");

const BASE = "C:\\Users\\Ajit.yadav\\hertshtengroup.com";

const PATHS = {
    KC: path.join(BASE, "Dinesh Chinnadurai - KC", "coffee_cert_aggregate.xlsx"),
    RC: path.join(BASE, "Dinesh Chinnadurai - RC", "RC Daily and Monthly stocks.xlsx"),
    LCC: path.join(BASE, "Dinesh Chinnadurai - Cocoa", "Stocks", "LDN cocoa", "aggregate_report.xlsx"),
    CC_BAGS: path.join(BASE, "Dinesh Chinnadurai - Cocoa", "Stocks", "US cocoa", "Cocoa_Bags_Aggregate_final.xlsx"),
    CC_CASH: path.join(BASE, "Dinesh Chinnadurai - Cocoa", "Stocks", "US cocoa", "Cocoa Certified stocks - Lots.xlsx"),
};

function getLastRow(data) {
    let last = data.length - 1;
    while (last > 0 && (!data[last] || data[last].every(c => c === null || c === "" || c === undefined))) last--;
    return data[last];
}

function excelDateToStr(serial) {
    if (!serial || typeof serial !== "number") return String(serial);
    // Excel serial date to JS date
    const utcDays = Math.floor(serial - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().split("T")[0];
}

function fmt(val) {
    if (val === null || val === undefined || val === "") return "—";
    return Number(val).toLocaleString("en-US");
}

async function fetchExcelData() {
    const result = {};

    // KC: "Daily_Changes" sheet → last row → column "Total"
    try {
        const wb = XLSX.readFile(PATHS.KC, { cellDates: false });
        const ws = wb.Sheets["Daily_Changes"];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const headers = data[0];
        const totalIdx = headers.indexOf("Total");
        const dateIdx = headers.indexOf("Date");
        const lastRow = getLastRow(data);
        result.kc = {
            date: lastRow ? excelDateToStr(lastRow[dateIdx]) : null,
            total: lastRow ? lastRow[totalIdx] : null,
        };
    } catch (e) {
        console.error("KC Excel read failed:", e.message);
        result.kc = { date: null, total: null };
    }

    // RC: "ICE EU Robusta stocks Daily" sheet
    // Complex layout: the most recent row (row 12 Excel) has date via formula
    // that xlsx cannot evaluate. We detect it as the first undated data row,
    // then infer its date = next valid dated row serial + 1.
    try {
        const wb = XLSX.readFile(PATHS.RC, { cellDates: false });
        const ws = wb.Sheets["ICE EU Robusta stocks Daily"];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        let headerRowIdx = 10;
        for (let i = 0; i < 20; i++) {
            if (data[i] && data[i].some(c => c === "Timestamp")) { headerRowIdx = i; break; }
        }

        // Find RC-TOT column: position of last non-null numeric >1000 in first data row
        let rcTotCol = -1;
        const firstDataRow = data[headerRowIdx + 1] || [];
        for (let j = firstDataRow.length - 1; j >= 0; j--) {
            if (firstDataRow[j] !== null && typeof firstDataRow[j] === "number" && firstDataRow[j] > 1000) {
                rcTotCol = j; break;
            }
        }

        // Find first row with a valid date serial (>43831) after header
        let firstDatedIdx = -1;
        let firstDatedSerial = null;
        for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 10, data.length); i++) {
            const row = data[i];
            if (!row) continue;
            for (let j = 0; j < row.length; j++) {
                if (typeof row[j] === "number" && row[j] > 43831 && row[j] < 50000) {
                    firstDatedIdx = i;
                    firstDatedSerial = row[j];
                    break;
                }
            }
            if (firstDatedIdx >= 0) break;
        }

        let bestSerial = null;
        let bestTotal = null;

        // Check if there's an undated row BEFORE the first dated row
        const undatedRowIdx = headerRowIdx + 1;
        if (firstDatedIdx > undatedRowIdx && rcTotCol >= 0) {
            // The undated row is row immediately after header - most recent
            bestTotal = firstDataRow[rcTotCol];
            bestSerial = firstDatedSerial ? firstDatedSerial + 1 : null; // one day newer
        } else if (firstDatedIdx >= 0 && rcTotCol >= 0) {
            bestTotal = data[firstDatedIdx][rcTotCol];
            bestSerial = firstDatedSerial;
        }

        result.rc = {
            date: bestSerial ? excelDateToStr(bestSerial) : null,
            total: bestTotal,
        };
    } catch (e) {
        console.error("RC Excel read failed:", e.message);
        result.rc = { date: null, total: null };
    }

    // ─────────────────────────────────────────────
    // LCC: "Data" sheet → last row → "daily_total_delta" column
    // ─────────────────────────────────────────────
    try {
        const wb = XLSX.readFile(PATHS.LCC, { cellDates: false });
        const ws = wb.Sheets["Data"];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const headers = data[0];
        const dateIdx = headers.indexOf("Date");
        // Find the column - can be "daily_total_delta" or "daily_total_del" (truncated)
        let colIdx = -1;
        for (let j = 0; j < headers.length; j++) {
            if (headers[j] && String(headers[j]).startsWith("daily_total")) { colIdx = j; break; }
        }
        const lastRow = getLastRow(data);
        result.lcc = {
            date: lastRow ? excelDateToStr(lastRow[dateIdx]) : null,
            daily_total_delta: lastRow && colIdx >= 0 ? lastRow[colIdx] : null,
        };
    } catch (e) {
        console.error("LCC Excel read failed:", e.message);
        result.lcc = { date: null, daily_total_delta: null };
    }

    // ─────────────────────────────────────────────
    // CC BAGS: "Daily_Changes" sheet → last row → "Total Bags" (last col)
    // ─────────────────────────────────────────────
    try {
        const wb = XLSX.readFile(PATHS.CC_BAGS, { cellDates: false });
        const ws = wb.Sheets["Daily_Changes"];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const headers = data[0];
        const dateIdx = headers.indexOf("Date");
        // "Total Bags" - find it
        let totalBagsIdx = -1;
        for (let j = 0; j < headers.length; j++) {
            if (headers[j] && String(headers[j]).toLowerCase().includes("total bags")) { totalBagsIdx = j; break; }
        }
        // If not found, use last non-null header
        if (totalBagsIdx < 0) {
            for (let j = headers.length - 1; j >= 0; j--) {
                if (headers[j]) { totalBagsIdx = j; break; }
            }
        }
        const lastRow = getLastRow(data);
        result.ccBags = {
            date: lastRow ? excelDateToStr(lastRow[dateIdx]) : null,
            totalBags: lastRow && totalBagsIdx >= 0 ? lastRow[totalBagsIdx] : null,
        };
    } catch (e) {
        console.error("CC_BAGS Excel read failed:", e.message);
        result.ccBags = { date: null, totalBags: null };
    }

    // ─────────────────────────────────────────────
    // CC CASH PRICES: "Cash Prices" sheet → first data row (row index 6 = newest date)
    // Cols: D=Timestamp(3), E=IvoryCoast(4), F=Ghana(5), G=Nigeria(6), H=Ecuador(7),
    //       I=IC_Diff(8), J=Ghana_Diff(9), K=Nigeria_Diff(10), L=Ecuador_Diff(11)
    // ─────────────────────────────────────────────
    try {
        const wb = XLSX.readFile(PATHS.CC_CASH, { cellDates: false });
        const ws = wb.Sheets["Cash Prices"];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Row 7 (index 6) is the header-labels row with "IC Differential" etc
        // Row 7 (index 6) is actually data based on inspection: [RIC, ..., Timestamp, ...]
        // Data rows start at index 6 (row 7). Find the first one with a valid timestamp.
        let firstDataIdx = -1;
        for (let i = 5; i < 15; i++) {
            if (data[i] && typeof data[i][3] === "number" && data[i][3] > 40000) {
                firstDataIdx = i;
                break;
            }
        }

        const row = firstDataIdx >= 0 ? data[firstDataIdx] : null;
        result.ccCash = {
            date: row ? excelDateToStr(row[3]) : null,
            icDifferential: row ? row[8] : null,
            ghanaDifferential: row ? row[9] : null,
            nigeriaDifferential: row ? row[10] : null,
            ecuadorDifferential: row ? row[11] : null,
        };
    } catch (e) {
        console.error("CC_CASH Excel read failed:", e.message);
        result.ccCash = { date: null, icDifferential: null, ghanaDifferential: null, nigeriaDifferential: null, ecuadorDifferential: null };
    }

    return result;
}

module.exports = { fetchExcelData };
