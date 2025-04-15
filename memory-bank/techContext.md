# Tech Context: Lullabot Slack Bot

## Core Technologies
- **Language:** TypeScript (~v5.0.0)
- **Runtime:** Node.js (v18+ recommended)
- **Framework:** Slack Bolt for JS (`@slack/bolt` ~v4.1.1)
- **Package Manager:** npm

## Key Dependencies
- `@slack/bolt`: Core Slack framework.
- `@slack/types`: TypeScript types for Slack events/objects.
- `dotenv`: Loads environment variables from `.env`.
- `datejs`: (Used by Karma plugin, potentially others - needs verification)

## Development Setup
- **Install:** `npm install`
- **Run Dev:** `npm run dev` (uses `ts-node` and `nodemon` for live reload)
- **Build:** `npm run build` (uses `tsc` to compile TS to `dist/`)
- **Run Prod:** `npm start` (runs `node dist/bot.js`)
- **Testing:** `npm test` (uses `jest` and `ts-jest`)

## Environment Variables (.env)
- `BOT_TOKEN`: Slack Bot User OAuth Token (xoxb-)
- `SLACK_APP_TOKEN`: Slack App-Level Token (xapp-)
- `CLIENT_SIGNING_SECRET`: Slack App Signing Secret

## Build/Deployment
- TypeScript is compiled to JavaScript in the `dist/` directory via `npm run build`.
- Production starts the compiled `dist/bot.js` script.
- Assumes a Node.js environment for execution. 