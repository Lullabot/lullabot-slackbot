import { App } from '@slack/bolt';
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import { BlockAction, ButtonAction } from '@slack/bolt';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin, Storage } from '../types';
import patternRegistry from '../services/pattern-registry';

interface Fact {
    key: string;
    be: string;
    reply: boolean;
    value: string[];
    previewLinks?: boolean; // Optional field - undefined/true for showing previews, false to suppress
}

interface FactoidStorage extends Storage {
    data: {
        [key: string]: Fact;
    };
}

// Keep track of pending forget requests
interface ForgetRequest {
    key: string;
    team: string;
    channel: string;
    thread_ts?: string;
    timestamp: number;
}

// Map of user ID to their pending forget request
const pendingForgetRequests: Map<string, ForgetRequest> = new Map();

// Cleanup old requests every 10 minutes (600000 ms)
setInterval(() => {
    const now = Date.now();
    for (const [userId, request] of pendingForgetRequests.entries()) {
        // Remove requests older than 5 minutes
        if (now - request.timestamp > 300000) {
            pendingForgetRequests.delete(userId);
        }
    }
}, 600000);

// Storage helper functions
const storageDir = path.join(__dirname, '..', '..', 'data', 'teams');
const getStoragePath = (team: string): string => path.join(storageDir, `${team}_factoids.json`);

async function loadFacts(team: string): Promise<FactoidStorage> {
    try {
        await fs.promises.mkdir(storageDir, { recursive: true });
        const data = await fs.promises.readFile(getStoragePath(team), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { id: `${team}_factoids`, data: {} };
    }
}

async function saveFacts(team: string, factoids: FactoidStorage): Promise<void> {
    await fs.promises.mkdir(storageDir, { recursive: true });
    await fs.promises.writeFile(getStoragePath(team), JSON.stringify(factoids, null, 2));
}

interface SlackUser {
    id: string;
    profile?: {
        real_name?: string;
    };
    real_name?: string;
}

// Helper function to get user info
async function getUser(client: any, text: string): Promise<SlackUser | null> {
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

function factString(fact: Fact): string {
    let result = '';
    fact.value.forEach(value => {
        if (!result) {
            if (fact.reply) {
                result += value;
            } else {
                result += `${fact.key} ${fact.be} ${value}`;
            }
        } else {
            result += ` and also ${value}`;
        }
    });
    return result;
}

// HTML entity decoder
function decodeHtmlEntities(text: string): string {
    return text.replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");
}

// Replace the isReservedCommand function with this simplified version
function isReservedCommand(text: string): boolean {
    // Check if the text matches any registered pattern from other plugins
    const isReserved = patternRegistry.matchesAnyPattern(text);
    
    if (isReserved) {
        console.log(`Skipping factoid creation for command that matches another plugin: "${text}"`);
    }
    
    return isReserved;
}

const factoidsPlugin: Plugin = async (app: App): Promise<void> => {
    // Register factoid patterns with the registry
    patternRegistry.registerPattern(/^!factoid:\s*list$/i, 'factoids', 1);
    patternRegistry.registerPattern(/^forget\s+(.+)$/i, 'factoids', 1);
    patternRegistry.registerPattern(/^(YES|NO)$/i, 'factoids', 0.5); // Lower priority for YES/NO
    
    // Two separate patterns for factoids - both lower priority than other commands
    patternRegistry.registerPattern(/^.+[!?]$/, 'factoids', 0.25); // Any text ending with ? or !
    
    // Also register patterns that can be handled in direct mentions (app_mention events)
    patternRegistry.registerPattern(/^.+[!?]$/, 'factoids:app_mention', 0.25);

    // Add new list command
    app.message(/^!factoid:\s*list$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const team = context.teamId || 'default';
        
        try {
            const factoids = await loadFacts(team);
            const keys = Object.keys(factoids.data);
            
            if (keys.length === 0) {
                await say({
                    text: "No factoids stored yet.",
                    thread_ts: msg.thread_ts || msg.ts // Always reply in a thread
                });
                return;
            }

            // Modified to include preview indicators
            const sortedKeys = keys.sort().map(key => {
                const fact = factoids.data[key];
                // Add eye emoji only for factoids that will display previews
                const previewIndicator = fact.previewLinks !== false ? " 👁️" : "";
                return fact.key + previewIndicator;
            });

            await say({
                text: `Available factoids: ${sortedKeys.join(', ')}`,
                thread_ts: msg.thread_ts || msg.ts // Always reply in a thread
            });
        } catch (error) {
            console.error('Error listing factoids:', error);
            await say({
                text: "Sorry, there was an error listing the factoids.",
                thread_ts: msg.thread_ts || msg.ts // Always reply in a thread
            });
        }
    });

    // Query a factoid - triggered by a pattern followed by ? or !
    app.message(/^((?:<@[UW][A-Z0-9]+>)|(?:@[a-zA-Z0-9._-]+)|(?:[a-zA-Z0-9._-]+(?:\s+[a-zA-Z0-9._-]+)*))[!?]$/i, async ({ message, context, client, say }) => {
        const msg = message as GenericMessageEvent;
        const text = msg.text || '';

        // Keep the word count check active as a safeguard
        const wordCount = text.slice(0, -1).trim().split(/\s+/).length;
        if (wordCount > 5) { // Adjust this threshold based on expected factoid length
            return; // Skip if too many words
        }

        // 4. Extract the factoid name (everything except the trailing ? or !)
        const rawQuery = text.slice(0, -1).trim();
        
        // Handle quotes in the query by optionally removing them
        const cleanQuery = rawQuery.replace(/^"(.+)"$/, '$1').trim();
        const index = cleanQuery.toLowerCase();
        const team = context.teamId || 'default';
        
        const factoids = await loadFacts(team);
        
        // First check if the query contains a user mention
        const userMentionMatch = cleanQuery.match(/<@([UW][A-Z0-9]+)>/);
        let fact = null;
        
        if (userMentionMatch) {
            // If query has a user mention like "<@U12345>", look up by that user ID
            const userId = userMentionMatch[1];
            fact = factoids.data[userId] || null;
            
            // If no fact found by user ID, try with the full mention format
            if (!fact) {
                fact = factoids.data[`<@${userId}>`] || null;
            }
        } else {
            // Try to resolve as a user if there's no direct mention
            const user = await getUser(client, cleanQuery);
            
            if (user) {
                // Try the user ID first
                fact = factoids.data[user.id] || null;
                
                // If no fact found, try with the full mention format
                if (!fact) {
                    fact = factoids.data[`<@${user.id}>`] || null;
                }
            } else {
                // Fall back to standard text lookup
                fact = factoids.data[index] || null;
            }
        }

        if (fact) {
            await say({
                text: factString(fact),
                unfurl_links: fact.previewLinks !== false, // True if undefined or true
                unfurl_media: fact.previewLinks !== false, // True if undefined or true
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
        }
    });

    // Handle YES/NO responses to forget confirmation
    app.message(/^(YES|NO)$/i, async ({ message, say }) => {
        const msg = message as GenericMessageEvent;
        const userId = msg.user;
        const pendingRequest = pendingForgetRequests.get(userId);
        
        // If there's no pending request for this user, ignore
        if (!pendingRequest) return;
        
        // Remove the pending request
        pendingForgetRequests.delete(userId);
        
        // If NO, cancel the forget operation
        if (msg.text?.toUpperCase() === 'NO') {
            await say({
                text: `Okay, I'll keep the factoid for "${pendingRequest.key}".`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
            return;
        }
        
        // If YES, proceed with forgetting
        try {
            const factoids = await loadFacts(pendingRequest.team);
            // Since ForgetRequest.key is defined as a string (not optional), we can use it directly
            if (factoids.data[pendingRequest.key]) {
                delete factoids.data[pendingRequest.key];
                await saveFacts(pendingRequest.team, factoids);
                await say({
                    text: `Okay, I have forgotten about "${pendingRequest.key}"`,
                    ...(msg.thread_ts && { thread_ts: msg.thread_ts })
                });
            } else {
                await say({
                    text: `I don't know anything about "${pendingRequest.key}"`,
                    ...(msg.thread_ts && { thread_ts: msg.thread_ts })
                });
            }
        } catch (err) {
            console.error('Error forgetting factoid:', err);
            await say({
                text: `There was a problem forgetting the factoid: ${err}`,
                ...(msg.thread_ts && { thread_ts: msg.thread_ts })
            });
        }
    });

    // Set factoid - only through direct mentions
    app.event('app_mention', async ({ event, client, say, context }) => {
        const mention = event as AppMentionEvent;
        // Remove the bot mention, decode HTML entities, and trim
        const text = decodeHtmlEntities(mention.text.replace(/<@[^>]+>\s*/, '').trim());

        // Handle query factoid pattern first (patterns followed by ? or !)
        // Check if it's ending with ? or !
        if (text.endsWith('?') || text.endsWith('!')) {
            // Filter out patterns that should not trigger factoids:
            // 0. Check if there's any text before a potential factoid (exclude these)
            const hasLeadingText = /^.+\s+(?:<@[UW][A-Z0-9]+>|@[\w\s]+|[^@])[!?]$/i;
            if (hasLeadingText.test(text)) {
                return; // Skip if there's text before the factoid
            }
            
            // 1. First check if it's a user mention with additional text (exclude these)
            // - This handles both @userID and Hey @username patterns
            const userMentionWithTextPattern = /^(?:Hey\s+)?(?:<@[UW][A-Z0-9]+>|@\w+)(?:\s+.+|\s*,.+)[!?]$/i;
            if (userMentionWithTextPattern.test(text)) {
                return; // Skip user mentions with extra text
            }
            
            // 2. Check if it's a regular factoid with a space before the punctuation (exclude these)
            const spaceBeforePunctuationPattern = /\s[!?]$/;
            if (spaceBeforePunctuationPattern.test(text)) {
                return; // Skip if there's a space before ? or !
            }
            
            // 3. Extract the factoid name (everything except the trailing ? or !)
            const rawQuery = text.slice(0, -1).trim();
            
            // Handle quotes in the query by optionally removing them
            const cleanQuery = rawQuery.replace(/^"(.+)"$/, '$1').trim();
            const index = cleanQuery.toLowerCase();
            const team = context.teamId || 'default';
            
            const factoids = await loadFacts(team);
            
            // First check if the query contains a user mention
            const userMentionMatch = cleanQuery.match(/<@([UW][A-Z0-9]+)>/);
            let fact = null;
            
            if (userMentionMatch) {
                // If query has a user mention like "<@U12345>", look up by that user ID
                const userId = userMentionMatch[1];
                fact = factoids.data[userId] || null;
                
                // If no fact found by user ID, try with the full mention format
                if (!fact) {
                    fact = factoids.data[`<@${userId}>`] || null;
                }
            } else {
                // Try to resolve as a user if there's no direct mention
                const user = await getUser(client, cleanQuery);
                
                if (user) {
                    // Try the user ID first
                    fact = factoids.data[user.id] || null;
                    
                    // If no fact found, try with the full mention format
                    if (!fact) {
                        fact = factoids.data[`<@${user.id}>`] || null;
                    }
                } else {
                    // Fall back to standard text lookup
                    fact = factoids.data[index] || null;
                }
            }

            if (fact) {
                await say({
                    text: factString(fact),
                    unfurl_links: fact.previewLinks !== false, // True if undefined or true
                    unfurl_media: fact.previewLinks !== false, // True if undefined or true
                    thread_ts: mention.thread_ts || mention.ts
                });
                return;
            }
        }

        // Handle YES/NO responses to forget confirmation in mentions
        if (/^(YES|NO)$/i.test(text)) {
            // Make sure the user ID is a string
            const userId = mention.user || '';
            const pendingRequest = pendingForgetRequests.get(userId);
            
            // If there's no pending request for this user, ignore
            if (!pendingRequest) return;
            
            // Remove the pending request
            pendingForgetRequests.delete(userId);
            
            // If NO, cancel the forget operation
            if (text.toUpperCase() === 'NO') {
                await say({
                    text: `Okay, I'll keep the factoid for "${pendingRequest.key}".`,
                    thread_ts: mention.thread_ts || mention.ts
                });
                return;
            }
            
            // If YES, proceed with forgetting
            try {
                const factoids = await loadFacts(pendingRequest.team);
                // Since ForgetRequest.key is defined as a string (not optional), we can use it directly
                if (factoids.data[pendingRequest.key]) {
                    delete factoids.data[pendingRequest.key];
                    await saveFacts(pendingRequest.team, factoids);
                    await say({
                        text: `Okay, I have forgotten about "${pendingRequest.key}"`,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                } else {
                    await say({
                        text: `I don't know anything about "${pendingRequest.key}"`,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                }
            } catch (err) {
                console.error('Error forgetting factoid:', err);
                await say({
                    text: `There was a problem forgetting the factoid: ${err}`,
                    thread_ts: mention.thread_ts || mention.ts
                });
            }
            return;
        }

        // Handle forget command
        const forgetMatch = text.match(/^forget\s+(.+)$/i);
        if (forgetMatch) {
            const team = context.teamId || 'default';
            // Don't convert to lowercase immediately - keep original case for potential user IDs
            const rawKey = forgetMatch[1]?.trim();
            
            if (!rawKey) return;

            try {
                const factoids = await loadFacts(team);
                
                // Check if we're trying to forget a user factoid first
                let foundKey = null;
                let lowerKey = rawKey.toLowerCase();
                
                // First check exact match (preserves case for user IDs)
                if (factoids.data[rawKey]) {
                    foundKey = rawKey;
                }
                // Then check lowercase version (for regular factoids)
                else if (factoids.data[lowerKey]) {
                    foundKey = lowerKey;
                }
                else {
                    // Try to extract a user ID if it appears to be a user mention
                    const userMentionMatch = rawKey.match(/<@([UW][A-Z0-9]+)>/);
                    if (userMentionMatch) {
                        // If it's a user mention format like "<@U12345>", extract the ID
                        const userId = userMentionMatch[1];
                        // Check if we have a factoid for just this user ID
                        if (factoids.data[userId]) {
                            foundKey = userId;
                        }
                    } else {
                        // If it's potentially just a raw user ID (U followed by alphanumerics)
                        const userIdMatch = rawKey.match(/^([UW][A-Z0-9]+)$/);
                        if (userIdMatch) {
                            const userId = userIdMatch[1];
                            // Check if we have a factoid for this user ID
                            if (factoids.data[userId]) {
                                foundKey = userId;
                            }
                        } else {
                            // Try to resolve as a user if there's no direct ID or mention
                            const user = await getUser(client, rawKey);
                            if (user && factoids.data[user.id]) {
                                foundKey = user.id;
                            }
                        }
                    }
                }
                
                if (foundKey && factoids.data[foundKey]) {
                    // Create a pending forget request
                    if (mention.user) {
                        pendingForgetRequests.set(mention.user, {
                            key: foundKey, // Store the actual storage key
                            team,
                            channel: mention.channel,
                            thread_ts: mention.thread_ts || mention.ts,
                            timestamp: Date.now()
                        });
                    }
                    
                    // Show the factoid we're about to forget for confirmation
                    const factToForget = factoids.data[foundKey];
                    await say({
                        text: `Are you sure you want me to forget the factoid "${factToForget.key}" which is: "${factString(factToForget)}"? Say YES, or NO`,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                } else {
                    await say({
                        text: `I don't know anything about "${rawKey}"`,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                }
            } catch (err) {
                console.error('Error checking factoid:', err);
                await say({
                    text: `There was a problem checking the factoid: ${err}`,
                    thread_ts: mention.thread_ts || mention.ts
                });
            }
            return;
        }
        
        // Match "X is Y" pattern
        const setMatches = text.match(/^(.+?)\s+(is|are)\s+(.+)$/i);
        if (setMatches) {
            const team = context.teamId || 'default';
            const key = setMatches[1]?.trim();
            
            if (!key) return;
            
            // Skip if the key is a reserved command
            if (isReservedCommand(key)) return;

            // Check if the key contains a user mention
            const userMentionMatch = key.match(/<@([UW][A-Z0-9]+)>/);
            let storeKey = key.toLowerCase();
            let displayKey = key;
            let userId = null;

            if (userMentionMatch) {
                // If the key directly contains a user mention, use the user ID as the storage key
                userId = userMentionMatch[1];
                storeKey = userId;
                displayKey = key; // Preserve the original mention format for display
            } else {
                // Try to resolve as a user if there's no direct mention
                const user = await getUser(client, key);
                if (user) {
                    userId = user.id;
                    storeKey = userId;
                    displayKey = `<@${userId}>`;
                }
            }

            let value = setMatches[3]?.trim() || '';
            const hasReply = value.startsWith('<reply>');
            
            // If it's a reply, remove the <reply> tag from the value
            if (hasReply) {
                value = value.replace(/^<reply>\s*/, '').trim();
            }
            
            // Check for pipe separator followed by preview settings
            let previewLinks = true; // Default to showing previews
            const pipeIndex = value.lastIndexOf('|');
            
            if (pipeIndex !== -1) {
                const previewSetting = value.substring(pipeIndex + 1).trim().toLowerCase();
                if (previewSetting === 'nopreview') {
                    previewLinks = false;
                } else if (previewSetting === 'preview') {
                    previewLinks = true;
                }
                
                // Remove the pipe and preview setting from the value
                value = value.substring(0, pipeIndex).trim();
            }

            const fact: Fact = {
                key: displayKey,
                be: setMatches[2]?.trim() || 'is',
                reply: hasReply,
                value: [value],
                previewLinks: previewLinks
            };

            const factoids = await loadFacts(team);
            const existing = factoids.data[storeKey];

            if (!existing) {
                try {
                    factoids.data[storeKey] = fact;
                    await saveFacts(team, factoids);
                    await say({ 
                        text: 'Got it!',
                        thread_ts: mention.thread_ts || mention.ts
                    });
                } catch (err) {
                    console.error('Error saving factoid:', err);
                    await say({ 
                        text: `There was a problem saving the factoid: ${err}`,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                }
            } else {
                // Create a unique action_id for this update
                const actionId = `factoid_update_${Date.now()}`;
                
                // Start a thread for confirmation with buttons
                await say({
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `I already have a factoid for "${existing.key}". It says:\n"${factString(existing)}"`
                            }
                        },
                        {
                            type: "actions",
                            block_id: "factoid_actions",
                            elements: [
                                {
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "Update",
                                        emoji: true
                                    },
                                    value: "update",
                                    action_id: `${actionId}_update`
                                },
                                {
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "Append",
                                        emoji: true
                                    },
                                    value: "append",
                                    action_id: `${actionId}_append`
                                },
                                {
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "Cancel",
                                        emoji: true
                                    },
                                    value: "cancel",
                                    style: "danger",
                                    action_id: `${actionId}_cancel`
                                }
                            ]
                        }
                    ],
                    text: `I already have a factoid for "${existing.key}". What would you like to do?`,
                    thread_ts: mention.thread_ts || mention.ts
                });

                // Handle button actions
                app.action(new RegExp(`${actionId}_(update|append|cancel)`), async ({ action, ack, respond }) => {
                    await ack();
                    
                    const buttonAction = (action as ButtonAction) as unknown as { value: string };
                    const choice = buttonAction.value;

                    try {
                        if (choice === 'update') {
                            factoids.data[storeKey] = fact;
                            await saveFacts(team, factoids);
                            await respond({
                                text: `✅ Updated! New factoid is:\n"${factString(fact)}"`,
                                replace_original: true
                            });
                        } else if (choice === 'append') {
                            // Preserve existing previewLinks setting when appending
                            const existingPreviewSetting = factoids.data[storeKey].previewLinks;
                            factoids.data[storeKey].value = factoids.data[storeKey].value.concat(fact.value);
                            // Use the new previewLinks setting if explicitly set, otherwise keep the existing one
                            if (fact.hasOwnProperty('previewLinks')) {
                                factoids.data[storeKey].previewLinks = fact.previewLinks;
                            }
                            await saveFacts(team, factoids);
                            await respond({
                                text: `✅ Appended! New factoid is:\n"${factString(factoids.data[storeKey])}"`,
                                replace_original: true
                            });
                        } else if (choice === 'cancel') {
                            await respond({
                                text: 'Operation cancelled.',
                                replace_original: true
                            });
                        }
                    } catch (err) {
                        console.error('Error handling button action:', err);
                        await respond({
                            text: 'There was a problem handling the button action.',
                            replace_original: true
                        });
                    }
                });
            }
        }
    });
};

export default factoidsPlugin;