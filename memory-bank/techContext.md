# Tech Context: Lullabot Slack Bot

## Core Technologies

- **Language:** TypeScript (v5.8.2)
- **Runtime:** Node.js (v22.x)
- **Framework:** Slack Bolt for JS (`@slack/bolt` v4.2.1)
- **Package Manager:** npm

## Key Dependencies

- `@slack/bolt`: Core Slack framework
- `@slack/types`: TypeScript types for Slack events/objects
- `dotenv`: Loads environment variables from `.env`
- `datejs`: Used by plugins for date manipulation
- `jest` & `ts-jest`: Testing framework
- `nodemon`: Development tool for automatic reloading

## Development Setup

- **Install:** `npm install`
- **Run Dev:** `npm run dev` (uses `ts-node` and `nodemon` for live reload)
- **Build:** `npm run build` (uses `tsc` to compile TS to `dist/`)
- **Run Prod:** `npm start` (runs compiled code with production environment)
- **Testing:** `npm test` (runs Jest tests)

## Environment Variables (.env)

- `BOT_TOKEN`: Slack Bot User OAuth Token (xoxb-)
- `SLACK_APP_TOKEN`: Slack App-Level Token (xapp-)
- `CLIENT_SIGNING_SECRET`: Slack App Signing Secret

## Testing

- Jest is configured for TypeScript testing
- Test files are located in `src/plugins/__tests__/`
- Recent focus on expanding test coverage for factoids plugin
- Tests verify pattern matching, command handling, and response formatting

## Build/Deployment

- TypeScript is compiled to JavaScript in the `dist/` directory via `npm run build`
- Production uses the compiled JavaScript code
- Environment is set to production with `NODE_ENV=production`
