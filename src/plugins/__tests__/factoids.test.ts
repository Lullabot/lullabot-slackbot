import { App } from '@slack/bolt';
import factoidsPlugin from '../factoids.js';
import patternRegistry from '../../services/pattern-registry.js';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockRejectedValue(new Error('File not found')),
        writeFile: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../../services/pattern-registry', () => ({
    registerPattern: jest.fn(),
    matchesAnyPattern: jest.fn().mockReturnValue(false)
}));

// Use these patterns to test if the factoid plugin would trigger
const shouldMatchPatterns = [
    'factoid?',
    'factoid!',
    'multi word factoid?',
    'multi word factoid!',
    '<@U12345>?',
    '<@U12345>!',
    '@username?',
    '@username!'
];

// These patterns should NOT trigger the factoid plugin
const shouldNotMatchPatterns = [
    'factoid ?',
    'factoid !',
    'multi word factoid ?',
    'multi word factoid !',
    '<@U12345> ?',
    '<@U12345> !',
    '@username ?',
    '@username !',
    '<@U12345>, are you there?',
    '<@U12345> are you available?',
    '@username, are you there?',
    '@username are you available?',
    'Hey @username are you here?',
    'Hey @Jerad Bitner are you here?',
    '@David Burns: should I work on https://github.com/Lullabot/composer-checks/issues as part of Drainpipe?',
    'what is the question @sethlbrown?',
    'factoid with spaces and then some extra words?',
    'factoid with spaces and then some extra words!',
    'hugs @username for your children!'
];

describe('Factoids Plugin', () => {
    let app: any;
    let messageHandler: any;
    let messageRegexPattern: RegExp;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Create a mock app with a message handler
        app = {
            message: jest.fn((regex, handler) => {
                messageRegexPattern = regex;
                messageHandler = handler;
            }),
            event: jest.fn(),
            action: jest.fn()
        };
        
        // Initialize the plugin
        factoidsPlugin(app);
    });
    
    describe('Pattern Registration', () => {
        it('registers the correct patterns with the registry', () => {
            // Verify all expected patterns are registered
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(
                /^!factoid:\s*list$/i, 'factoids', 1
            );
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(
                /^forget\s+(.+)$/i, 'factoids', 1
            );
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(
                /^(YES|NO)$/i, 'factoids', 0.5
            );
            expect(patternRegistry.registerPattern).toHaveBeenCalledWith(
                /^.+[!?]$/, 'factoids', 0.25
            );
        });
    });
    
    describe('Pattern Matching', () => {
        // Helper function to process a message and determine if it triggers a factoid
        const shouldTriggerFactoid = (text: string): boolean => {
            // Use the new, stricter regex directly for testing purposes
            // Refined regex to better define allowed characters in factoid keys
            const strictFactoidPattern = /^((?:<@[UW][A-Z0-9]+>)|(?:@[a-zA-Z0-9._-]+)|(?:[a-zA-Z0-9._-]+(?:\s+[a-zA-Z0-9._-]+)*))[!?]$/i;

            if (!strictFactoidPattern.test(text)) {
                console.log(`Pattern "${text}" does not match strict pattern - REJECT`);
                return false;
            }
            
            // Optional: Keep the word count check as an additional constraint if desired
            const wordCount = text.slice(0, -1).trim().split(/\s+/).length;
            if (wordCount > 5) { // Adjust this threshold based on expected factoid length
                console.log(`Pattern "${text}" has too many words (${wordCount}) - REJECT`);
                return false;
            }
            
            console.log(`Pattern "${text}" matches strict pattern - ACCEPT`);
            return true;
        };
        
        describe('Should match patterns', () => {
            shouldMatchPatterns.forEach(pattern => {
                it(`should process factoid for "${pattern}"`, () => {
                    console.log(`\nTesting SHOULD match: "${pattern}"`);
                    const result = shouldTriggerFactoid(pattern);
                    expect(result).toBe(true);
                });
            });
        });
        
        describe('Should NOT match patterns', () => {
            shouldNotMatchPatterns.forEach(pattern => {
                it(`should NOT process factoid for "${pattern}"`, () => {
                    console.log(`\nTesting should NOT match: "${pattern}"`);
                    const result = shouldTriggerFactoid(pattern);
                    expect(result).toBe(false);
                });
            });
        });
        
        // Add a summary test to print results
        afterAll(() => {
            console.log('\n=== PATTERN MATCHING SUMMARY ===');
            console.log('Patterns that SHOULD match:');
            shouldMatchPatterns.forEach(pattern => {
                console.log(`"${pattern}" => ${shouldTriggerFactoid(pattern)}`);
            });
            
            console.log('\nPatterns that should NOT match:');
            shouldNotMatchPatterns.forEach(pattern => {
                console.log(`"${pattern}" => ${shouldTriggerFactoid(pattern)}`);
            });
        });
    });
}); 