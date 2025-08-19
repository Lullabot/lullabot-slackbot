# Product Context: Lullabot Slack Bot

## Problem Solved
Provides automated utilities, information retrieval (factoids), and community engagement features (karma) within the Lullabot Slack workspace, reducing repetitive questions and adding useful/fun interactions.

## Intended Workflow
- Users interact with the bot via direct messages, mentions (`@bot`), or specific message patterns (e.g., `keyword?`, `item++`).
- The bot listens for these triggers and responds accordingly, often in threads to keep channels clean.
- New functionalities are added as self-contained plugins.
- Factoids can be created, retrieved, and managed with link preview control.

## User Experience Goals
- **Responsive:** The bot should react quickly to commands.
- **Helpful:** Provide clear information and perform utility tasks effectively.
- **Organized:** Use threads for detailed responses to avoid cluttering main channels.
- **Customizable:** Control display options like link previews in factoids.
- **Extensible:** Easily add new commands and features through the plugin system.

## Recent Enhancements
- **Dynamic Help Text (January 2025):** Help commands now show the actual bot name for improved copy/paste usability.
  - Instead of generic `@bot help factoids`, users see `@tugbot help factoids` (actual bot name)
  - Makes help documentation immediately actionable without manual editing
  - Seamless integration with existing help system functionality
- **Link Preview Control:** Users can now control whether links in factoids display previews.
  - `@bot X is Y | preview` enables previews (default)
  - `@bot X is Y | nopreview` disables previews
  - The factoid list shows a lock icon (🔒) for factoids with links that have previews disabled
- **Improved Message Handling:** Enhanced pattern matching for more reliable command recognition.
- **Better Threading:** Improved response threading for better conversation context. 
