import { App } from '@slack/bolt';
import helpPlugin from '../help';
import patternRegistry from '../../services/pattern-registry';

// Mock dependencies
jest.mock('../../services/pattern-registry', () => ({
    registerPattern: jest.fn()
}));

describe('Help Plugin', () => {
    let app: App;
    let mockSay: jest.Mock;
    let mockClient: any;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        mockSay = jest.fn();
        mockClient = {
            auth: {
                test: jest.fn()
            }
        };

        // Create mock app
        app = {
            event: jest.fn(),
            message: jest.fn()
        } as any;

        // Note: Cache state persists between tests in the same file
        // This is actually realistic since the bot would maintain cache across requests
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
            const appEventCall = (app.event as jest.Mock).mock.calls.find(call => call[0] === 'app_mention');
            const messageCall = (app.message as jest.Mock).mock.calls.find(call => call[1]);
            
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
            // At this point, cache should be populated from previous test
            const mockEvent = {
                text: '<@U123456> help',
                thread_ts: undefined,
                ts: '1234567890.123456'
            };

            // This call should use cached value
            await appMentionHandler({ 
                event: mockEvent, 
                say: mockSay, 
                client: mockClient 
            });

            // Verify API was NOT called (cached value used)
            expect(mockClient.auth.test).not.toHaveBeenCalled();
            expect(mockSay).toHaveBeenCalledWith({
                text: expect.stringContaining('<@U123456>'),
                thread_ts: '1234567890.123456'
            });
        });
    });

    // TODO: Add event handler tests
});
