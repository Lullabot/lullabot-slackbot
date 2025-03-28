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
    
    // Also register patterns that can be handled in direct mentions (app_mention events)
    patternRegistry.registerPattern(/^([^?!]+)[!?]$/, 'factoids:app_mention', 1); // Updated to allow spaces in direct mentions

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

            const sortedKeys = keys.sort().map(key => factoids.data[key].key);

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
    app.message(/^([^?!]+)[!?]$/, async ({ message, context, client, say }) => {
        if (!context?.matches?.[1]) return;

        const msg = message as GenericMessageEvent;
        const rawQuery = context.matches[1].trim();
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
        const queryMatch = text.match(/^([^?!]+)[!?]$/);
        if (queryMatch) {
            const rawQuery = queryMatch[1].trim();
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

            const fact: Fact = {
                key: displayKey,
                be: setMatches[2]?.trim() || 'is',
                reply: hasReply,
                value: [value]
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
                            factoids.data[storeKey].value = factoids.data[storeKey].value.concat(fact.value);
                            await saveFacts(team, factoids);
                            await respond({
                                text: `✅ Appended! Updated factoid is now:\n"${factString(factoids.data[storeKey])}"`,
                                replace_original: true
                            });
                        } else {
                            await respond({
                                text: '❌ Cancelled - keeping the existing factoid.',
                                replace_original: true
                            });
                        }
                    } catch (err) {
                        await respond({
                            text: `Error updating factoid: ${err}`,
                            replace_original: false
                        });
                    }
                });
            }
            return;
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
                text: `I found ${invalidFactoids.length} factoids that don't match valid patterns.\nThese will be removed: \`${invalidFactoids.join('`, `')}\`\n\nReply with "!factoid: confirm-cleanup" to proceed or "!factoid: cancel-cleanup" to cancel.`,
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
    
    // Handle cleanup confirmation
    app.message(/^!factoid:\s*confirm-cleanup$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const user = msg.user;
        
        if (!pendingCleanupRequests.has(user)) {
            await say({
                text: "No pending cleanup request found. Start with `!factoid: cleanup` first.",
                thread_ts: msg.thread_ts || msg.ts
            });
            return;
        }
        
        const request = pendingCleanupRequests.get(user)!;
        const team = context.teamId || 'default';
        
        try {
            // Load factoids
            const factoids = await loadFacts(team);
            const keysToRemove = request.keys;
            let removedCount = 0;
            
            // Remove invalid factoids
            for (const key of keysToRemove) {
                if (factoids.data[key]) {
                    delete factoids.data[key];
                    removedCount++;
                }
            }
            
            // Save updated factoids
            await saveFacts(team, factoids);
            
            await say({
                text: `Successfully removed ${removedCount} invalid factoids.`,
                thread_ts: msg.thread_ts || msg.ts
            });
            
            // Clear the pending request
            pendingCleanupRequests.delete(user);
            
        } catch (error) {
            console.error('Error confirming cleanup:', error);
            await say({
                text: "Sorry, there was an error while confirming cleanup.",
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });
    
    // Handle cleanup cancellation
    app.message(/^!factoid:\s*cancel-cleanup$/i, async ({ message, say }) => {
        const msg = message as GenericMessageEvent;
        const user = msg.user;
        
        if (pendingCleanupRequests.has(user)) {
            pendingCleanupRequests.delete(user);
            await say({
                text: "Cleanup cancelled.",
                thread_ts: msg.thread_ts || msg.ts
            });
        } else {
            await say({
                text: "No pending cleanup request found.",
                thread_ts: msg.thread_ts || msg.ts
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
            
            await say({
                text: `⚠️ WARNING: You are about to restore factoids from backup \`${backupFile}\`.\n\nThis will replace ALL current factoids with the ones from the backup. A backup of your current factoids has been created automatically.\n\nReply with \`!factoid: confirm-restore\` to proceed or \`!factoid: cancel-restore\` to cancel.`,
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
    
    // Handle restore confirmation
    app.message(/^!factoid:\s*confirm-restore$/i, async ({ message, say, context }) => {
        const msg = message as GenericMessageEvent;
        const user = msg.user;
        
        if (!pendingRestoreRequests.has(user)) {
            await say({
                text: "No pending restore request found. Start with `!factoid: restore FILENAME` first.",
                thread_ts: msg.thread_ts || msg.ts
            });
            return;
        }
        
        const request = pendingRestoreRequests.get(user)!;
        const team = context.teamId || 'default';
        
        try {
            // Read backup file
            const backupData = await fs.promises.readFile(request.backupFile, 'utf8');
            const backupFactoids = JSON.parse(backupData) as FactoidStorage;
            
            // Validate the backup data
            if (!backupFactoids.id || !backupFactoids.data) {
                await say({
                    text: "❌ Invalid backup file format. Restore cancelled.",
                    thread_ts: msg.thread_ts || msg.ts
                });
                pendingRestoreRequests.delete(user);
                return;
            }
            
            // Save the restored factoids
            await saveFacts(team, backupFactoids);
            
            await say({
                text: `✅ Successfully restored factoids from backup \`${path.basename(request.backupFile)}\`.\n\nRestored ${Object.keys(backupFactoids.data).length} factoids.`,
                thread_ts: msg.thread_ts || msg.ts
            });
            
            // Clear the pending request
            pendingRestoreRequests.delete(user);
        } catch (error) {
            console.error('Error restoring from backup:', error);
            await say({
                text: `❌ Error restoring from backup: ${error}`,
                thread_ts: msg.thread_ts || msg.ts
            });
            pendingRestoreRequests.delete(user);
        }
    });
    
    // Handle restore cancellation
    app.message(/^!factoid:\s*cancel-restore$/i, async ({ message, say }) => {
        const msg = message as GenericMessageEvent;
        const user = msg.user;
        
        if (pendingRestoreRequests.has(user)) {
            pendingRestoreRequests.delete(user);
            await say({
                text: "Restore cancelled.",
                thread_ts: msg.thread_ts || msg.ts
            });
        } else {
            await say({
                text: "No pending restore request found.",
                thread_ts: msg.thread_ts || msg.ts
            });
        }
    });
};

export default factoidsPlugin; 