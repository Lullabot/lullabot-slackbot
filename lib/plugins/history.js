const util = require('util');
const controller = require('../controller');

// Listen for requests like "export history" or "channel archive"
controller.hears(['export history', 'channel archive'], ['direct_mention', 'direct_message'], async (bot, message) => {
    try {
        // Get channel history
        const history = await getChannelHistory(bot, message.channel);
        
        // Format the messages as text
        const formattedHistory = formatHistoryAsText(history);
        
        // Create a "file" to upload to Slack
        const fileData = {
            channels: message.channel,
            content: formattedHistory,
            filename: `channel-history-${message.channel}-${Date.now()}.txt`,
            filetype: 'text',
            title: 'Channel History Export'
        };

        // Upload the file
        const upload = util.promisify(bot.api.files.upload);
        await upload(fileData);
        
        bot.reply(message, 'I have exported the channel history and uploaded it as a file.');
    } catch (err) {
        bot.reply(message, `There was an error exporting the channel history: ${err.message}`);
    }
});

async function getChannelHistory(bot, channel) {
    const history = [];
    let latest = null;
    let hasMore = true;

    while (hasMore) {
        const params = {
            channel: channel,
            count: 1000,  // Maximum allowed per request
            latest: latest
        };

        try {
            const getHistory = util.promisify(bot.api.conversations.history);
            const response = await getHistory(params);
            
            if (response.messages && response.messages.length > 0) {
                history.push(...response.messages);
                latest = response.messages[response.messages.length - 1].ts;
                hasMore = response.has_more;
            } else {
                hasMore = false;
            }
        } catch (err) {
            throw new Error(`Failed to fetch channel history: ${err.message}`);
        }
    }

    return history;
}

function formatHistoryAsText(history) {
    return history.reverse().map(msg => {
        const timestamp = new Date(msg.ts * 1000).toISOString();
        return `[${timestamp}] ${msg.user}: ${msg.text}`;
    }).join('\n');
} 