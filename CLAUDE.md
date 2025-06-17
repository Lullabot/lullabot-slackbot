# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Slack bot for the Lullabot workspace built with TypeScript and the Slack Bolt framework. It uses a modular plugin architecture where each feature is implemented as a separate plugin that can be loaded dynamically.

## Common Development Commands

```bash
# Development
npm run dev          # Run in development mode with hot reload (nodemon + ts-node)
npm run build        # Compile TypeScript to JavaScript
npm run watch        # Watch mode compilation (tsc -w)
npm start            # Production mode - builds and runs (node dist/bot.js)

# Testing
npm test             # Run Jest tests with forceExit
npm test -- -t "Factoids Plugin"  # Run specific test suite

# Utilities  
npm run clean        # Remove dist directory
```

## Architecture Overview

### Plugin System

- **Plugin Loading**: Automatic discovery from `src/plugins/` directory
- **Plugin Interface**: Each plugin exports a default function `(app: App) => Promise<void>`
- **Environment Aware**: Loads `.ts` files in development, `.js` files in production
- **Error Handling**: Individual plugin failures don't crash the entire bot

### Core Components

- **`src/bot.ts`**: Main entry point with plugin loader
- **`src/plugins/`**: Individual feature modules (karma, factoids, help, etc.)
- **`src/services/pattern-registry.ts`**: Centralized pattern management with priority system
- **`src/types/index.ts`**: TypeScript interfaces for Plugin, Storage, Command, HelpSection
- **`data/`**: JSON-based persistent storage (team-separated data files)

### Key Plugins

- **factoids.ts**: Store/retrieve Q&A responses with pattern matching
- **karma.ts**: User/item karma tracking with ++ and -- operators  
- **help.ts**: Dynamic help system that documents all plugins
- **hello.ts**: Greeting detection and responses
- **uptime.ts**: Bot status and identification
- **botsnack.ts**: Fun interactions with thank you responses

## Plugin Development Patterns

### Basic Plugin Structure

```typescript
import { App } from '@slack/bolt';
import { Plugin } from '../types';

const myPlugin: Plugin = async (app: App): Promise<void> => {
    // Event handlers here
};

export default myPlugin;
```

### Message Pattern Matching

- Use the PatternRegistryService for conflict detection
- Higher priority patterns checked first
- Thread-aware responses (all plugins should respect threading)
- Proper TypeScript event typing with `GenericMessageEvent` and `AppMentionEvent`

### Data Storage Pattern

- JSON files in `/data` directory
- Team-based file separation: `{teamId}-{pluginName}.json`
- Use Storage interface for consistent data handling
- Graceful file creation if data doesn't exist

## Testing Strategy

- **Jest Framework**: Uses ts-jest preset with Node environment
- **Test Location**: `**/__tests__/**/*.test.ts` pattern
- **Factoid Tests**: Comprehensive pattern matching validation in `src/plugins/__tests__/factoids.test.ts`
- **Test Arrays**: `shouldMatchPatterns` and `shouldNotMatchPatterns` for validation
- **Coverage**: Automatic coverage collection with text and lcov reporters

## Environment Configuration

Required environment variables:

- `BOT_TOKEN`: Slack Bot User OAuth Token (xoxb-)
- `SLACK_APP_TOKEN`: App-level token (xapp-)  
- `CLIENT_SIGNING_SECRET`: Slack app signing secret
- `NODE_ENV`: Set to 'production' for compiled JS, 'development' for ts-node

## Data Persistence

- **Storage Format**: JSON files per team per plugin
- **Location**: `/data` directory (Docker volume mounted)
- **Team Isolation**: Each Slack team gets separate data files
- **Backup Strategy**: File-based storage allows easy backup/restore

## Socket Mode Configuration

Bot uses Slack Socket Mode for real-time events:

- WebSocket connection for instant message delivery
- No webhook URLs needed
- Handles reconnection automatically
- Supports interactive elements (buttons, modals)

## TypeScript Configuration

- **Target**: ES2020 with CommonJS modules
- **Strict Mode**: Full TypeScript strict checking enabled
- **Slack Types**: Uses official `@slack/types` package
- **Module Resolution**: Node-style module resolution
- **Build Output**: `dist/` directory for production
