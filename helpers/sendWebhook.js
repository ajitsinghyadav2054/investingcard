const axios = require("axios");
require("dotenv").config();

/**
 * Posts an Adaptive Card to the Morning Macro Brief Teams chat via
 * the Power Automate "Send webhook alerts to a chat" flow.
 *
 * The flow reads triggerBody()?['attachments'] — if not null, it posts
 * the content as an Adaptive Card to the chat.
 *
 * @param {Object} adaptiveCard — output from buildCard()
 */
async function sendCard(adaptiveCard) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

    if (!webhookUrl) {
        throw new Error("TEAMS_WEBHOOK_URL is not set in .env");
    }

    // The Power Automate template checks if 'attachments' is null.
    // When it is NOT null, the flow posts the adaptive card to Teams.
    // This is the standard Teams webhook envelope format the template expects.
    const payload = {
        type: "message",
        attachments: [
            {
                contentType: "application/vnd.microsoft.card.adaptive",
                contentUrl: null,
                content: adaptiveCard,   // adaptive card object (not stringified)
            },
        ],
    };

    console.log("📤 Posting Adaptive Card to Power Automate webhook...");

    const response = await axios.post(webhookUrl, payload, {
        headers: { "Content-Type": "application/json" },
        // Power Automate returns 202 Accepted
        validateStatus: (status) => status >= 200 && status < 300,
    });

    console.log(`✅ Accepted by Power Automate. HTTP ${response.status}`);
    return response;
}

module.exports = { sendCard };
