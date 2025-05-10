import { App } from '@slack/bolt';
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import { Plugin, HelpText } from '../types';
import patternRegistry from '../services/pattern-registry';

const helpText: HelpText = {
    botsnack: {
        title: 'Botsnack',
        description: 'Give the bot a treat!',
        commands: [
            { pattern: 'botsnack', description: 'Give the bot a snack' },
            { pattern: '@bot botsnack', description: 'Give the bot a snack (with mention)' }
        ]
    },
    factoids: {
        title: 'Factoids',
        description: 'Store and retrieve custom responses',
        commands: [
            { pattern: 'keyword?', description: 'Query a factoid (or use ! instead of ?)' },
            { pattern: '@bot X is Y', description: 'Set a factoid' },
            { pattern: '@bot X is <reply>Y', description: 'Set with direct reply' },
            { pattern: '@bot X is Y | preview', description: 'Set with link previews enabled (default)' },
            { pattern: '@bot X is Y | nopreview', description: 'Set with link previews disabled' },
            { pattern: '@bot forget X', description: 'Delete a factoid' },
            { pattern: '!factoid: list', description: 'List all factoids (🔒 indicates links with previews disabled)' },
            { pattern: '!factoid: cleanup', description: 'Find and remove invalid factoids' },
            { pattern: '!factoid: backup', description: 'Create a backup of all factoids' },
            { pattern: '!factoid: backups', description: 'List available factoid backups' },
            { pattern: '!factoid: restore FILENAME', description: 'Restore factoids from a backup file' }
        ]
    },
    karma: {
        title: 'Karma System',
        description: 'Track and manage karma points',
        commands: [
            { pattern: '@user++', description: 'Give karma to user' },
            { pattern: '@user--', description: 'Take karma from user' },
            { pattern: 'thing++', description: 'Give karma to thing' },
            { pattern: 'thing--', description: 'Take karma from thing' },
            { pattern: 'karma @user', description: "Query user's karma" },
            { pattern: 'karma thing', description: "Query thing's karma" }
        ]
    },
    greetings: {
        title: 'Greetings',
        description: 'Responds to various greeting patterns',
        commands: [
            { pattern: 'hello!', description: 'Say hello' },
            { pattern: 'hey!', description: 'Say hey' },
            { pattern: 'hi!', description: 'Say hi' },
            { pattern: ':wave:', description: 'Wave emoji' }
        ]
    },
    uptime: {
        title: 'Uptime',
        description: 'Bot status information',
        commands: [
            { pattern: 'uptime', description: 'Show bot uptime' },
            { pattern: 'identify yourself', description: 'Show bot info' },
            { pattern: 'who are you', description: 'Show bot identity' }
        ]
    },
    localllm: {
        title: 'Local LLM (Phi-2)',
        description: 'Interact with a local Large Language Model for natural language responses. Only the LLM plugin responds to the prompt command due to exclusivity.',
        commands: [
            { pattern: '@bot prompt: <your question>', description: 'Ask the local LLM a question or request. Example: @bot prompt: What is headless CMS?' }
        ],
        details: `
How it works:
- The LLM runs entirely on the Lullabot server. It does **not** connect to any external APIs, does **not** run any tools, and does **not** access the internet in any way. All processing is local and private.
- The model used is Phi-2 (https://huggingface.co/microsoft/phi-2), an open-source language model developed by Microsoft. Phi-2 is designed for efficiency and strong general language understanding, with a focus on clear, helpful, and safe responses.

Limitations:
- No Memory: Each prompt is processed independently. The LLM does not remember previous messages or conversations.
- No Tools or Web Access: The model cannot look up real-time information, run code, or access external resources.
- Training Cutoff: The model's knowledge is limited to what was available up to its last training date (late 2023). It cannot answer questions about events or developments after that time.
- Single-Turn Context: Each message is its own context. For follow-up questions, you must provide all necessary background in your prompt.

Usage Example:
  @bot prompt: What is headless CMS?
  @bot prompt: Tell me a joke about programming

The bot will reply directly in the channel where it was mentioned (not in a thread), with a helpful, clear, and brand-aligned answer.
        `
    }
};

function formatPluginHelp(plugin: string): string | null {
    const help = helpText[plugin];
    if (!help) return null;

    let response = `*${help.title}*\n${help.description}\n\n*Commands:*\n`;
    help.commands.forEach(cmd => {
        response += `• \`${cmd.pattern}\` - ${cmd.description}\n`;
    });
    if (help.details) {
        response += `\n${help.details.trim()}\n`;
    }
    return response;
}

function formatFullHelp(): string {
    let response = '*Available Plugins:*\n\n';
    
    Object.keys(helpText).forEach(plugin => {
        const help = helpText[plugin];
        response += `*${help.title}*\n${help.description}\n`;
        response += '_Key commands:_\n';
        help.commands.slice(0, 2).forEach(cmd => {
            response += `• \`${cmd.pattern}\` - ${cmd.description}\n`;
        });
        response += '\n';
    });
    
    response += '\nFor detailed help on a specific plugin, try `@bot help <plugin>` (e.g., `@bot help karma`)';
    return response;
}

const helpPlugin: Plugin = async (app: App): Promise<void> => {
    // Match help commands
    const helpRegex = /^(?:help|commands|plugins)(?:\s+(\w+))?$/i;
    
    // Register patterns with the registry with high priority
    patternRegistry.registerPattern(/^help$/i, 'help', 10);
    patternRegistry.registerPattern(/^commands$/i, 'help', 10);
    patternRegistry.registerPattern(/^plugins$/i, 'help', 10);
    
    // Also register common question words that should have higher priority than factoids
    patternRegistry.registerPattern(/^what$/i, 'common-words', 5);
    patternRegistry.registerPattern(/^who$/i, 'common-words', 5);
    patternRegistry.registerPattern(/^how$/i, 'common-words', 5);
    patternRegistry.registerPattern(/^when$/i, 'common-words', 5);
    patternRegistry.registerPattern(/^where$/i, 'common-words', 5);
    patternRegistry.registerPattern(/^why$/i, 'common-words', 5);
    
    app.event('app_mention', async ({ event, say }) => {
        const mention = event as AppMentionEvent;
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        const matches = text.match(helpRegex);

        if (matches) {
            const specificPlugin = matches[1]?.toLowerCase();
            let response: string;

            if (specificPlugin) {
                const pluginHelp = formatPluginHelp(specificPlugin);
                response = pluginHelp || `Plugin "${specificPlugin}" not found. Try one of: ${Object.keys(helpText).join(', ')}`;
            } else {
                response = formatFullHelp();
            }

            await say({
                text: response,
                thread_ts: mention.thread_ts || mention.ts
            });
        }
    });

    // Also handle direct message help requests
    app.message(helpRegex, async ({ message, say }) => {
        const msg = message as GenericMessageEvent;
        if (!msg.text) return;
        
        const matches = msg.text.match(helpRegex);
        const specificPlugin = matches?.[1]?.toLowerCase();
        let response: string;

        if (specificPlugin) {
            const pluginHelp = formatPluginHelp(specificPlugin);
            response = pluginHelp || `Plugin "${specificPlugin}" not found. Try one of: ${Object.keys(helpText).join(', ')}`;
        } else {
            response = formatFullHelp();
        }

        await say({
            text: response,
            thread_ts: msg.thread_ts || msg.ts
        });
    });
};

export default helpPlugin; 