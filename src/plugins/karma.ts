import { App } from '@slack/bolt';
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin, Storage } from '../types';
import patternRegistry from '../services/pattern-registry';

interface KarmaStorage extends Storage {
    data: {
        [key: string]: number;
    };
}

// Storage helper functions
const storageDir = path.join(__dirname, '..', '..', 'data', 'teams');
const getStoragePath = (team: string): string => path.join(storageDir, `${team}_karma.json`);

async function loadKarma(team: string): Promise<KarmaStorage> {
    try {
        await fs.promises.mkdir(storageDir, { recursive: true });
        const data = await fs.promises.readFile(getStoragePath(team), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { id: `${team}_karma`, data: {} };
    }
}

async function saveKarma(team: string, karma: KarmaStorage): Promise<void> {
    await fs.promises.mkdir(storageDir, { recursive: true });
    await fs.promises.writeFile(getStoragePath(team), JSON.stringify(karma, null, 2));
}

// Helper function to get user info
async function getUser(client: any, text: string) {
    const userMatch = text.match(/<@([UW][A-Z0-9]+)>/);
    if (userMatch) {
        try {
            const result = await client.users.info({ user: userMatch[1] });
            return result.user;
        } catch (error) {
            console.error('Error fetching user:', error);
            return null;
        }
    }
    return null;
}

// Check if user is trying to modify their own karma
async function isNarcissism(giverId: string, receiverId: string): Promise<boolean> {
    return giverId === receiverId;
}

const karmaPlugin: Plugin = async (app: App): Promise<void> => {
    // Register karma patterns with the registry
    patternRegistry.registerPattern(/^karma\s+.+$/i, 'karma', 10);
    patternRegistry.registerPattern(/^karma$/i, 'karma', 10);
    
    // Give/take karma
    app.message(/(.+?)(-{2,}|\+{2,})\s*$/, async ({ message, context, client, say }) => {
        if (!context.matches) return;
        
        const msg = message as GenericMessageEvent;
        const text = context.matches[1].trim();
        const operation = context.matches[2];
        const team = context.teamId || 'default';

        let index: string;
        let displayText: string;
        const user = await getUser(client, text);

        if (user) {
            index = user.id;
            displayText = user.profile?.real_name || user.real_name || text;
        } else {
            // Check if the text might be a raw user ID (starts with U or W followed by alphanumerics)
            const userIdMatch = text.match(/^([UW][A-Z0-9]+)$/);
            if (userIdMatch) {
                // Preserve case for potential user IDs
                index = text;
                displayText = text;
            } else {
                index = text.toLowerCase();
                displayText = text;
            }
        }

        // Ignore long entries
        if (index.length > 34) return;
        // Check for self-karma
        if (user && await isNarcissism(msg.user, index)) {
            await say({
                text: `Nice try <@${msg.user}>, but no...`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
            return;
        }

        try {
            const karma = await loadKarma(team);
            karma.data[index] = karma.data[index] || 0;

            // Update karma
            if (operation.includes('+')) {
                karma.data[index] += 1;
            } else if (operation.includes('-')) {
                karma.data[index] -= 1;
            }

            await saveKarma(team, karma);
            await say({
                text: `${displayText} has karma of ${karma.data[index]}`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
        } catch (err) {
            console.error('Failed to update karma:', err);
            await say({
                text: `Failed to update karma for ${displayText}`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
        }
    });

    // Get karma
    const karmaQueryRegex = /^karma\s*@?(.+)/;

    // Handle direct messages for karma queries
    app.message(karmaQueryRegex, async ({ message, context, client, say }) => {
        if (!context.matches) return;
        
        const msg = message as GenericMessageEvent;
        let query = context.matches[1].trim();
        const team = context.teamId || 'default';

        // Remove trailing question mark
        if (query.endsWith('?')) {
            query = query.slice(0, -1);
        }

        let index: string;
        let displayText: string;
        const user = await getUser(client, query);

        if (user) {
            index = user.id;
            displayText = user.profile?.real_name || user.real_name || query;
        } else {
            // Check if the text might be a raw user ID (starts with U or W followed by alphanumerics)
            const userIdMatch = query.match(/^([UW][A-Z0-9]+)$/);
            if (userIdMatch) {
                // Preserve case for potential user IDs for both index and display
                index = query;
                displayText = query;
            } else {
                index = query.toLowerCase();
                displayText = query;
            }
        }

        try {
            const karma = await loadKarma(team);
            const karmaValue = karma.data[index] || 0;

            await say({
                text: `${displayText} has karma ${karmaValue}`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
        } catch (err) {
            console.error('Failed to get karma:', err);
            await say({
                text: `Failed to get karma for ${displayText}`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
        }
    });

    // Handle app mentions for karma queries
    app.event('app_mention', async ({ event, client, say, context }) => {
        const mention = event as AppMentionEvent;
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        const matches = text.match(karmaQueryRegex);
        
        if (matches) {
            let query = matches[1].trim();
            const team = context.teamId || 'default';

            if (query.endsWith('?')) {
                query = query.slice(0, -1);
            }

            let index: string;
            let displayText: string;
            const user = await getUser(client, query);

            if (user) {
                index = user.id;
                displayText = user.profile?.real_name || user.real_name || query;
            } else {
                // Check if the text might be a raw user ID (starts with U or W followed by alphanumerics)
                const userIdMatch = query.match(/^([UW][A-Z0-9]+)$/);
                if (userIdMatch) {
                    // Preserve case for potential user IDs for both index and display
                    index = query;
                    displayText = query;
                } else {
                    index = query.toLowerCase();
                    displayText = query;
                }
            }

            try {
                const karma = await loadKarma(team);
                const karmaValue = karma.data[index] || 0;

                await say({
                    text: `${displayText} has karma ${karmaValue}`,
                    ...(mention.thread_ts && { thread_ts: mention.thread_ts })
                });
            } catch (err) {
                console.error('Failed to get karma:', err);
                await say({
                    text: `Failed to get karma for ${displayText}`,
                    ...(mention.thread_ts && { thread_ts: mention.thread_ts })
                });
            }
        }
    });
};

export default karmaPlugin; 