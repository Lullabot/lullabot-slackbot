# Factoid Pattern Tests

This document contains test cases for the factoid pattern matching in the factoids plugin.
Use these cases to verify that the regex patterns are correctly handling all scenarios.

## Should Trigger Factoid Lookup

These patterns SHOULD trigger a factoid lookup:

1. `factoid?` - Basic factoid query with question mark
2. `factoid!` - Basic factoid query with exclamation mark 
3. `multi word factoid?` - Multi-word factoid query with question mark
4. `multi word factoid!` - Multi-word factoid query with exclamation mark
5. `<@U12345>?` - User mention by ID with question mark
6. `<@U12345>!` - User mention by ID with exclamation mark
7. `@username?` - User mention by username with question mark
8. `@username!` - User mention by username with exclamation mark

## Should NOT Trigger Factoid Lookup

These patterns should NOT trigger a factoid lookup:

1. `factoid ?` - Space before punctuation
2. `factoid !` - Space before punctuation
3. `multi word factoid ?` - Space before punctuation
4. `multi word factoid !` - Space before punctuation
5. `<@U12345> ?` - User mention with space before punctuation
6. `<@U12345> !` - User mention with space before punctuation
7. `@username ?` - User mention with space before punctuation
8. `@username !` - User mention with space before punctuation
9. `<@U12345>, are you there?` - User mention with comma and additional text
10. `<@U12345> are you available?` - User mention with additional text
11. `@username, are you there?` - Username mention with comma and additional text
12. `@username are you available?` - Username mention with additional text
13. `Hey @username are you here?` - Username mention with any prefix and additional text
14. `Hey @Jerad Bitner are you here?` - Full name mention with any prefix and additional text
15. `@David Burns: should I work on https://github.com/Lullabot/composer-checks/issues as part of Drainpipe?` - Username mention with colon and additional text
16. `what is the question @sethlbrown?` - Factoid with leading text
17. `factoid with spaces and then some extra words?` - Factoid with too many words
18. `factoid with spaces and then some extra words!` - Factoid with too many words

## Implementation Notes

- The factoid pattern matching is case insensitive
- User mentions in Slack can be in several formats:
  - `<@U12345>` - User ID format
  - `@username` - Username format
  - `@Full Name` - Full name format (including spaces)
- The maximum word count for a valid factoid is 5 words
- Patterns are rejected based on these rules:
  1. Messages must start with the factoid query - no leading text is allowed
  2. User mentions followed by additional text or anything in front of them are rejected
  3. Messages with a space before the final punctuation mark are rejected
  4. Messages with more than 5 words are rejected as too complex
  5. Messages must end with either ? or ! to be considered

## Adding New Test Patterns

To add new test patterns:

1. Add your pattern to this document under the appropriate section
2. Add the same pattern to the corresponding array in `src/plugins/__tests__/factoids.test.ts`
3. Run the tests to verify the pattern behaves as expected

Remember, any updates to pattern matching logic should be applied in both:
- `src/plugins/__tests__/factoids.test.ts` in the `shouldTriggerFactoid` function 
- `src/plugins/factoids.ts` in the message handler
