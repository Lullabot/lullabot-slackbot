import { App } from '@slack/bolt';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import helpPlugin, { __testResetCache } from '../help';
import patternRegistry from '../../services/pattern-registry';

// Mock dependencies
vi.mock('../../services/pattern-registry', () => ({
    default: {
        registerPattern: vi.fn()
    }
}));

// Mock console methods to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
    console.error = vi.fn();
});

afterAll(() => {
    console.error = originalConsoleError;
});

describe('Help Plugin', () => {
    let app: App;
    let mockSay: any;
    let mockClient: any;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Reset cache for test isolation
        __testResetCache();

        mockSay = vi.fn();
        mockClient = {
            auth: {
                test: vi.fn()
            }
        };

        // Create mock app
        app = {
            event: vi.fn(),
            message: vi.fn()
        } as any;
    });

    describe('Plugin Registration', () => {
        it('should register patterns with the pattern registry', async () => {
            await helpPlugin(app);

            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^help$/i, 'help', 10);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^commands$/i, 'help', 10);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^plugins$/i, 'help', 10);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^what$/i, 'common-words', 5);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^who$/i, 'common-words', 5);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^how$/i, 'common-words', 5);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^when$/i, 'common-words', 5);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^where$/i, 'common-words', 5);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(/^why$/i, 'common-words', 5);
        });

        it('should register app mention and message event handlers', async () => {
            await helpPlugin(app);

            expect(app.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
            expect(app.message).toHaveBeenCalledWith(expect.any(RegExp), expect.any(Function));
        });
    });

    describe('Bot User ID Caching', () => {
        // We need to test the internal getBotUserId function, but it's not exported
        // So we'll test it through the event handlers that use it
        let appMentionHandler: Function;
        let messageHandler: Function;

        beforeEach(async () => {
            await helpPlugin(app);
            
            // Extract the registered handlers for testing
            const appEventCall = (app.event as any).mock.calls.find((call: any) => call[0] === 'app_mention');
            const messageCall = (app.message as any).mock.calls.find((call: any) => call[1]);
            
            appMentionHandler = appEventCall[1];
            messageHandler = messageCall[1];
        });

        it('should handle API errors gracefully without caching failure', async () => {
            // Mock API error
            mockClient.auth.test.mockRejectedValueOnce(new Error('API Error'));

            const mockEvent = {
                text: '<@U123456> help',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            await appMentionHandler({ 
                event: mockEvent, 
                say: mockSay, 
                client: mockClient 
            });

            // Verify API was called
            expect(mockClient.auth.test).toHaveBeenCalledTimes(1);
            
            // Should still send help response with @bot fallback
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('@bot'),
                thread_ts: '1234567890.123456'
            });
        });

        it('should fetch bot user ID from API on first successful call', async () => {
            // Mock successful API response
            mockClient.auth.test.mockResolvedValueOnce({ user_id: 'U123456' });

            const mockEvent = {
                text: '<@U123456> help',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            await appMentionHandler({ 
                event: mockEvent, 
                say: mockSay, 
                client: mockClient 
            });

            // Verify API was called
            expect(mockClient.auth.test).toHaveBeenCalledTimes(1);
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('<@U123456>'),
                thread_ts: '1234567890.123456'
            });
        });

        it('should return cached value on subsequent calls without API call', async () => {
            // First, populate the cache by making a successful API call
            mockClient.auth.test.mockResolvedValueOnce({ user_id: 'U123456' });

            const mockEvent = {
                text: '<@U123456> help',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            // First call to populate cache
            await appMentionHandler({
                event: mockEvent,
                say: mockSay,
                client: mockClient
            });

            // Reset the mock to ensure we can verify no additional API calls
            mockClient.auth.test.mockClear();

            // Second call should use cached value
            await appMentionHandler({
                event: mockEvent,
                say: mockSay,
                client: mockClient
            });

            // Verify API was NOT called on the second call (cached value used)
            expect(mockClient.auth.test).not.toHaveBeenCalled();
            expect(mockSay).toHaveBeenLastCalledWith({
                text: expect.stringContaining('<@U123456>'),
                thread_ts: '1234567890.123456'
            });
        });
    });

    describe('Message Handler', () => {
        let messageHandler: Function;

        beforeEach(async () => {
            await helpPlugin(app);

            // Extract the registered message handler for testing
            const messageCall = (app.message as any).mock.calls.find((call: any) => call[1]);
            messageHandler = messageCall[1];
        });

        it('should handle direct help messages', async () => {
            // Mock successful API response
            mockClient.auth.test.mockResolvedValueOnce({ user_id: 'U123456' });

            const mockMessage = {
                text: 'help karma',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            await messageHandler({
                message: mockMessage,
                say: mockSay,
                client: mockClient
            });

            expect(mockClient.auth.test).toHaveBeenCalledTimes(1);
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('Karma System'),
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle direct help commands without specific plugin', async () => {
            // Mock successful API response
            mockClient.auth.test.mockResolvedValueOnce({ user_id: 'U123456' });

            const mockMessage = {
                text: 'help',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            await messageHandler({
                message: mockMessage,
                say: mockSay,
                client: mockClient
            });

            expect(mockClient.auth.test).toHaveBeenCalledTimes(1);
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('Available Plugins'),
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle direct help commands with thread context', async () => {
            // Mock successful API response
            mockClient.auth.test.mockResolvedValueOnce({ user_id: 'U123456' });

            const mockMessage = {
                text: 'help',
                thread_ts: '1234567890.000000',
                ts: '1234567890.123456'
            };

            await messageHandler({
                message: mockMessage,
                say: mockSay,
                client: mockClient
            });

            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('Available Plugins'),
                thread_ts: '1234567890.000000' // Should use thread_ts, not ts
            });
        });

        it('should handle messages without text gracefully', async () => {
            const mockMessage = {
                thread_ts: undefined,
                ts: '1234567890.123456'
                // No text property
            };

            await messageHandler({
                message: mockMessage,
                say: mockSay,
                client: mockClient
            });

            // Should not call say for messages without text
            expect(mockSay).not.toHaveBeenCalled();
            expect(mockClient.auth.test).not.toHaveBeenCalled();
        });

        it('should handle help commands with invalid plugin names', async () => {
            // Mock successful API response
            mockClient.auth.test.mockResolvedValueOnce({ user_id: 'U123456' });

            const mockMessage = {
                text: 'help nonexistentplugin',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            await messageHandler({
                message: mockMessage,
                say: mockSay,
                client: mockClient
            });

            expect(mockClient.auth.test).toHaveBeenCalledTimes(1);
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('Plugin "nonexistentplugin" not found'),
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle API errors gracefully with fallback to @bot mentions', async () => {
            // Mock API error
            mockClient.auth.test.mockRejectedValueOnce(new Error('API Error'));

            const mockMessage = {
                text: 'help',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            await messageHandler({
                message: mockMessage,
                say: mockSay,
                client: mockClient
            });

            expect(mockClient.auth.test).toHaveBeenCalledTimes(1);
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('@bot help <plugin>'), // Should fallback to @bot
                thread_ts: '1234567890.123456'
            });
        });
    });
});
