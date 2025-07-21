import path from 'path';
import { fileURLToPath } from 'url';
import { LlamaChatSession, getLlama } from 'node-llama-cpp';

// ESM __dirname and __filename equivalents
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Model setup (relative to this worker's location in dist/services after compilation)
// Adjust if your build process places it differently or manage via env var / config
const projectRoot = path.resolve(__dirname, '..', '..'); // from dist/services to project root
const modelName = 'phi-2.Q4_K_M.gguf';
const modelPath = path.join(projectRoot, 'models', modelName);

let modelInstance = null;
let LlamaChatSessionConstructor = LlamaChatSession; // To use the imported constructor

// Hardcoded Lullabot system prompt
const SYSTEM_PROMPT = `You are Lullabot, a knowledgeable, empowering, and helpful technical assistant representing Lullabot.
- Always demonstrate deep technical understanding and industry expertise.
- Use a conversational, approachable tone: address the user as "you" and refer to the company as "we."
- Break down complex concepts clearly, defining technical terms for a broad audience.
- Provide actionable, practical advice and examples whenever possible.
- Be respectful, professional, and solution-oriented in all responses.
- Keep paragraphs short and use active voice.
- Follow American English spelling conventions.
- Adapt your tone to the context: be confident and instructional for technical questions, warm and authentic for company culture, and thoughtful for industry insights.
- If you don't know the answer, say so honestly and offer to help find a solution.`;

async function initializeModel() {
    if (modelInstance) {
        return true;
    }
    try {
        const llama = await getLlama();
        modelInstance = await llama.loadModel({ modelPath });
        return true;
    } catch (error) {
        console.error('[Worker] Error initializing LLM model:', error);
        return false;
    }
}

async function handlePrompt(prompt, requestId) {
    if (!modelInstance) {
        console.error('[Worker] Model not initialized when handling prompt.');
        return { error: 'Model not initialized', requestId };
    }
    try {
        const contextInstance = await modelInstance.createContext();
        const session = new LlamaChatSessionConstructor({
            contextSequence: contextInstance.getSequence()
        });
        
        // Use a natural conversational format
        const simplePrompt = SYSTEM_PROMPT + `\n\nPlease respond to this request:

${prompt}

Response:`;
        
        const aiResponse = await session.prompt(simplePrompt, {
            maxTokens: 200,
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            repeatPenalty: 1.1,
            stopOnAbortSignal: true,
            stopStrings: ['\nYou are', '\n\nYou are', 'Response:']
        });
        
        // Clean up the response - remove any repeated patterns
        let cleanResponse = aiResponse
            .replace(/^Response:\s*/i, '')
            .replace(/\nYou are.*$/s, '')
            .replace(/Response:\s*$/s, '')
            .trim();
        
        // If response is just repetitive tokens, return a fallback
        if (cleanResponse.split(' ').length < 3 || /^(Assistant|AI|A:)\s*$/i.test(cleanResponse)) {
            cleanResponse = "I apologize, but I'm having trouble generating a proper response right now.";
        }
        
        return { response: cleanResponse, requestId };
    } catch (error) {
        console.error('[Worker] Error during LLM inference:', error);
        return { error: error.message || 'Error during inference', requestId };
    }
}

process.on('message', async (message) => {
    if (message.action === 'initialize') {
        const success = await initializeModel();
        if (process.send) {
            process.send({ type: 'initializationComplete', success });
        }
    } else if (message.action === 'prompt') {
        const result = await handlePrompt(message.prompt, message.requestId);
        if (process.send) {
            process.send({ type: 'promptResponse', ...result, originalPrompt: message.prompt });
        }
    }
});

// Signal readiness or successful import (optional)
if (process.send) {
    process.send({ type: 'workerReady' });
}