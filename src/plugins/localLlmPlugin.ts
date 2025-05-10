import { App } from '@slack/bolt';
import { AppMentionEvent } from '@slack/types'; 
import { generateResponse as generateLlmResponse } from '../services/LocalLlmService';
import patternRegistry from '../services/pattern-registry';

export default (app: App) => {
  const commandRegex = /^<@[^>]+>\s*prompt: (.+)/i; // Regex to match mention + command
  patternRegistry.registerPattern(commandRegex, 'localLlm', 100, true); // Register as exclusive, high priority

  app.event('app_mention', async ({ event, say, client, logger }) => {
    logger.info(`[AppMention HANDLER] Received app_mention. Event text: "${event.text}"`);

    const match = event.text.match(commandRegex);

    if (match && match[1]) {
      const userPrompt = match[1].trim();
      logger.info(`[AppMention HANDLER] Matched "prompt" command. User: ${event.user}, Prompt: "${userPrompt}"`);

      if (userPrompt === '') {
        await say('It seems you wanted to use the prompt command, but the prompt was empty after "prompt:".');
        return;
      }

      try {
        const thinkingMessage = await say(`Thinking about: \"${userPrompt}\"... :hourglass_flowing_sand:`);
        
        const startTime = Date.now();
        const aiResponse = await generateLlmResponse(userPrompt);
        const endTime = Date.now();
        // Keep Phi-2 here for now as we know which model is running, can be generic later if model is configurable
        logger.info(`[AppMention HANDLER] Phi-2 response generated in ${(endTime - startTime) / 1000} seconds.`);

        if (thinkingMessage.ts && thinkingMessage.channel) {
          await client.chat.update({
            channel: thinkingMessage.channel,
            ts: thinkingMessage.ts,
            text: `${aiResponse}`,
          });
        } else {
          await say(`${aiResponse}`);
        }
      } catch (error) {
        logger.error('[AppMention HANDLER] Error processing "prompt" command:', error);
        await say('Sorry, I encountered an error while processing your prompt.');
      }
    } else {
      // Optional: Log if an app_mention was received but didn't match the command pattern
      // logger.info(`[AppMention HANDLER] Received app_mention that did not match "prompt" pattern: "${event.text}"`);
    }
  });

  // The app.message handler for /^\s*ask phi2: (.+)/i can now be removed 
  // as its logic is incorporated above for app_mentions.

  console.log('🗣️ Local LLM (app_mention "prompt:") plugin loaded.');
}; 