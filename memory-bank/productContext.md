# Product Context: Lullabot Slack Bot

## Problem Solved
Provides automated utilities, information retrieval (factoids), community engagement features (karma), and unit conversions within the Lullabot Slack workspace, reducing repetitive questions and adding useful/fun interactions.

## Intended Workflow
- Users interact with the bot via direct messages, mentions (`@bot`), or specific message patterns (e.g., `keyword?`, `item++`, `convert X to Y`).
- The bot listens for these triggers and responds accordingly, properly maintaining thread context to keep channels organized.
- New functionalities are added as self-contained plugins.
- Factoids can be created, retrieved, and managed with link preview control.
- Unit conversions support both automatic opposite-unit conversion and explicit target unit specification.

## User Experience Goals
- **Responsive:** The bot should react quickly to commands.
- **Helpful:** Provide clear information and perform utility tasks effectively.
- **Organized:** Use threads for detailed responses to avoid cluttering main channels.
- **Customizable:** Control display options like link previews in factoids.
- **Extensible:** Easily add new commands and features through the plugin system.
- **Intelligent:** Respect user intent, especially for unit conversion requests with specific target units.

## Recent Enhancements
- **Dynamic Help Text (January 2025):** Help commands now show the actual bot name for improved copy/paste usability.
  - Instead of generic `@bot help factoids`, users see `@tugbot help factoids` (actual bot name)
  - Makes help documentation immediately actionable without manual editing
  - Seamless integration with existing help system functionality
- **Unit Conversions Plugin (August 2025):** Complete implementation with explicit target unit support
  - `convert 5k to in` correctly returns inches instead of defaulting to miles
  - `what is 100°C in fahrenheit?` returns only Fahrenheit as requested
  - Support for both `@bot convert X to Y` and direct `convert X to Y` commands
  - Backward compatibility maintained for existing `convert X` auto-opposite behavior
- **Thread Handling Improvements (August 2025):** Enhanced threading support across conversion commands
  - Conversion responses now correctly appear in threads when requested from threads
  - Maintains clean channel organization while preserving conversation context
- **Link Preview Control:** Users can now control whether links in factoids display previews.
  - `@bot X is Y | preview` enables previews (default)
  - `@bot X is Y | nopreview` disables previews
  - The factoid list shows a lock icon (🔒) for factoids with links that have previews disabled
- **Improved Message Handling:** Enhanced pattern matching for more reliable command recognition.
- **Better Threading:** Improved response threading for better conversation context across all plugins.
