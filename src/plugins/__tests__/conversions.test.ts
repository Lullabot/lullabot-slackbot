import { App } from '@slack/bolt';
import conversionsPlugin from '../conversions';
import patternRegistry from '../../services/pattern-registry';

// Mock dependencies
jest.mock('../../services/pattern-registry', () => ({
    registerPattern: jest.fn(),
    matchesAnyPattern: jest.fn().mockReturnValue(false)
}));

jest.mock('../../logger', () => ({
    createLogger: jest.fn(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('Conversions Plugin', () => {
    let app: App;
    let mockSay: jest.Mock;
    let mockClient: any;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        mockSay = jest.fn();
        mockClient = {
            users: {
                info: jest.fn().mockResolvedValue({
                    user: { id: 'U12345', name: 'testuser' }
                })
            }
        };

        // Create a mock App instance
        app = {
            message: jest.fn(),
            event: jest.fn(),
            action: jest.fn(),
            command: jest.fn(),
            options: jest.fn(),
            error: jest.fn(),
            client: mockClient
        } as any;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Plugin Registration', () => {
        it('should register command patterns with pattern registry', async () => {
            await conversionsPlugin(app);
            
            expect(patternRegistry.registerPattern).toHaveBeenCalledTimes(3);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(
                expect.any(RegExp),
                'conversions',
                1
            );
        });

        it('should register message handlers for convert, question, and listener patterns', async () => {
            await conversionsPlugin(app);
            
            expect(app.message).toHaveBeenCalledTimes(3);
            expect(app.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
        });
    });

    describe('Convert Command', () => {
        let convertHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            // Get the convert command handler (first message handler)
            convertHandler = (app.message as jest.Mock).mock.calls[0][1];
        });

        it('should convert Fahrenheit via convert command', async () => {
            const message = {
                text: 'convert 75°F',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*75°F* is *23.9°C* or *297°K*'
            });
        });

        it('should convert Celsius via convert command', async () => {
            const message = {
                text: 'convert 100°C',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*100°C* is *212°F* or *373.1°K*'
            });
        });

        it('should convert Kelvin via convert command', async () => {
            const message = {
                text: 'convert 0 kelvin',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*0°K* is *-459.7°F* or *-273.1°C*'
            });
        });

        it('should convert miles to kilometers', async () => {
            const message = {
                text: 'convert 5 miles',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*5 miles* is *8 km*'
            });
        });

        it('should convert kilometers to miles', async () => {
            const message = {
                text: 'convert 10 km',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*10 km* is *6.2 miles*'
            });
        });

        it('should convert feet to meters', async () => {
            const message = {
                text: 'convert 6 feet',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*6 feet* is *1.8 m*'
            });
        });

        it('should handle negative temperatures', async () => {
            const message = {
                text: 'convert -40°F',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*-40°F* is *-40°C* or *233.1°K*'
            });
        });

        it('should handle decimal values', async () => {
            const message = {
                text: 'convert 98.6°F',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*98.6°F* is *37°C* or *310.1°K*'
            });
        });

        it('should handle multiple conversions in one command', async () => {
            const message = {
                text: 'convert 75°F and 5 miles',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*75°F* is *23.9°C* or *297°K*\n*5 miles* is *8 km*'
            });
        });

        it('should provide helpful error for invalid units', async () => {
            const message = {
                text: 'convert 100 invalid',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: 'No valid temperature or distance units found. Try something like: `convert 75°F` or `convert 5 miles`'
            });
        });

        it('should skip bot messages', async () => {
            const message = {
                text: 'convert 75°F',
                ts: '1234567890.123456',
                user: 'U12345',
                bot_id: 'B12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).not.toHaveBeenCalled();
        });
    });

    describe('Question Commands', () => {
        let questionHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            // Get the question handler (second message handler)
            questionHandler = (app.message as jest.Mock).mock.calls[1][1];
        });

        it('should handle temperature questions', async () => {
            const message = {
                text: 'what is 100°C in fahrenheit?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await questionHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*100°C* is *212°F* or *373.1°K*'
            });
        });

        it('should handle distance questions', async () => {
            const message = {
                text: 'what is 5 miles in km?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await questionHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*5 miles* is *8 km*'
            });
        });

        it('should provide helpful error for invalid question', async () => {
            const message = {
                text: 'what is 100 invalid in other?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await questionHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: 'I couldn\'t find valid units to convert. Try something like: `what is 75°F in celsius?` or `what is 5 miles in km?`'
            });
        });
    });

    describe('Listener Pattern ([number][unit]?)', () => {
        let listenerHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            // Get the listener handler (third message handler)
            listenerHandler = (app.message as jest.Mock).mock.calls[2][1];
        });

        it('should handle temperature lookup pattern', async () => {
            const message = {
                text: '75F?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await listenerHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*75°F* is *23.9°C* or *297°K*'
            });
        });

        it('should handle temperature lookup with space', async () => {
            const message = {
                text: '25 C?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await listenerHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*25°C* is *77°F* or *298.1°K*'
            });
        });

        it('should handle distance lookup pattern', async () => {
            const message = {
                text: '5km?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await listenerHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*5 km* is *3.1 miles*'
            });
        });

        it('should handle decimal values in lookup', async () => {
            const message = {
                text: '98.6F?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await listenerHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*98.6°F* is *37°C* or *310.1°K*'
            });
        });

        it('should handle negative temperatures in lookup', async () => {
            const message = {
                text: '-40C?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await listenerHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*-40°C* is *-40°F* or *233.1°K*'
            });
        });

        it('should provide helpful error for invalid unit in lookup', async () => {
            const message = {
                text: '100X?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await listenerHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: 'I don\'t recognize "X" as a temperature or distance unit. Try units like F, C, miles, km, feet, etc.'
            });
        });
    });

    describe('App Mentions', () => {
        let mentionHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            // Get the mention handler from the call to app.event
            mentionHandler = (app.event as jest.Mock).mock.calls[0][1];
        });

        it('should handle convert commands via mention', async () => {
            const event = {
                text: '<@U12345> convert 100°C',
                ts: '1234567890.123456',
                user: 'U67890',
                channel: 'C12345'
            };

            await mentionHandler({ event, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*100°C* is *212°F* or *373.1°K*'
            });
        });

        it('should handle question commands via mention', async () => {
            const event = {
                text: '<@U12345> what is 5 miles in km?',
                ts: '1234567890.123456',
                user: 'U67890',
                channel: 'C12345'
            };

            await mentionHandler({ event, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*5 miles* is *8 km*'
            });
        });

        it('should provide helpful error for invalid convert via mention', async () => {
            const event = {
                text: '<@U12345> convert 100 invalid',
                ts: '1234567890.123456',
                user: 'U67890',
                channel: 'C12345'
            };

            await mentionHandler({ event, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: 'No valid temperature or distance units found. Try something like: `@bot convert 75°F` or `@bot convert 5 miles`'
            });
        });

        it('should provide helpful error for invalid question via mention', async () => {
            const event = {
                text: '<@U12345> what is 100 invalid in other?',
                ts: '1234567890.123456',
                user: 'U67890',
                channel: 'C12345'
            };

            await mentionHandler({ event, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: 'I couldn\'t find valid units to convert. Try something like: `@bot what is 75°F in celsius?` or `@bot what is 5 miles in km?`'
            });
        });
    });

    describe('Edge Cases', () => {
        it('should show error for invalid convert command', async () => {
            await conversionsPlugin(app);
            const convertHandler = (app.message as jest.Mock).mock.calls[0][1];

            const message = {
                text: 'convert Hello world, how are you?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: 'No valid temperature or distance units found. Try something like: `convert 75°F` or `convert 5 miles`'
            });
        });

        it('should reply in main chat (no threading)', async () => {
            await conversionsPlugin(app);
            const convertHandler = (app.message as jest.Mock).mock.calls[0][1];

            const message = {
                text: 'convert 75°F',
                ts: '1234567890.123456',
                thread_ts: '1234567890.000000',
                user: 'U12345'
            };

            await convertHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '*75°F* is *23.9°C* or *297°K*'
            });
        });
    });
});
