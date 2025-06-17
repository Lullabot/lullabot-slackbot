import { App } from '@slack/bolt';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import { Plugin } from '../types';

const addPromptPlugin: Plugin = async (app: App): Promise<void> => {
    app.event('app_mention', async ({ event, say, client }) => {
        const mention = event as AppMentionEvent;
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        
        // Check if this is an add-prompt command
        const addPromptMatch = text.match(/^add-prompt\s+(.+)$/i);
        if (!addPromptMatch) {
            return; // Not an add-prompt command, let other plugins handle it
        }

        // Get the original message permalink from command text
        let messageUrl = addPromptMatch[1].trim();
        
        // Debug: log what we received (only in non-production environments)
        if (process.env.NODE_ENV !== 'production') {
            console.log('Debug - Raw text:', JSON.stringify(text));
            console.log('Debug - Extracted URL:', JSON.stringify(messageUrl));
            console.log('Debug - URL length:', messageUrl.length);
            console.log('Debug - URL char codes:', [...messageUrl].map(c => c.charCodeAt(0)).join(','));
        }
        
        // Clean up URL - remove Slack's angle brackets if present
        messageUrl = messageUrl.replace(/^<|>$/g, '');
        
        // URL decode if needed
        messageUrl = decodeURIComponent(messageUrl);
        
        console.log('Debug - Cleaned URL:', JSON.stringify(messageUrl));
        
        if (!messageUrl) {
            await say({
                text: 'Please provide a Slack message permalink to add as a prompt.',
                thread_ts: mention.thread_ts || mention.ts
            });
            return;
        }

        // Validate URL format
        const slackUrlPattern = /^https:\/\/[\w-]+\.slack\.com\/archives\/[A-Za-z0-9]+\/p\d+(\?.*)?$/;
        console.log('Debug - Pattern test result:', slackUrlPattern.test(messageUrl));
        
        if (!slackUrlPattern.test(messageUrl)) {
            await say({
                text: `Please provide a valid Slack message permalink (e.g., https://workspace.slack.com/archives/C1234567890/p1234567890123456)\n\nReceived: \`${messageUrl}\`\nLength: ${messageUrl.length}\nChar codes: ${[...messageUrl].map(c => c.charCodeAt(0)).join(',')}`,
                thread_ts: mention.thread_ts || mention.ts
            });
            return;
        }

        try {
            // Extract channel ID and timestamp from permalink
            const urlParts = messageUrl.match(/\/archives\/([A-Za-z0-9]+)\/p(\d+)/);
            if (!urlParts) {
                throw new Error('Invalid permalink format');
            }

            const channelId = urlParts[1];
            const timestamp = urlParts[2];
            
            // Convert timestamp format (remove last 6 digits and add decimal point)
            const messageTs = `${timestamp.slice(0, -6)}.${timestamp.slice(-6)}`;

            // Fetch the original message
            const result = await client.conversations.history({
                channel: channelId,
                latest: messageTs,
                limit: 1,
                inclusive: true
            });

            if (!result.messages || result.messages.length === 0) {
                await say({
                    text: 'Could not find the message at the provided permalink.',
                    thread_ts: mention.thread_ts || mention.ts
                });
                return;
            }

            const message = result.messages[0];
            if (!message.text) {
                await say({
                    text: 'The message appears to be empty or contains no text.',
                    thread_ts: mention.thread_ts || mention.ts
                });
                return;
            }

            // Get author information
            let authorName = 'Unknown User';
            if (message.user) {
                try {
                    const userInfo = await client.users.info({ user: message.user });
                    authorName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown User';
                } catch (error) {
                    console.warn('Could not fetch user info:', error);
                }
            }

            // Get invoker information
            let invokerName = 'Unknown User';
            if (mention.user) {
                try {
                    const invokerInfo = await client.users.info({ user: mention.user });
                    invokerName = invokerInfo.user?.real_name || invokerInfo.user?.name || 'Unknown User';
                } catch (error) {
                    console.warn('Could not fetch invoker info:', error);
                }
            }

            // Submit to prompt_library
            await submitPrompt({
                content: message.text,
                author: authorName,
                invoker: invokerName,
                permalink: messageUrl
            });

            await say({
                text: `✅ Prompt successfully submitted to the prompt library!\n\n*Original message by:* ${authorName}\n*Submitted by:* ${invokerName}\n*Link:* ${messageUrl}`,
                thread_ts: mention.thread_ts || mention.ts
            });

        } catch (error) {
            console.error('Error processing add-prompt command:', error);
            await say({
                text: `❌ Error processing prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
                thread_ts: mention.thread_ts || mention.ts
            });
        }
    });
};

interface PromptSubmission {
    content: string;
    author: string;
    invoker: string;
    permalink: string;
}

async function submitPrompt(submission: PromptSubmission): Promise<void> {
    const sharedSecret = process.env.SLACK_SHARED_SECRET;
    if (!sharedSecret) {
        throw new Error('SLACK_SHARED_SECRET environment variable is not configured');
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        throw new Error('GITHUB_TOKEN environment variable is not configured');
    }

    const payload = {
        event_type: 'slack-prompt-submission',
        client_payload: {
            secret: sharedSecret,
            content: submission.content,
            author: submission.author,
            invoker: submission.invoker,
            permalink: submission.permalink
        }
    };

    console.log('Debug - Sending payload:', JSON.stringify(payload, null, 2));

    const response = await fetch('https://api.github.com/repos/Lullabot/prompt_library/dispatches', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${githubToken}`,
            'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
}

export default addPromptPlugin;