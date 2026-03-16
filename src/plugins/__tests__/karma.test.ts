import { describe, it, expect } from 'vitest';

describe('Karma Plugin', () => {
    const karmaRegex = /^\s*(<@[UW][A-Z0-9]+>|[\w][\w.-]*)(\+{2,}|-{2,})\s*$/;

    const shouldMatchPatterns = [
        'coffee++',
        'coffee--',
        '<@U12345>++',
        '<@U12345>--',
        '<@W12345>++',
        'node.js++',
        'my-thing++',
        'my_thing++',
        'coffee+++',
        'thing---',
        'coffee++ ',
        ' coffee++',
        'CoffEE++',
        'a.b.c++',
        'sirkit++',
        'go++',
    ];

    const shouldNotMatchPatterns = [
        'I was thinking about this--',
        'Looking forward to next week---',
        'Check out C++',
        'Here is the url: https://example.com/path++',
        'good vibes++',
        'check this: coffee++',
        '(coffee)++',
        'Hey everyone, lets go--',
        'This is great -- really',
        'The value was 100--',
        '++',
        '--',
        '',
        '   ',
    ];

    describe('karma give/take regex', () => {
        shouldMatchPatterns.forEach(pattern => {
            it(`should match: "${pattern}"`, () => {
                expect(karmaRegex.test(pattern)).toBe(true);
            });
        });

        shouldNotMatchPatterns.forEach(pattern => {
            it(`should NOT match: "${pattern}"`, () => {
                expect(karmaRegex.test(pattern)).toBe(false);
            });
        });
    });
});
