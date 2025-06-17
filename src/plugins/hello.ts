import { App } from '@slack/bolt';
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import { Plugin } from '../types';
import patternRegistry from '../services/pattern-registry';

const helloPlugin: Plugin = async (app: App): Promise<void> => {
    // Define patterns for greetings
    const patterns = [
        '^hello\\!?$', 
        '^hey\\!?$', 
        '^hi\\!?$', 
        '^:wave:$',
        '^good morning\\!?$',
        '^g\'morning\\!?$',
        '^morning\\!?$',
        '^gm\\!?$'
    ];
    const greetingRegex = new RegExp(`(${patterns.join('|')})`, 'i');
    
    // Register greeting patterns with the registry
    patternRegistry.registerPattern(greetingRegex, 'hello', 10);

    // Helper function to get user info
    async function getUser(client: any, userId: string) {
        try {
            const result = await client.users.info({ user: userId });
            return result.user;
        } catch (err) {
            console.error('Error fetching user:', err);
            return { id: userId };
        }
    }

    // Handle direct messages with greetings
    app.message(greetingRegex, async ({ message, client, say }) => {
        const msg = message as GenericMessageEvent;
        try {
            // Try to add reaction first
            await client.reactions.add({
                timestamp: msg.ts,
                channel: msg.channel,
                name: 'wave'
            });
        } catch (err) {
            // If reaction fails, send a message instead
            console.error('Failed to add emoji reaction:', err);
            const user = await getUser(client, msg.user);
            await say({
                text: `Hello <@${user.id}>!!`,
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });

    // Handle app mentions with greetings
    app.event('app_mention', async ({ event, client, say }) => {
        const mention = event as AppMentionEvent;
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        if (greetingRegex.test(text)) {
            try {
                await client.reactions.add({
                    timestamp: mention.ts,
                    channel: mention.channel,
                    name: 'wave'
                });
            } catch (err) {
                console.error('Failed to add emoji reaction:', err);
                const user = await getUser(client, mention.user || mention.ts);
                await say({
                    text: `Hello <@${user.id}>!!`,
                    thread_ts: mention.thread_ts || mention.ts
                });
            }
        }
    });
};

export default helloPlugin; 