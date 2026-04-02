const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle, HeadingLevel } = require("docx");

function formatNum(val) {
    if (val === null || val === undefined || isNaN(val)) return "—";
    return Number(val).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function getColorCode(val) {
    if (val === null || isNaN(val)) return "FFFFFF";
    if (val > 0) return "00B050";
    if (val < 0) return "FF0000";
    return "FFFFFF";
}

function assembleDocument(groupsData, excelData = {}) {
    const cleanBorders = {
        top: { style: BorderStyle.NIL, size: 0 },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "333333" },
        left: { style: BorderStyle.NIL, size: 0 },
        right: { style: BorderStyle.NIL, size: 0 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "3B3B3B" },
        insideVertical: { style: BorderStyle.NIL, size: 0 }
    };

    const outrightHeaders = ["Contract", "Settle", "Chg", "Volume", "OI", "ΔOI", "ΔVolume"];
    const spreadHeaders = ["Contract", "Settle", "Chg", "Volume", "ΔVolume"];

    const childrenStructure = [];

    const marketDateStr = groupsData[0]?.reportDateStr; // e.g. "2026-03-24"
    const now = marketDateStr ? new Date(marketDateStr) : new Date();
    const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

    childrenStructure.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
                new TextRun({ text: "Daily Contract Settlement Summary", bold: true, size: 36, color: "202020" })
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
                new TextRun({ text: `${dateStr}  |  15:00 GMT`, size: 24, color: "606060" })
            ]
        })
    );

    for (const group of groupsData) {
        // ─────────────────────────────────────────────────────────
        // 1. OUTRIGHTS BLOCK
        // ─────────────────────────────────────────────────────────
        childrenStructure.push(
            new Paragraph({
                spacing: { before: 400, after: 150 },
                children: [
                    new TextRun({ text: group.title.toUpperCase(), bold: true, size: 22, color: "5A5A5A" })
                ]
            })
        );

        const buildHeaderRow = (headers) => new TableRow({
            tableHeader: true,
            children: headers.map(text =>
                new TableCell({
                    shading: { fill: "1E1E1E" },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    children: [
                        new Paragraph({
                            alignment: text === "Contract" ? AlignmentType.LEFT : AlignmentType.RIGHT,
                            children: [new TextRun({ text: text, color: "A0A0A0", bold: true, size: 20 })]
                        })
                    ]
                })
            )
        });

        const outrightRows = group.contracts.map(contract => {
            const chgColor = getColorCode(contract.chg);
            const delOiColor = getColorCode(contract.delOi);
            const delVolColor = getColorCode(contract.delVolume);
            const formatChg = (val) => val > 0 ? `+${formatNum(val)}` : formatNum(val);

            return new TableRow({
                children: [
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: contract.label, bold: true, color: "E0E0E0", size: 20 })] })] }),
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNum(contract.settle), color: "E0E0E0", bold: true, size: 20 })] })] }),
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatChg(contract.chg), color: chgColor, size: 20 })] })] }),
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNum(contract.volume), color: "E0E0E0", bold: true, size: 20 })] })] }),
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNum(contract.oi), color: "E0E0E0", bold: true, size: 20 })] })] }),
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatChg(contract.delOi), color: delOiColor, size: 20 })] })] }),
                    new TableCell({ shading: { fill: "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatChg(contract.delVolume), color: delVolColor, size: 20 })] })] })
                ]
            });
        });

        childrenStructure.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: cleanBorders, rows: [buildHeaderRow(outrightHeaders), ...outrightRows] }));

        // ─────────────────────────────────────────────────────────
        // 2. SPREADS BLOCK
        // ─────────────────────────────────────────────────────────
        if (group.spreads && group.spreads.length > 0) {
            childrenStructure.push(
                new Paragraph({
                    spacing: { before: 250, after: 150 },
                    children: [
                        new TextRun({ text: `${group.title.toUpperCase()} SPREADS`, bold: true, size: 20, color: "7A7A7A" })
                    ]
                })
            );

            const spreadRows = group.spreads.map(spread => {
                const chgColor = getColorCode(spread.chg);
                const delVolColor = getColorCode(spread.delVolume);
                const formatChg = (val) => val > 0 ? `+${formatNum(val)}` : formatNum(val);

                return new TableRow({
                    children: [
                        new TableCell({ shading: { fill: "222222" }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: spread.label, bold: true, color: "D0D0D0", size: 18 })] })] }),
                        new TableCell({ shading: { fill: "222222" }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNum(spread.settle), color: "D0D0D0", bold: true, size: 18 })] })] }),
                        new TableCell({ shading: { fill: "222222" }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatChg(spread.chg), color: chgColor, size: 18 })] })] }),
                        new TableCell({ shading: { fill: "222222" }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNum(spread.volume), color: "D0D0D0", bold: true, size: 18 })] })] }),
                        new TableCell({ shading: { fill: "222222" }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatChg(spread.delVolume), color: delVolColor, size: 18 })] })] })
                    ]
                });
            });

            childrenStructure.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: cleanBorders, rows: [buildHeaderRow(spreadHeaders), ...spreadRows] }));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // SECTION: CHANGE IN WAREHOUSE STOCKS
    // ─────────────────────────────────────────────────────────────────
    childrenStructure.push(
        new Paragraph({
            spacing: { before: 600, after: 200 },
            children: [new TextRun({ text: "CHANGE IN WAREHOUSE STOCKS", bold: true, size: 26, color: "5A5A5A" })]
        })
    );

    const warehouseRows = [];
    const fmtW = (val) => (val === null || val === undefined) ? "—" : Number(val).toLocaleString("en-US");

    // KC
    if (excelData.kc) {
        warehouseRows.push(new TableRow({
            children: [
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "KC (Arabica)", bold: true, color: "A0A0A0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Total Certified", color: "707070", size: 18 })] })] }),
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmtW(excelData.kc.total), bold: true, color: "E0E0E0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: excelData.kc.date || "—", color: "707070", size: 18 })] })] }),
            ]
        }));
    }

    // RC
    if (excelData.rc) {
        warehouseRows.push(new TableRow({
            children: [
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "RC (Robusta)", bold: true, color: "A0A0A0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "RC-TOT-VG", color: "707070", size: 18 })] })] }),
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmtW(excelData.rc.total), bold: true, color: "E0E0E0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: excelData.rc.date || "—", color: "707070", size: 18 })] })] }),
            ]
        }));
    }

    // LCC
    if (excelData.lcc) {
        warehouseRows.push(new TableRow({
            children: [
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "LCC (London Cocoa)", bold: true, color: "A0A0A0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Daily Total Delta", color: "707070", size: 18 })] })] }),
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmtW(excelData.lcc.daily_total_delta), bold: true, color: excelData.lcc.daily_total_delta > 0 ? "00B050" : excelData.lcc.daily_total_delta < 0 ? "FF0000" : "E0E0E0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "1E1E1E" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: excelData.lcc.date || "—", color: "707070", size: 18 })] })] }),
            ]
        }));
    }

    // CC Total Bags
    if (excelData.ccBags) {
        warehouseRows.push(new TableRow({
            children: [
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "CC (NY Cocoa) — Total Bags", bold: true, color: "A0A0A0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Daily Change", color: "707070", size: 18 })] })] }),
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmtW(excelData.ccBags.totalBags), bold: true, color: excelData.ccBags.totalBags > 0 ? "00B050" : excelData.ccBags.totalBags < 0 ? "FF0000" : "E0E0E0", size: 20 })] })] }),
                new TableCell({ shading: { fill: "242424" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: excelData.ccBags.date || "—", color: "707070", size: 18 })] })] }),
            ]
        }));
    }

    // Combined warehouse table
    if (warehouseRows.length > 0) {
        const whHeaders = ["Product", "Metric", "Value", "As of Date"];
        const whHeaderRow = new TableRow({
            tableHeader: true,
            children: whHeaders.map(text => new TableCell({
                shading: { fill: "111111" },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [new Paragraph({ alignment: text === "Product" ? AlignmentType.LEFT : AlignmentType.RIGHT, children: [new TextRun({ text, color: "808080", bold: true, size: 18 })] })]
            }))
        });
        childrenStructure.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: cleanBorders, rows: [whHeaderRow, ...warehouseRows] }));
    }

    // CC Cash Prices — Differentials sub-table
    if (excelData.ccCash) {
        const c = excelData.ccCash;
        childrenStructure.push(
            new Paragraph({ spacing: { before: 250, after: 150 }, children: [new TextRun({ text: "CC (NY COCOA) — CASH PRICE DIFFERENTIALS", bold: true, size: 20, color: "7A7A7A" })] })
        );
        const diffHeaders = ["Origin", "Differential"];
        const diffHeaderRow = new TableRow({
            tableHeader: true,
            children: diffHeaders.map(text => new TableCell({
                shading: { fill: "111111" },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [new Paragraph({ alignment: text === "Origin" ? AlignmentType.LEFT : AlignmentType.RIGHT, children: [new TextRun({ text, color: "808080", bold: true, size: 18 })] })]
            }))
        });
        const diffRows = [
            ["IC (Ivory Coast) Differential", c.icDifferential],
            ["Ghana Differential", c.ghanaDifferential],
            ["Nigeria Differential", c.nigeriaDifferential],
            ["Ecuador Differential", c.ecuadorDifferential],
        ].map(([label, val], idx) => new TableRow({
            children: [
                new TableCell({ shading: { fill: idx % 2 === 0 ? "1E1E1E" : "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: "D0D0D0", size: 18 })] })] }),
                new TableCell({ shading: { fill: idx % 2 === 0 ? "1E1E1E" : "242424" }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmtW(val), bold: true, color: "E0E0E0", size: 18 })] })] }),
            ]
        }));
        childrenStructure.push(new Table({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: cleanBorders, rows: [diffHeaderRow, ...diffRows] }));
    }

    return new Document({
        sections: [{
            properties: {},
            children: childrenStructure
        }]
    });
}

async function buildWordDocBuffer(groupsData, excelData = {}) {
    console.log("🎨 [Word Generator] Compiling DOCX payload...");
    const doc = assembleDocument(groupsData, excelData);
    return await Packer.toBuffer(doc);
}

async function buildWordDocBase64(groupsData, excelData = {}) {
    const bufferBytes = await buildWordDocBuffer(groupsData, excelData);
    return bufferBytes.toString("base64");
}

module.exports = { buildWordDocBase64, buildWordDocBuffer };
