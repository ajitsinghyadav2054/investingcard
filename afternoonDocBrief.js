require("dotenv").config();
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const { fetchWordData } = require("./helpers/fetchWordData");
const { fetchExcelData } = require("./helpers/fetchExcelData");
const { buildWordDocBuffer } = require("./helpers/buildWordDoc");

async function sendAfternoonDocBrief() {
    console.log(`\n⏰ [${new Date().toISOString()}] Generating Afternoon DOCX Report...`);
    try {
        // 1. Fetch market data AND excel warehouse data in parallel
        const [dataObj, excelData] = await Promise.all([
            fetchWordData(),
            fetchExcelData()
        ]);

        // 2. Build the exact physical Word Document binary file buffer directly
        console.log("🎨 Building binary Word Document...");
        const docBuffer = await buildWordDocBuffer(dataObj, excelData);

        // 3. Instead of Webhooks, blindly overwrite the Word Doc on your Local OneDrive!
        // Because your OneDrive is connected to Teams, Microsoft synchronizes this physical file live silently!
        const oneDrivePath = `C:\\Users\\Ajit.yadav\\OneDrive - hertshtengroup.com\\Daily_Contract_Summary.docx`;

        console.log(`💾 Writing physical DOCX silently to: ${oneDrivePath}`);
        fs.writeFileSync(oneDrivePath, docBuffer);

        console.log("✅ Afternoon Brief successfully synced to OneDrive!");
        console.log("🔥 Any tab in Microsoft Teams loaded with this OneDrive file just auto-updated!");
    } catch (err) {
        console.error("❌ Critical failure writing DOCX File:", err?.response?.data || err.message);
    }
}

// ── SCHEDULING (Mon-Fri) ──────────────────────────────────────────────────
console.log("⏳ AFTERNOON Report Service initialized:");
console.log("   📋 Silently Overwriting OneDrive Word Doc → 15:00 (3:00 PM Local System Time)");

cron.schedule("0 15 * * 1-5", () => {
    sendAfternoonDocBrief();
});

module.exports = { sendAfternoonDocBrief };
