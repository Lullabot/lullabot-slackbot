import path from 'path';
import { fork, ChildProcess } from 'child_process';
// Use import type for type annotations only, does not affect runtime for CJS.
import type { Llama, LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';

// __dirname is available in CommonJS modules after compilation
const projectRoot: string = path.join(__dirname, '..', '..'); 

const modelName: string = 'phi-2.Q4_K_M.gguf';
const modelPath: string = path.join(projectRoot, 'models', modelName);

// Path to the worker script after TSC compilation (from src/services to dist/services)
const workerPath = path.join(__dirname, 'llm-worker.mjs');

let llmWorker: ChildProcess | null = null;
let isInitializing = false;
let isInitialized = false;
const pendingRequests = new Map<string, { resolve: (value: string) => void; reject: (reason?: any) => void, timeoutId: NodeJS.Timeout }>();
let requestIdCounter = 0;

function generateRequestId(): string {
    return `req-${requestIdCounter++}`;
}

async function initializeModel(): Promise<void> {
    if (isInitialized) {
        return;
    }
    if (isInitializing) {
        // Wait for current initialization to complete
        return new Promise<void>((resolve, reject) => {
            const interval = setInterval(() => {
                if (isInitialized) {
                    clearInterval(interval);
                    resolve();
                }
                // Add a timeout or error check if isInitializing becomes false without isInitialized becoming true
            }, 100);
        });
    }

    isInitializing = true;
    console.log(`LLM Service: Forking worker script from: ${workerPath}`);

    return new Promise<void>((resolve, reject) => {
        llmWorker = fork(workerPath, [], { stdio: 'inherit' }); // 'inherit' for logs

        llmWorker.on('message', (message: any) => {
            if (message.type === 'workerReady') {
                llmWorker?.send({ action: 'initialize' });
            } else if (message.type === 'initializationComplete') {
                if (message.success) {
                    console.log('✅ LLM Service (via worker) initialized successfully.');
                    isInitialized = true;
                    resolve();
                } else {
                    console.error('❌ LLM Service (via worker) initialization failed.');
                    reject(new Error('Worker failed to initialize model'));
                }
                isInitializing = false;
            } else if (message.type === 'promptResponse') {
                const request = pendingRequests.get(message.requestId);
                if (request) {
                    clearTimeout(request.timeoutId);
                    if (message.error) {
                        request.reject(new Error(message.error));
                    } else {
                        request.resolve(message.response);
                    }
                    pendingRequests.delete(message.requestId);
                }
            }
        });

        llmWorker.on('error', (err) => {
            console.error('❌ LLM Worker error:', err);
            isInitializing = false;
            isInitialized = false;
            reject(err);
        });

        llmWorker.on('exit', (code) => {
            if (code !== 0) {
                console.log(`LLM Worker exited unexpectedly with code ${code}`);
            } else {
                console.log(`LLM Worker exited cleanly with code ${code}`);
            }
            isInitializing = false;
            isInitialized = false;
            llmWorker = null;
            // Optionally, try to restart or handle pending requests
            pendingRequests.forEach(req => req.reject(new Error('LLM Worker exited unexpectedly')));
            pendingRequests.clear();
            if (code !== 0) {
                // If initialization was in progress and failed, reject the promise.
                if (isInitializing && !isInitialized) reject(new Error(`LLM Worker exited with code ${code} during initialization`));
            }
        });
    });
}

async function generateResponse(userPrompt: string): Promise<string> {
    if (!isInitialized || !llmWorker) {
        console.error('LLM Service (worker) not initialized. Call initializeModel or wait.');
        // Attempt to initialize if not already, or if worker died.
        if (!isInitializing) {
            try {
                await initializeModel();
            } catch (initError) {
                console.error("Failed to auto-initialize worker:", initError);
                return 'LLM service is not ready. Please try again later.';
            }
        } else {
            return 'LLM service is initializing. Please try again shortly.';
        }
        // Check again after attempting initialization
        if(!isInitialized || !llmWorker) {
            return 'LLM service could not be initialized. Please check logs.';
        }
    }
    
    const reqId = generateRequestId(); // More robust than using prompt as key
    return new Promise<string>((resolve, reject) => {
        llmWorker?.send({ action: 'prompt', prompt: userPrompt, requestId: reqId }); // Send requestId to worker

        // Timeout for the request
        const timeoutId = setTimeout(() => { // Store the timeoutId
            if (pendingRequests.has(reqId)) {
                pendingRequests.delete(reqId);
                reject(new Error(`Timeout waiting for LLM response to prompt: "${userPrompt}"`));
            }
        }, 30000); // 30-second timeout, adjust as needed

        pendingRequests.set(reqId, { resolve, reject, timeoutId }); // Store timeoutId with the request
    });
}

// Graceful shutdown
process.on('exit', () => {
    if (llmWorker) {
        console.log('Main process exiting, killing LLM worker.');
        llmWorker.kill();
    }
});

export { initializeModel, generateResponse }; 