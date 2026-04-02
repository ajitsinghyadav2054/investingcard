# Investing Card (Teams Macro Briefing)

Automated service to fetch financial data and economic events, then deliver a consolidated Adaptive Card to Microsoft Teams.

## Features
- **Macro Closing Gaps:** Fetches OHLC data for key contracts (Crude, Gold, S&P 500, DXY, GBP/USD, BRL/USD).
- **Daily Levels:** Extracts Previous Close, Settlement, High, and Low for soft commodity futures.
- **Economic Calendar:** Fetches 3-star high-impact US economic events from Investing.com with automatic timezone conversion to London/GMT.
- **Adaptive Card delivery:** Sends a beautifully formatted, slimmed-down card (under 28KB) via Power Automate webhooks.
- **Auto-Scheduling:** Configured via PM2 to run every weekday at **08:00 AM**.

## Setup
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file based on `.env.example`.
4. Run with `node masterBrief.js` or use PM2: `pm2 start masterBrief.js --name "teams-macro-card"`.

## Project Structure
- `masterBrief.js`: Main entry point and scheduler.
- `helpers/`: Data fetching and Adaptive Card building logic.
- `.env`: (Not included) Environment variables for API tokens and Webhooks.
