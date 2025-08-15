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
        it('should register patterns with pattern registry', async () => {
            await conversionsPlugin(app);
            
            expect(patternRegistry.registerPattern).toHaveBeenCalledTimes(2);
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(
                expect.any(RegExp),
                'conversions',
                1
            );
        });

        it('should register message and app_mention handlers', async () => {
            await conversionsPlugin(app);
            
            expect(app.message).toHaveBeenCalledWith(expect.any(Function));
            expect(app.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
        });
    });

    describe('Temperature Conversions', () => {
        let messageHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            // Get the message handler from the first call to app.message
            messageHandler = (app.message as jest.Mock).mock.calls[0][0];
        });

        it('should convert Fahrenheit to Celsius', async () => {
            const message = {
                text: 'It\'s 75°F outside today',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '75°F = 23.9°C',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert Celsius to Fahrenheit', async () => {
            const message = {
                text: 'Set the oven to 180°C',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '180°C = 356°F',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert Kelvin to Celsius', async () => {
            const message = {
                text: 'Absolute zero is 0 kelvin',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '0°KELVIN = -273.1°C',
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle negative temperatures', async () => {
            const message = {
                text: 'It\'s -40°F outside',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '-40°F = -40°C',
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle decimal temperatures', async () => {
            const message = {
                text: 'Body temperature is 98.6 fahrenheit',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '98.6°FAHRENHEIT = 37°C',
                thread_ts: '1234567890.123456'
            });
        });
    });

    describe('Distance Conversions', () => {
        let messageHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            messageHandler = (app.message as jest.Mock).mock.calls[0][0];
        });

        it('should convert miles to kilometers', async () => {
            const message = {
                text: 'I ran 5 miles this morning',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '5 miles = 8 km',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert kilometers to miles', async () => {
            const message = {
                text: 'Drive 10 km to get there',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '10 km = 6.2 miles',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert feet to meters', async () => {
            const message = {
                text: 'The building is 200 feet tall',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '200 feet = 61 m',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert meters to feet', async () => {
            const message = {
                text: 'The table is 2 meters wide',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '2 meters = 6.6 feet',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert inches to centimeters', async () => {
            const message = {
                text: 'My phone is 6 inches long',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '6 inches = 15.2 cm',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert centimeters to inches', async () => {
            const message = {
                text: 'Move it 5 centimeters to the left',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '5 centimeters = 2 inches',
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle decimal distances', async () => {
            const message = {
                text: 'I walked 2.5 miles today',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '2.5 miles = 4 km',
                thread_ts: '1234567890.123456'
            });
        });

        it('should convert K to miles (K as kilometers)', async () => {
            const message = {
                text: 'Drive 5 K to get there',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '5 K = 3.1 miles',
                thread_ts: '1234567890.123456'
            });
        });
    });

    describe('Multiple Conversions', () => {
        let messageHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            messageHandler = (app.message as jest.Mock).mock.calls[0][0];
        });

        it('should handle multiple conversions in one message', async () => {
            const message = {
                text: 'It\'s 75°F and I walked 2.5 miles',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '75°F = 23.9°C\n2.5 miles = 4 km',
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle mixed temperature and distance units', async () => {
            const message = {
                text: 'Temperature: 22°C, Distance: 1.5 km, Height: 6 feet',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '22°C = 71.6°F\n1.5 km = 0.9 miles\n6 feet = 1.8 m',
                thread_ts: '1234567890.123456'
            });
        });
    });

    describe('Edge Cases', () => {
        let messageHandler: Function;

        beforeEach(async () => {
            await conversionsPlugin(app);
            messageHandler = (app.message as jest.Mock).mock.calls[0][0];
        });

        it('should not respond to messages without units', async () => {
            const message = {
                text: 'Hello world, how are you?',
                ts: '1234567890.123456',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).not.toHaveBeenCalled();
        });

        it('should skip bot messages', async () => {
            const message = {
                text: 'It\'s 75°F outside',
                ts: '1234567890.123456',
                user: 'U12345',
                bot_id: 'B12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).not.toHaveBeenCalled();
        });

        it('should handle threading correctly', async () => {
            const message = {
                text: 'It\'s 75°F outside',
                ts: '1234567890.123456',
                thread_ts: '1234567890.000000',
                user: 'U12345'
            };

            await messageHandler({ message, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '75°F = 23.9°C',
                thread_ts: '1234567890.000000'  // Should use existing thread_ts
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

        it('should handle mentions with temperature conversions', async () => {
            const event = {
                text: '<@U12345> what is 100°C in fahrenheit?',
                ts: '1234567890.123456',
                user: 'U67890',
                channel: 'C12345'
            };

            await mentionHandler({ event, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '100°C = 212°F',
                thread_ts: '1234567890.123456'
            });
        });

        it('should handle mentions with distance conversions', async () => {
            const event = {
                text: '<@U12345> how many km is 5 miles?',
                ts: '1234567890.123456',
                user: 'U67890',
                channel: 'C12345'
            };

            await mentionHandler({ event, say: mockSay, client: mockClient });

            expect(mockSay).toHaveBeenCalledWith({
                text: '5 miles = 8 km',
                thread_ts: '1234567890.123456'
            });
        });
    });
});
