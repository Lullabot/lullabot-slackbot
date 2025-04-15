# System Patterns: Lullabot Slack Bot

## Architecture
- **Core Framework:** Slack Bolt for JavaScript/TypeScript (`@slack/bolt`).
- **Entry Point:** `src/bot.ts` initializes the Bolt app and loads plugins.
- **Plugin System:**
    - Plugins reside in `src/plugins/`.
    - `src/bot.ts` dynamically loads all `.ts` (dev) or `.js` (prod) files from `src/plugins/` at startup.
    - Each plugin file must export a default async function implementing the `Plugin` type (`(app: App) => Promise<void>`).
    - Plugins register their own listeners (messages, events, commands) directly with the `app` instance passed to them.
- **Configuration:** Uses `.env` file for Slack API tokens (`BOT_TOKEN`, `SLACK_APP_TOKEN`, `CLIENT_SIGNING_SECRET`). Loaded via `dotenv` package.
- **Data Storage:** Uses file-based JSON storage in the `data/` directory (not checked in source control). Karma and Factoids are mentioned in the README as using this. Storage seems to be managed within individual plugins.

## Key Technical Decisions
- **TypeScript:** The project is written in TypeScript, compiled to JavaScript for production.
- **Socket Mode:** The bot connects to Slack using Socket Mode (`socketMode: true` in `App` config).
- **Dynamic Plugin Loading:** Avoids the need for a central plugin registry file. Plugins are discovered and loaded automatically from the `src/plugins` directory.
- **File-based Data:** Simple JSON files for persistence, likely suitable for moderate scale. Location: `data/` directory (relative to runtime, needs confirmation if this exists or is created dynamically).

## Component Relationships
```mermaid
graph TD
    A[src/bot.ts] --> B(Load Plugins);
    B --> C{src/plugins/*.ts};
    C -- registers listeners --> D[@slack/bolt App];
    A -- initializes --> D;
    D -- uses --> E[Slack API];
    C -- interacts with --> F[Data Storage (data/*.json)];
    G[package.json] -- defines dependencies --> D;
    H[.env] -- provides credentials --> A;
``` 