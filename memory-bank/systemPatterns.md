# System Patterns: Lullabot Slack Bot

## Architecture
- **Core Framework:** Slack Bolt for JavaScript/TypeScript (`@slack/bolt`).
- **Entry Point:** `src/bot.ts` initializes the Bolt app and loads plugins.
- **Plugin System:**
    - Plugins reside in `src/plugins/`.
    - `src/bot.ts` dynamically loads all `.ts` (dev) or `.js` (prod) files from `src/plugins/` at startup.
    - Each plugin file must export a default async function implementing the `Plugin` type (`(app: App) => Promise<void>`).
    - Plugins register their own listeners (messages, events, commands) directly with the `app` instance passed to them.
    - Plugins register their patterns with the pattern registry to prevent conflicts.
- **Pattern Registry:**
    - Located at `src/services/pattern-registry.ts`.
    - Provides a centralized registry for command patterns.
    - Helps prevent conflicts between plugins.
    - Allows patterns to have priority levels for handling order.
- **Configuration:** Uses `.env` file for Slack API tokens (`BOT_TOKEN`, `SLACK_APP_TOKEN`, `CLIENT_SIGNING_SECRET`). Loaded via `dotenv` package.
- **Data Storage:** Uses file-based JSON storage in the `data/teams` directory. Karma and Factoids both use this storage mechanism to preserve user data across restarts.

## Key Technical Decisions
- **TypeScript:** The project is written in TypeScript, compiled to JavaScript for production.
- **Socket Mode:** The bot connects to Slack using Socket Mode (`socketMode: true` in `App` config).
- **Dynamic Plugin Loading:** Avoids the need for a central plugin registry file. Plugins are discovered and loaded automatically from the `src/plugins` directory.
- **File-based Data:** Simple JSON files for persistence, suitable for current scale. Location: `data/teams` directory.
- **Pattern-Based Message Handling:** Plugins define regex patterns that match messages, with priority levels to handle potential conflicts.

## Component Relationships
```mermaid
graph TD
    A[src/bot.ts] --> B(Load Plugins);
    B --> C{src/plugins/*.ts};
    C -- registers patterns --> G[Pattern Registry];
    C -- registers listeners --> D[@slack/bolt App];
    A -- initializes --> D;
    D -- uses --> E[Slack API];
    C -- interacts with --> F[Data Storage (data/teams/*.json)];
    G -- supports --> C;
    H[package.json] -- defines dependencies --> D;
    I[.env] -- provides credentials --> A;
```

## Recent Enhancements
- Added link preview control mechanism for factoids
- Improved pattern matching for more reliable message handling
- Enhanced thread handling in message responses
- Expanded test coverage for critical plugins 