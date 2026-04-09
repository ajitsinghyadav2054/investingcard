/**
 * Builds a single giant Adaptive Card combining Macro closing, Daily Levels, and the US Calendar.
 */
function buildCombinedCard(macroData, levelsData, eventsData) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

    // ── 1. MACRO CLOSING GAPS SECTION ────────────────────────────────────────────────────────
    const macroColWidths = ["2", "1", "1", "1", "1", "1"];
    const createMacroRow = (cells, isHeader = false) => ({
        type: "ColumnSet", spacing: "Small",
        columns: cells.map((c, i) => ({
            type: "Column", width: macroColWidths[i],
            items: [{
                type: "TextBlock", text: isHeader ? c : String(c.text),
                weight: isHeader ? "Bolder" : (c.weight || "Default"),
                color: isHeader ? "Default" : (c.color || "Default"),
                size: "Small",
                wrap: true, // Prevents truncation
                horizontalAlignment: i === 0 ? "Left" : "Right"
            }]
        }))
    });

    const macroHeader = createMacroRow(["Contract", "Last", "Chg", "Chg %", "Session H", "Session L"], true);
    macroHeader.separator = true;
    const macroRows = macroData.map((item, i) => {
        const color = item.chgNum >= 0 ? "Good" : "Attention";
        const row = createMacroRow([
            { text: item.label, weight: "Bolder" }, { text: item.last }, { text: item.chg, color: color },
            { text: item.chgPct, color: color, weight: "Bolder" }, { text: item.sessionH }, { text: item.sessionL }
        ], false);
        if (i === 0) row.separator = true;
        return row;
    });

    // ── 2. DAILY LEVELS SECTION ───────────────────────────────────────────────────────────────
    const levelsColWidths = ["2", "1", "1", "1", "1"];
    const createLevelsRow = (cells, isHeader = false) => ({
        type: "ColumnSet", spacing: "Small",
        columns: cells.map((c, i) => ({
            type: "Column", width: levelsColWidths[i],
            items: [{
                type: "TextBlock", text: isHeader ? c : String(c.text),
                weight: isHeader ? "Bolder" : (c.weight || "Default"),
                color: isHeader ? "Default" : (c.color || "Default"),
                size: "Small",
                wrap: true, // Prevents truncation
                horizontalAlignment: i === 0 ? "Left" : "Right"
            }]
        }))
    });

    const levelsHeader = createLevelsRow(["Contract", "Close", "Settlement", "High", "Low"], true);
    levelsHeader.separator = true;
    const levelsRows = levelsData.map((item, i) => {
        const row = createLevelsRow([
            { text: item.label, weight: "Bolder" }, { text: item.close }, { text: item.settlement }, { text: item.high }, { text: item.low }
        ], false);
        if (i === 0) row.separator = true;
        return row;
    });

    // ── 3. ECONOMIC CALENDAR SECTION ──────────────────────────────────────────────────────────
    // Optimized: Removed redundant 'Cur' and 'Impact' columns to stay under Teams' 28KB size limit
    const calColWidths = ["12", "25", "8", "8", "8"];
    const createCalRow = (cells, isHeader = false) => ({
        type: "ColumnSet",
        columns: cells.map((c, i) => ({
            type: "Column", width: calColWidths[i],
            items: [{
                type: "TextBlock", text: isHeader ? c : String(c.text),
                weight: (isHeader || c.weight) ? "Bolder" : undefined,
                color: c.color,
                size: "Small", wrap: true,
                horizontalAlignment: (i === 1 || i === 0) ? "Left" : "Center"
            }]
        }))
    });

    const calHeader = createCalRow(["Time(UTC)", "US Event (High Impact)", "Actual", "Forecast", "Prev"], true);
    calHeader.separator = true;
    let calRows = [];

    if (eventsData.length === 0) {
        calRows = [{ type: "TextBlock", text: "✅ No high-impact US events scheduled for today.", isSubtle: true, spacing: "Small", separator: true }];
    } else {
        // Cap at 10 events to ensure we never hit the hard size limit
        const list = eventsData.slice(0, 10);
        calRows = list.map((ev, i) => {
            let actualColor = "Default";
            const aNum = parseFloat(String(ev.actual).replace(/[^0-9.-]/g, ""));
            const fNum = parseFloat(String(ev.forecast).replace(/[^0-9.-]/g, ""));
            if (!isNaN(aNum) && !isNaN(fNum) && ev.actual !== "") {
                actualColor = aNum >= fNum ? "Good" : "Attention";
            }
            const row = createCalRow([
                { text: ev.datetimeUtc },
                { text: ev.eventName, weight: "Bolder" },
                { text: ev.actual, color: actualColor },
                { text: ev.forecast },
                { text: ev.previous }
            ], false);
            if (i === 0) row.separator = true;
            return row;
        });
    }

    // ── FINAL COMBINED MASTER CARD ─────────────────────────────────────────────────────────
    return {
        type: "AdaptiveCard",
        version: "1.2",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",

        // 🔥 Critical Fix: This property forces Teams to stop squeezing the Chat Window horizontally!
        msteams: { width: "Full" },

        body: [
            {
                type: "ColumnSet",
                columns: [
                    { type: "Column", width: "stretch", items: [{ type: "TextBlock", text: "📈 Consolidated Macro Brief", size: "Large", weight: "Bolder" }] },
                    { type: "Column", width: "auto", items: [{ type: "TextBlock", text: `${dateStr}  |  08:00 BST`, size: "Small", isSubtle: true, horizontalAlignment: "Right" }] }
                ]
            },

            // SECTION 1
            { type: "TextBlock", text: "MACRO OVERVIEW — AGRI CLOSE → 07:00 GMT", size: "Medium", isSubtle: true, weight: "Bolder", spacing: "Medium", separator: true, color: "Accent" },
            macroHeader, ...macroRows,

            // SECTION 2
            { type: "TextBlock", text: "PREVIOUS DAY KEY LEVELS", size: "Medium", isSubtle: true, weight: "Bolder", spacing: "Medium", separator: true, color: "Accent" },
            levelsHeader, ...levelsRows,

            // SECTION 3
            { type: "TextBlock", text: "TODAY'S ECONOMIC CALENDAR — US ★★★", size: "Medium", isSubtle: true, weight: "Bolder", spacing: "Large", separator: true, color: "Accent" },
            calHeader, ...calRows,

            // FOOTER
            { type: "TextBlock", text: "Sources: Hertshten OHLC, Daily Market, Investing.com", size: "Small", isSubtle: true, spacing: "Medium", separator: true }
        ]
    };
}

module.exports = { buildCombinedCard };
