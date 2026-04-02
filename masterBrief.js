const cron = require("node-cron");

// Fetchers
const { fetchAndCompute } = require("./helpers/fetchOhlc");
const { fetchDailyLevels } = require("./helpers/fetchDailyLevels");
const { fetchCalendarEvents } = require("./helpers/fetchCalendar");

// Builders
const { buildCombinedCard } = require("./helpers/buildCombinedCard");

// Sender (Single Webhook)
const { sendCard } = require("./helpers/sendWebhook");

// ── CORE FUNCTION: Sending the Giant AM Card ───────────────────────────
async function sendConsolidatedMorningBrief() {
    console.log(`\n⏰ [${new Date().toISOString()}] Generating Consolidated Morning Brief...`);
    try {
        // Fire all three fetches simultaneously to save time
        console.log("📥 Fetching 3 independent datasets simultaneously...");
        const [macroData, levelsData, eventsData] = await Promise.all([
            fetchAndCompute(),
            fetchDailyLevels(),
            fetchCalendarEvents()
        ]);

        console.log("🎨 Building unified Master Card...");
        const masterCard = buildCombinedCard(macroData, levelsData, eventsData);

        console.log("📤 Dispatching to Teams...");
        await sendCard(masterCard);

        console.log("✅ Consolidated Brief delivered successfully.");
    } catch (err) {
        console.error("❌ Critical failure constructing Master Brief:", err?.response?.data || err.message);
    }
}

// ── SCHEDULING (Mon-Fri) ──────────────────────────────────────────────────
console.log("⏳ MASTER Macro Service initialized:");
console.log("   📋 Unified 3-Part Card → 08:00 AM (Local System Time)");

// 1️⃣ Send the unified master card precisely at 08:00 Local Time (with auto-retry)
async function sendWithRetry(attempts = 3, delayMs = 3 * 60 * 1000) {
    for (let i = 1; i <= attempts; i++) {
        try {
            await sendConsolidatedMorningBrief();
            return; // success — stop retrying
        } catch (err) {
            console.error(`❌ Attempt ${i}/${attempts} failed:`, err.message);
            if (i < attempts) {
                console.log(`🔄 Retrying in 3 minutes...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    }
    console.error("❌ All retry attempts exhausted. Card not sent today.");
}

cron.schedule("0 8 * * 1-5", () => {
    sendWithRetry();
});

// Export for manual testing
module.exports = { sendConsolidatedMorningBrief };
