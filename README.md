# Lullabot Slack Bot

A Slack bot built with the [Bolt framework](https://tools.slack.dev/bolt-js/) that provides various utility functions for the Lullabot Slack workspace.

This provides a modular architecture for adding new features to the bot.

## Development

### Prerequisites

- Node.js (v18 or higher recommended)
- npm
- A Slack workspace with admin access
- Slack bot token and app-level token

### Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a new Slack app at https://api.slack.com/apps/

4. Configure the app using the provided `slack-app-manifest.json` file

5. Create an app-level token with these scopes:
   - connections:write
   - authorizations:read 
   - app_configurations:write
   This will be your `SLACK_APP_TOKEN` (starts with xapp-)

6. Under OAuth & Permissions:
   - Click "Install to Workspace" to get the OAuth token
   - Copy the Bot User OAuth Token - this will be your `BOT_TOKEN` (starts with xoxb-)

7. Under Basic Information:
   - Find "Signing Secret" in App Credentials section
   - Copy the signing secret - this will be your `CLIENT_SIGNING_SECRET`


8. Create a `.env` file in the root directory with your Slack tokens:

```
BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
CLIENT_SIGNING_SECRET=your-signing-secret
```

### Development Commands

```bash
npm run dev      # Run in development mode with ts-node
npm run build    # Build TypeScript to JavaScript
npm start        # Build and run the production version
npm run watch    # Watch for changes and rebuild
```

### Creating New Plugins

Plugins are written in TypeScript and should be placed in the `src/plugins` directory. Each plugin should:

1. Import required types:

```typescript
import { App } from '@slack/bolt';
import { Plugin } from '../types';
```

2. Export a default function that implements the Plugin type:

```typescript
const myPlugin: Plugin = async (app: App): Promise<void> => {
    // Your plugin code here
};

export default myPlugin;
```

3. Use proper type annotations for Slack events:

```typescript
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';

app.message(/pattern/, async ({ message, say }) => {
    const msg = message as GenericMessageEvent;
    // Handle message
});
```

## Plugins

### Help

Access documentation and command information for all bot features.

Features:
- Lists all available plugins and their commands
- Provides detailed help for specific plugins
- Responds in threads for better organization
- Supports multiple query formats

Examples:
```
@bot help                 # Show all commands
@bot commands             # Show all commands
@bot plugins              # List available plugins
@bot help factoids        # Show factoids help
@bot help karma           # Show karma help
```

### Factoids

Store and retrieve custom responses for frequently asked questions or common information.

Features:
- Store and retrieve custom responses
- Support for direct responses and templated replies
- Update or append to existing factoids
- Interactive buttons for managing factoid updates
- Delete factoids with the 'forget' command
- Trigger factoids by starting a message with the keyword followed by ? or !

Examples:

**Query a factoid:**
```
sales?                   # Show the "sales" factoid
@username?              # Show factoid for a user
documentation!          # Show the "documentation" factoid (! works same as ?)
```

**Manage factoids:**
```
!factoid: list          # List all available factoids
@bot X is Y             # Set a new factoid
@bot X is <reply>Y      # Set a factoid with direct reply
@bot forget X           # Delete a factoid
```

When setting a factoid, you can use `<reply>` to make the bot respond with just the content instead of "X is Y":
- Without reply: "sales is Check out https://sales.example.com"
- With reply: "Check out https://sales.example.com"

**Thread Support:**
- All factoid responses respect message threading
- Updates and management happen in threads when triggered from a thread

### Karma System

Track and manage karma points for users and things in your Slack workspace.

Features:
- Give or take karma points using ++ or --
- Query karma levels for users or items
- Prevents self-karma manipulation
- Supports user mentions and plain text
- Persistent storage per team
- Thread-aware responses

Examples:

**Give/Take Karma:**
```
@user++                    # Give karma to user
@user--                    # Take karma from user
cats++                     # Give karma to thing
tacos--                    # Take karma from thing
:emoji:++                  # Give karma to emoji
```

**Query Karma:**
```
karma @user               # Query user's karma
karma cats               # Query thing's karma
@bot karma @user         # Query via mention
```

Note: Users cannot give or take karma from themselves.

### Greetings

- Responds to various greeting patterns
- Adds wave reactions to greetings
- Supports both direct messages and mentions
- Fallback to text responses if reactions fail

Examples:

- `hello!`
- `hey!`
- `hi!`
- `:wave:`

### Uptime

- Reports bot uptime statistics
- Shows bot identification information
- Responds to various identity queries

Examples:

- `uptime`
- `identify yourself`
- `who are you`
- `what is your name`

### Botsnack

Give the bot a treat and receive a message of gratitude!

Features:
- Responds to "botsnack" with random thank you messages
- Supports both direct messages and mentions
- Includes emoji reactions

Examples:
```
botsnack              # Give the bot a snack
@bot botsnack         # Give the bot a snack (with mention)
```



## Data Storage

The bot uses file-based JSON storage in the `data` directory for:

- Karma points
- Factoids
- Each team's data is stored in separate files

## Plugin Architecture

The bot uses a modular plugin system. Each feature is implemented as a separate plugin in the `plugins` directory. New functionality can be added by creating new plugin files.

## Contributing

1. Create a new plugin file in the `plugins` directory
2. Export an async function that takes the Bolt app instance as a parameter
3. Use Bolt's event system to handle messages and interactions
4. Follow existing patterns for data storage and error handling

## Testing

### Factoid Pattern Testing

The factoid plugin includes a test suite that verifies the pattern matching functionality works correctly. This ensures the bot correctly identifies which messages should trigger factoid lookups and which should be ignored.

#### Running the Tests

To run the factoid tests:

```bash
npm test
```

This will run all test suites, including the factoid pattern tests.

To run just the factoid tests:

```bash
npm test -- -t "Factoids Plugin"
```

#### Adding New Test Patterns

The test patterns are defined in two arrays in `src/plugins/__tests__/factoids.test.ts`:

1. `shouldMatchPatterns` - Patterns that SHOULD trigger a factoid lookup
2. `shouldNotMatchPatterns` - Patterns that should NOT trigger a factoid lookup

To add new test patterns:

1. Open `src/plugins/__tests__/factoids.test.ts`
2. Add your new pattern to the appropriate array:

```typescript
// Use these patterns to test if the factoid plugin would trigger
const shouldMatchPatterns = [
    'factoid?',
    'factoid!',
    // Add your new MATCHING pattern here
    'your-new-pattern?'
];

// These patterns should NOT trigger the factoid plugin
const shouldNotMatchPatterns = [
    'factoid ?',
    'factoid !',
    // Add your new NON-MATCHING pattern here
    'your new pattern that should not match?'
];
```

3. Update the corresponding documentation in `src/tests/factoids-pattern-tests.md` to keep it in sync with the actual tests.

The current pattern matching rules are:

1. Messages ending with `?` or `!` with no space before the punctuation will trigger factoid lookup
2. User mentions followed by additional text are ignored
3. Messages with more than 5 words are considered too complex and ignored
4. Messages with a space before the final punctuation are ignored

#### Modifying Pattern Logic

The pattern matching logic is implemented in two places:

1. `src/plugins/__tests__/factoids.test.ts` in the `shouldTriggerFactoid` function (for testing)
2. `src/plugins/factoids.ts` in the message handler

If you need to change how patterns are matched, make sure to update both locations to keep them in sync.

## Maintenance

- Logs are output to console
- Plugin loading errors are handled gracefully
- Data files are stored in JSON format for easy debugging
- Each plugin handles its own error cases

## Dependencies

- @slack/bolt: Slack Bolt framework
- datejs: Date parsing and formatting
- dotenv: Environment variable management

For detailed API documentation and examples, refer to the [Slack Bolt documentation](https://slack.dev/bolt-js).
