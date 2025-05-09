import { App } from '@slack/bolt';
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import { BlockAction, ButtonAction, OverflowAction } from '@slack/bolt';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin, Storage } from '../types';
import patternRegistry from '../services/pattern-registry';
import crypto from 'crypto';

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

// Add a new Map to track pending cleanup requests
const pendingCleanupRequests = new Map<string, {
    keys: string[];
    team: string;
    channel: string;
    thread_ts?: string;
    timestamp: number;
}>();

// Add a new Map to track pending restore requests
const pendingRestoreRequests = new Map<string, {
    backupFile: string;
    team: string;
    channel: string;
    thread_ts?: string;
    timestamp: number;
}>();

// In-memory mapping for hash-to-key per user and page
const factoidHashMaps: Map<string, Record<string, string>> = new Map();
// In-memory mapping for list message channel/ts per user
interface ListMessageRef { channel: string, ts: string }
const factoidListRefs: Map<string, ListMessageRef> = new Map();

// Utility to unescape HTML entities (ensure <reply> is always literal)
function unescapeReply(text: string): string {
    return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Utility to check and normalize reply factoids
function normalizeReplyFactoid(values: string[]): { values: string[], reply: boolean } {
    let reply = false;
    const normalized = values.map(v => {
        let val = unescapeReply(v.trim());
        if (val.toLowerCase().startsWith('<reply>')) {
            reply = true;
            val = val.replace(/^<reply>\s*/i, '');
        }
        return val;
    });
    // If any value was a reply, ensure all <reply> tags are stripped
    return {
        values: normalized.map(val => val.replace(/^<reply>\s*/i, '').replace(/^&lt;reply&gt;\s*/i, '')),
        reply
    };
}

const factoidsPlugin: Plugin = async (app: App): Promise<void> => {
    // Register factoid patterns with the registry
    patternRegistry.registerPattern(/^!factoid:\s*list$/i, 'factoids', 1);
    patternRegistry.registerPattern(/^forget\s+(.+)$/i, 'factoids', 1);
    patternRegistry.registerPattern(/^(YES|NO)$/i, 'factoids', 0.5); // Lower priority for YES/NO
    patternRegistry.registerPattern(/^([^?!]+)[!?]$/, 'factoids', 1); // Updated to allow spaces in factoid names
    patternRegistry.registerPattern(/^!factoid:\s*cleanup$/i, 'factoids', 1); // Add new cleanup command
    patternRegistry.registerPattern(/^!factoid:\s*backup$/i, 'factoids', 1); // Add new backup command
    patternRegistry.registerPattern(/^!factoid:\s*restore\s+(.+)$/i, 'factoids', 1); // Add new restore command
    patternRegistry.registerPattern(/^!factoid:\s*backups$/i, 'factoids', 1); // Add command to list backups
    // Two separate patterns for factoids - both lower priority than other commands
    patternRegistry.registerPattern(/^.+[!?]$/, 'factoids', 0.25); // Any text ending with ? or !
    
    // Also register patterns that can be handled in direct mentions (app_mention events)
    patternRegistry.registerPattern(/^.+[!?]$/, 'factoids:app_mention', 0.25);

    // Add new list command
    app.message(/^!factoid:\s*list$/i, async ({ message, say, context, client, body }) => {
        const msg = message as GenericMessageEvent;
        const team = context.teamId || 'default';
        try {
            const factoids = await loadFacts(team);
            const keys = Object.keys(factoids.data).sort();
            if (keys.length === 0) {
                await say({
                    text: 'No factoids stored yet.',
                    thread_ts: msg.thread_ts || msg.ts
                });
                return;
            }
            const isDM = msg.channel_type === 'im';
            if (!isDM) {
                // Channel: ephemeral redirect
                await client.chat.postEphemeral({
                    channel: msg.channel,
                    user: msg.user,
                    text: 'To manage all factoids, DM me with `!factoid: list` for an interactive interface.',
                });
                return;
            }
            // DM: Paginated Block Kit UI (25 per page)
            const pageSize = 25;
            const page = 0;
            const totalPages = Math.ceil(keys.length / pageSize);
            const pageKeys = keys.slice(page * pageSize, (page + 1) * pageSize);
            const blocks = [];
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: `*Factoids* (Page ${page + 1} of ${totalPages})` }
            });
            // Build hash-to-key mapping for this page
            const hashToKey: Record<string, string> = {};
            for (const key of pageKeys) {
                const fact = factoids.data[key];
                const preview = fact.value[0]?.slice(0, 60) + (fact.value[0]?.length > 60 ? '…' : '');
                const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
                hashToKey[hash] = key;
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `*${fact.key}*: ${preview}` },
                    accessory: {
                        type: 'overflow',
                        options: [
                            { text: { type: 'plain_text', text: 'Edit' }, value: `edit__${hash}__${page}` },
                            { text: { type: 'plain_text', text: 'Delete' }, value: `delete__${hash}__${page}` },
                        ],
                        action_id: 'factoid_row_action',
                    },
                });
            }
            // Store mapping in memory for this user and page
            if (msg.user) {
                factoidHashMaps.set(`${msg.user}:${page}`, hashToKey);
            }
            // Pagination controls
            const elements = [];
            if (page > 0) {
                elements.push({
                    type: 'button',
                    text: { type: 'plain_text', text: 'Previous' },
                    value: `prev__${page - 1}`,
                    action_id: 'factoid_page_prev',
                });
            }
            if (page < totalPages - 1) {
                elements.push({
                    type: 'button',
                    text: { type: 'plain_text', text: 'Next' },
                    value: `next__${page + 1}`,
                    action_id: 'factoid_page_next',
                });
            }
            if (elements.length > 0) {
                blocks.push({
                    type: 'actions',
                    elements,
                });
            }
            // Post the initial message and store channel/ts
            const result = await client.chat.postMessage({
                channel: msg.user,
                blocks,
                text: 'Factoid list (interactive)'
            });
            // Store the channel and ts in memory for this user (for this session)
            if (result.ts && result.channel) {
                factoidListRefs.set(msg.user, { channel: result.channel, ts: result.ts });
            }
        } catch (error) {
            console.error('Error listing factoids:', error);
            await say({
                text: 'Sorry, there was an error listing the factoids.',
                thread_ts: msg.thread_ts || msg.ts
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
            if (fact.reply) {
                await say({
                    text: fact.value[0],
                    unfurl_links: fact.previewLinks !== false,
                    unfurl_media: fact.previewLinks !== false,
                    ...(msg.thread_ts && { thread_ts: msg.thread_ts })
                });
            } else {
                await say({
                    text: factString(fact),
                    unfurl_links: fact.previewLinks !== false,
                    unfurl_media: fact.previewLinks !== false,
                    ...(msg.thread_ts && { thread_ts: msg.thread_ts })
                });
            }
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
                if (fact.reply) {
                    await say({
                        text: fact.value[0],
                        unfurl_links: fact.previewLinks !== false,
                        unfurl_media: fact.previewLinks !== false,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                } else {
                    await say({
                        text: factString(fact),
                        unfurl_links: fact.previewLinks !== false,
                        unfurl_media: fact.previewLinks !== false,
                        thread_ts: mention.thread_ts || mention.ts
                    });
                }
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
            // Normalize reply factoid
            const { values: normValues, reply: hasReply } = normalizeReplyFactoid([value]);
            value = normValues[0];
            
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

    // Add bulk cleanup command for factoids that don't match regex patterns
    app.message(/^!factoid:\s*cleanup$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const team = context.teamId || 'default';
        
        try {
            const factoids = await loadFacts(team);
            const keys = Object.keys(factoids.data);
            
            if (keys.length === 0) {
                await say({
                    text: "No factoids stored yet.",
                    thread_ts: msg.thread_ts || msg.ts
                });
                return;
            }

            // Find factoids that don't match valid patterns
            const invalidFactoids: string[] = [];
            
            for (const key in factoids.data) {
                const factoid = factoids.data[key];
                const factoidKey = factoid.key;
                
                // Skip user mentions which are stored differently
                if (factoidKey.startsWith('<@') || /^[UW][A-Z0-9]+$/.test(key)) {
                    continue;
                }
                
                // Check if the factoid doesn't conform to our patterns
                // Our main pattern allows alphanumeric and some special chars
                if (factoidKey.includes(',') || factoidKey.includes('"') || 
                    /^[!@#$%^&*()]/.test(factoidKey) || 
                    factoidKey.length > 100) {
                    invalidFactoids.push(key);
                }
            }
            
            if (invalidFactoids.length === 0) {
                await say({
                    text: "No invalid factoids found that need cleanup.",
                    thread_ts: msg.thread_ts || msg.ts
                });
                return;
            }
            
            // Ask for confirmation before removing
            await say({
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `I found ${invalidFactoids.length} factoids that don't match valid patterns. These will be removed:\n\`${invalidFactoids.join('`, `')}\``
                        }
                    },
                    {
                        type: "actions",
                        block_id: "cleanup_actions",
                        elements: [
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Confirm Cleanup",
                                    emoji: true
                                },
                                value: "confirm",
                                style: "danger",
                                action_id: `factoid_cleanup_confirm_${Date.now()}`
                            },
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Cancel",
                                    emoji: true
                                },
                                value: "cancel",
                                action_id: `factoid_cleanup_cancel_${Date.now()}`
                            }
                        ]
                    }
                ],
                text: `I found ${invalidFactoids.length} factoids that don't match valid patterns. Click 'Confirm Cleanup' to proceed or 'Cancel'.`,
                thread_ts: msg.thread_ts || msg.ts
            });
            
            // Store cleanup request in memory for confirmation
            pendingCleanupRequests.set(msg.user, {
                keys: invalidFactoids,
                team,
                channel: msg.channel,
                thread_ts: msg.thread_ts || msg.ts,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Error cleaning up factoids:', error);
            await say({
                text: "Sorry, there was an error while cleaning up factoids.",
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });
    
    // Handle cleanup button actions
    app.action(/factoid_cleanup_(confirm|cancel)_\d+/, async ({ action, ack, body, respond, client, context }) => {
        await ack();
        
        const choice = (action as ButtonAction).value;
        const userId = body.user.id;
        
        if (!pendingCleanupRequests.has(userId)) {
            await respond({
                text: "No pending cleanup request found or it has expired.",
                replace_original: false
            });
            return;
        }
        
        const request = pendingCleanupRequests.get(userId)!;
        const team = context.teamId || 'default';
        
        if (choice === 'cancel') {
            pendingCleanupRequests.delete(userId);
            await respond({
                text: "Cleanup cancelled.",
                replace_original: true
            });
            return;
        }
        
        try {
            // Load factoids
            const factoids = await loadFacts(team);
            
            // Create a backup before cleanup
            const backupDir = path.join(storageDir, 'backups');
            await fs.promises.mkdir(backupDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const backupFile = path.join(backupDir, `${team}_factoids_pre_cleanup_${timestamp}.json`);
            await fs.promises.writeFile(backupFile, JSON.stringify(factoids, null, 2));
            
            const keysToRemove = request.keys;
            let removedCount = 0;
            const removedFactoids: string[] = [];
            
            // Remove invalid factoids
            for (const key of keysToRemove) {
                if (factoids.data[key]) {
                    // Store the display key of the factoid being removed
                    removedFactoids.push(factoids.data[key].key);
                    delete factoids.data[key];
                    removedCount++;
                }
            }
            
            // Save updated factoids
            await saveFacts(team, factoids);
            
            // Format the list of removed factoids
            const removedList = removedFactoids.length > 0 
                ? `\nRemoved factoids: \`${removedFactoids.join('`, `')}\``
                : '';
            
            await respond({
                text: `✅ Created backup \`${path.basename(backupFile)}\` and successfully removed ${removedCount} invalid factoids.${removedList}`,
                replace_original: true
            });
            
            // Clear the pending request
            pendingCleanupRequests.delete(userId);
            
        } catch (error) {
            console.error('Error confirming cleanup:', error);
            await respond({
                text: "❌ Sorry, there was an error while confirming cleanup.",
                replace_original: false
            });
        }
    });

    // Add backup command
    app.message(/^!factoid:\s*backup$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const team = context.teamId || 'default';
        
        try {
            const factoids = await loadFacts(team);
            const backupDir = path.join(storageDir, 'backups');
            
            // Create backup directory if it doesn't exist
            await fs.promises.mkdir(backupDir, { recursive: true });
            
            // Create a backup file with timestamp
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const backupFile = path.join(backupDir, `${team}_factoids_${timestamp}.json`);
            
            // Write the backup
            await fs.promises.writeFile(backupFile, JSON.stringify(factoids, null, 2));
            
            await say({
                text: `✅ Backup created successfully: \`${path.basename(backupFile)}\``,
                thread_ts: msg.thread_ts || msg.ts
            });
        } catch (error) {
            console.error('Error creating factoids backup:', error);
            await say({
                text: `❌ Error creating backup: ${error}`,
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });
    
    // Add command to list available backups
    app.message(/^!factoid:\s*backups$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const team = context.teamId || 'default';
        
        try {
            const backupDir = path.join(storageDir, 'backups');
            
            // Create backup directory if it doesn't exist
            await fs.promises.mkdir(backupDir, { recursive: true });
            
            // List files in the backup directory
            const files = await fs.promises.readdir(backupDir);
            
            // Filter for this team's backups
            const teamBackups = files.filter(file => file.startsWith(`${team}_factoids_`) && file.endsWith('.json'));
            
            if (teamBackups.length === 0) {
                await say({
                    text: "No factoid backups found for this team.",
                    thread_ts: msg.thread_ts || msg.ts
                });
                return;
            }
            
            // Sort backups by date (newest first)
            teamBackups.sort().reverse();
            
            await say({
                text: `Available factoid backups:\n${teamBackups.map(file => `• \`${file}\``).join('\n')}\n\nTo restore from a backup, use: \`!factoid: restore FILENAME\``,
                thread_ts: msg.thread_ts || msg.ts
            });
        } catch (error) {
            console.error('Error listing factoid backups:', error);
            await say({
                text: `❌ Error listing backups: ${error}`,
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });
    
    // Add restore command
    app.message(/^!factoid:\s*restore\s+(.+)$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const team = context.teamId || 'default';
        const backupFile = context.matches?.[1]?.trim();
        
        if (!backupFile) {
            await say({
                text: "Please specify a backup file to restore. Use `!factoid: backups` to see available backups.",
                thread_ts: msg.thread_ts || msg.ts
            });
            return;
        }
        
        try {
            const backupDir = path.join(storageDir, 'backups');
            const backupPath = path.join(backupDir, backupFile);
            
            // Check if backup file exists
            try {
                await fs.promises.access(backupPath, fs.constants.F_OK);
            } catch (e) {
                await say({
                    text: `❌ Backup file \`${backupFile}\` not found. Use \`!factoid: backups\` to see available backups.`,
                    thread_ts: msg.thread_ts || msg.ts
                });
                return;
            }
            
            // Create a backup of current state before restore
            const currentFactoids = await loadFacts(team);
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const preRestoreBackup = path.join(backupDir, `${team}_factoids_pre_restore_${timestamp}.json`);
            await fs.promises.writeFile(preRestoreBackup, JSON.stringify(currentFactoids, null, 2));
            
            // Store the restore request for confirmation
            pendingRestoreRequests.set(msg.user, {
                backupFile: backupPath,
                team,
                channel: msg.channel,
                thread_ts: msg.thread_ts || msg.ts,
                timestamp: Date.now()
            });
            
            // Use buttons for confirmation
            await say({
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `⚠️ WARNING: You are about to restore factoids from backup \`${backupFile}\`.\n\nThis will replace ALL current factoids with the ones from the backup. A backup of your current factoids has been created automatically.`
                        }
                    },
                    {
                        type: "actions",
                        block_id: "restore_actions",
                        elements: [
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Confirm Restore",
                                    emoji: true
                                },
                                value: "confirm",
                                style: "danger",
                                action_id: `factoid_restore_confirm_${Date.now()}`
                            },
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Cancel",
                                    emoji: true
                                },
                                value: "cancel",
                                action_id: `factoid_restore_cancel_${Date.now()}`
                            }
                        ]
                    }
                ],
                text: `⚠️ WARNING: You are about to restore factoids from backup \`${backupFile}\`. Click 'Confirm Restore' to proceed or 'Cancel'.`,
                thread_ts: msg.thread_ts || msg.ts
            });
        } catch (error) {
            console.error('Error preparing restore:', error);
            await say({
                text: `❌ Error preparing restore: ${error}`,
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });
    
    // Handle restore button actions
    app.action(/factoid_restore_(confirm|cancel)_\d+/, async ({ action, ack, body, respond, context }) => {
        await ack();
        
        const choice = (action as ButtonAction).value;
        const userId = body.user.id;
        
        if (!pendingRestoreRequests.has(userId)) {
            await respond({
                text: "No pending restore request found or it has expired.",
                replace_original: false
            });
            return;
        }
        
        const request = pendingRestoreRequests.get(userId)!;
        const team = context.teamId || 'default';
        
        if (choice === 'cancel') {
            pendingRestoreRequests.delete(userId);
            await respond({
                text: "Restore cancelled.",
                replace_original: true
            });
            return;
        }
        
        try {
            // Read backup file
            const backupData = await fs.promises.readFile(request.backupFile, 'utf8');
            const backupFactoids = JSON.parse(backupData) as FactoidStorage;
            
            // Validate the backup data
            if (!backupFactoids.id || !backupFactoids.data) {
                await respond({
                    text: "❌ Invalid backup file format. Restore cancelled.",
                    replace_original: true
                });
                pendingRestoreRequests.delete(userId);
                return;
            }
            
            // Save the restored factoids
            await saveFacts(team, backupFactoids);
            
            await respond({
                text: `✅ Successfully restored factoids from backup \`${path.basename(request.backupFile)}\`.\n\nRestored ${Object.keys(backupFactoids.data).length} factoids.`,
                replace_original: true
            });
            
            // Clear the pending request
            pendingRestoreRequests.delete(userId);
        } catch (error) {
            console.error('Error restoring from backup:', error);
            await respond({
                text: `❌ Error restoring from backup: ${error}`,
                replace_original: false
            });
            pendingRestoreRequests.delete(userId);
        }
    });

    // Block Kit action handler stubs for interactive factoid list
    app.action('factoid_page_prev', async ({ ack, body, action, client, context }) => {
        await ack();
        const value = (action as ButtonAction).value;
        if (!value) return;
        const [, pageStr] = value.split('__');
        const page = parseInt(pageStr, 10);
        const userId = body.user.id;
        const team = context.teamId || 'default';
        await postFactoidListPage(client, userId, team, page);
    });
    app.action('factoid_page_next', async ({ ack, body, action, client, context }) => {
        await ack();
        const value = (action as ButtonAction).value;
        if (!value) return;
        const [, pageStr] = value.split('__');
        const page = parseInt(pageStr, 10);
        const userId = body.user.id;
        const team = context.teamId || 'default';
        await postFactoidListPage(client, userId, team, page);
    });
    app.action('factoid_row_action', async ({ ack, body, action, client, context }) => {
        await ack();
        const overflowAction = action as OverflowAction;
        if (!overflowAction.selected_option || typeof overflowAction.selected_option.value !== 'string') {
            return;
        }
        const value = overflowAction.selected_option.value;
        const [act, hash, pageStr] = value.split('__');
        const page = parseInt(pageStr, 10);
        const userId = body.user.id;
        const hashToKey = factoidHashMaps.get(`${userId}:${page}`);
        if (!hashToKey) return;
        const key = hashToKey[hash];
        const team = context.teamId || 'default';
        // Load factoid for this key
        const factoids = await loadFacts(team);
        const fact = factoids.data[key];
        if (!fact) return;
        if (act === 'delete') {
            // Open confirmation modal
            await client.views.open({
                trigger_id: (body as any).trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'factoid_delete_confirm',
                    private_metadata: JSON.stringify({ key, page }),
                    title: { type: 'plain_text', text: 'Delete Factoid' },
                    submit: { type: 'plain_text', text: 'Delete' },
                    close: { type: 'plain_text', text: 'Cancel' },
                    blocks: [
                        {
                            type: 'section',
                            text: { type: 'mrkdwn', text: `Are you sure you want to delete *${fact.key}*?\n\n_${fact.value.join('\n')}_` }
                        }
                    ]
                }
            });
        } else if (act === 'edit') {
            // Open edit modal, always unescape <reply>
            await client.views.open({
                trigger_id: (body as any).trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'factoid_edit_submit',
                    private_metadata: JSON.stringify({ key, page }),
                    title: { type: 'plain_text', text: 'Edit Factoid' },
                    submit: { type: 'plain_text', text: 'Save' },
                    close: { type: 'plain_text', text: 'Cancel' },
                    blocks: [
                        {
                            type: 'input',
                            block_id: 'factoid_value',
                            label: { type: 'plain_text', text: 'Value(s) (separate multiple with |)' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'value',
                                initial_value: fact.value.map(unescapeReply).join(' | '),
                                multiline: true
                            }
                        },
                        {
                            type: 'input',
                            block_id: 'factoid_preview',
                            label: { type: 'plain_text', text: 'Link Previews' },
                            element: {
                                type: 'static_select',
                                action_id: 'preview',
                                options: [
                                    { text: { type: 'plain_text', text: 'Enabled' }, value: 'preview' },
                                    { text: { type: 'plain_text', text: 'Disabled' }, value: 'nopreview' }
                                ],
                                initial_option: fact.previewLinks === false
                                    ? { text: { type: 'plain_text', text: 'Disabled' }, value: 'nopreview' }
                                    : { text: { type: 'plain_text', text: 'Enabled' }, value: 'preview' }
                            }
                        }
                    ]
                }
            });
        }
    });

    // Handle delete confirmation modal
    app.view('factoid_delete_confirm', async ({ ack, body, view, client, context }) => {
        await ack();
        const { key, page } = JSON.parse(view.private_metadata);
        const userId = body.user.id;
        const team = (body.team && body.team.id) ? body.team.id : (context.teamId || 'default');
        const factoids = await loadFacts(team);
        delete factoids.data[key];
        await saveFacts(team, factoids);
        // Remove from in-memory map
        const hashToKey = factoidHashMaps.get(`${userId}:${page}`);
        if (hashToKey) {
            for (const hash in hashToKey) {
                if (hashToKey[hash] === key) {
                    delete hashToKey[hash];
                }
            }
        }
        // Refresh list in DM
        await postFactoidListPage(client, userId, team, page);
    });

    // Handle edit modal submission
    app.view('factoid_edit_submit', async ({ ack, body, view, client, context }) => {
        await ack();
        const { key, page } = JSON.parse(view.private_metadata);
        const userId = body.user.id;
        const team = (body.team && body.team.id) ? body.team.id : (context.teamId || 'default');
        const values = view.state.values;
        const valueInput = values['factoid_value']?.['value']?.value;
        const previewInput = values['factoid_preview']?.['preview']?.selected_option?.value;
        if (typeof valueInput === 'string' && typeof previewInput === 'string') {
            // Always unescape and normalize before saving
            const splitValues = valueInput.split('|').map(v => unescapeReply(v.trim())).filter(Boolean);
            const { values: newValues, reply } = normalizeReplyFactoid(splitValues);
            const previewLinks = previewInput === 'preview';
            const factoids = await loadFacts(team);
            if (factoids.data[key]) {
                factoids.data[key].value = newValues;
                factoids.data[key].previewLinks = previewLinks;
                factoids.data[key].reply = reply;
                await saveFacts(team, factoids);
            }
        }
        // Refresh list in DM
        await postFactoidListPage(client, userId, team, page);
    });

    // Helper to post a factoid list page to a DM
    async function postFactoidListPage(client: any, userId: string, team: string, page: number) {
        const factoids = await loadFacts(team);
        const keys = Object.keys(factoids.data).sort();
        const pageSize = 25;
        const totalPages = Math.ceil(keys.length / pageSize);
        const pageNum = Math.max(0, Math.min(page, totalPages - 1));
        const pageKeys = keys.slice(pageNum * pageSize, (pageNum + 1) * pageSize);
        const blocks = [];
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Factoids* (Page ${pageNum + 1} of ${totalPages})` }
        });
        const hashToKey: Record<string, string> = {};
        for (const key of pageKeys) {
            const fact = factoids.data[key];
            const preview = fact.value[0]?.slice(0, 60) + (fact.value[0]?.length > 60 ? '…' : '');
            const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
            hashToKey[hash] = key;
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: `*${fact.key}*: ${preview}` },
                accessory: {
                    type: 'overflow',
                    options: [
                        { text: { type: 'plain_text', text: 'Edit' }, value: `edit__${hash}__${pageNum}` },
                        { text: { type: 'plain_text', text: 'Delete' }, value: `delete__${hash}__${pageNum}` },
                    ],
                    action_id: 'factoid_row_action',
                },
            });
        }
        // Store mapping in memory for this user and page
        factoidHashMaps.set(`${userId}:${pageNum}`, hashToKey);
        // Pagination controls
        const elements = [];
        if (pageNum > 0) {
            elements.push({
                type: 'button',
                text: { type: 'plain_text', text: 'Previous' },
                value: `prev__${pageNum - 1}`,
                action_id: 'factoid_page_prev',
            });
        }
        if (pageNum < totalPages - 1) {
            elements.push({
                type: 'button',
                text: { type: 'plain_text', text: 'Next' },
                value: `next__${pageNum + 1}`,
                action_id: 'factoid_page_next',
            });
        }
        if (elements.length > 0) {
            blocks.push({
                type: 'actions',
                elements,
            });
        }
        // Use chat.update if channel/ts is available, otherwise postMessage
        const ref = factoidListRefs.get(userId);
        if (ref && ref.channel && ref.ts) {
            await client.chat.update({
                channel: ref.channel,
                ts: ref.ts,
                blocks,
                text: 'Factoid list (interactive)'
            });
        } else {
            const result = await client.chat.postMessage({
                channel: userId,
                blocks,
                text: 'Factoid list (interactive)'
            });
            if (result.ts && result.channel) {
                factoidListRefs.set(userId, { channel: result.channel, ts: result.ts });
            }
        }
    }
};

export default factoidsPlugin;