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
    'add-prompt': {
        title: 'Add Prompt',
        description: 'Submit Slack messages as prompts to the prompt library',
        commands: [
            { pattern: '@bot add-prompt <permalink>', description: 'Add a Slack message as a prompt using its permalink' }
        ]
    }
};

/**
 * Helper function to get the bot's user ID from Slack client
 * @param client - The Slack client instance
 * @returns Promise resolving to the bot's user ID
 */
async function getBotUserId(client: any): Promise<string | undefined> {
    try {
        const botInfo = await client.auth.test();
        return botInfo.user_id;
    } catch (error) {
        console.error('Failed to get bot user ID:', error);
        return undefined;
    }
}

/**
 * Helper function to process help requests and generate appropriate responses
 * @param specificPlugin - The specific plugin requested (if any)
 * @param botUserId - The bot's user ID for dynamic mentions
 * @returns The formatted help response string
 */
function processHelpRequest(specificPlugin: string | undefined, botUserId: string | undefined): string {
    if (specificPlugin) {
        const pluginHelp = formatPluginHelp(specificPlugin, botUserId);
        return pluginHelp || `Plugin "${specificPlugin}" not found. Try one of: ${Object.keys(helpText).join(', ')}`;
    } else {
        return formatFullHelp(botUserId);
    }
}

/**
 * Helper function to replace @bot mentions with actual bot user mentions
 * @param pattern - The pattern string that may contain @bot
 * @param botUserId - The bot's user ID to replace @bot with
 * @returns The pattern with @bot replaced by <@botUserId> or original pattern if no botUserId
 */
function replaceBotMentions(pattern: string, botUserId?: string): string {
    if (botUserId && pattern.includes('@bot')) {
        return pattern.replace(/@bot/g, `<@${botUserId}>`);
    }
    return pattern;
}

function formatPluginHelp(plugin: string, botUserId?: string): string | null {
    const help = helpText[plugin];
    if (!help) return null;

    let response = `*${help.title}*\n${help.description}\n\n*Commands:*\n`;
    help.commands.forEach(cmd => {
        const pattern = replaceBotMentions(cmd.pattern, botUserId);
        response += `• \`${pattern}\` - ${cmd.description}\n`;
    });
    return response;
}

function formatFullHelp(botUserId?: string): string {
    let response = '*Available Plugins:*\n\n';
    
    Object.keys(helpText).forEach(plugin => {
        const help = helpText[plugin];
        response += `*${help.title}*\n${help.description}\n`;
        response += '_Key commands:_\n';
        help.commands.slice(0, 2).forEach(cmd => {
            const pattern = replaceBotMentions(cmd.pattern, botUserId);
            response += `• \`${pattern}\` - ${cmd.description}\n`;
        });
        response += '\n';
    });
    
    const botMention = replaceBotMentions('@bot', botUserId);
    response += `\nFor detailed help on a specific plugin, try \`${botMention} help <plugin>\` (e.g., \`${botMention} help karma\`)`;
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
    
    app.event('app_mention', async ({ event, say, client }) => {
        const mention = event as AppMentionEvent;
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        const matches = text.match(helpRegex);

        if (matches) {
            // Get bot's user ID for dynamic help text
            const botUserId = await getBotUserId(client);
            const specificPlugin = matches[1]?.toLowerCase();
            const response = processHelpRequest(specificPlugin, botUserId);

            await say({
                text: response,
                thread_ts: mention.thread_ts || mention.ts
            });
        }
    });

    // Also handle direct message help requests
    app.message(helpRegex, async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        if (!msg.text) return;
        
        // Get bot's user ID for dynamic help text
        const botUserId = await getBotUserId(client);
        const matches = msg.text.match(helpRegex);
        const specificPlugin = matches?.[1]?.toLowerCase();
        const response = processHelpRequest(specificPlugin, botUserId);

        await say({
            text: response,
            thread_ts: msg.thread_ts || msg.ts
        });
    });
};

export default helpPlugin; 
