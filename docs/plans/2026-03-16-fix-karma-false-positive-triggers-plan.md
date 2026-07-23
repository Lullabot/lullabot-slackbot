---
title: "fix: Karma triggered by messages not intended as karma"
type: fix
date: 2026-03-16
issue: 224
---

# fix: Karma triggered by messages not intended as karma

## Overview

The karma plugin fires on any message ending with `++` or `--`, including normal conversational text like "I was thinking about this--" or "Looking forward to next week---". This produces unwanted karma announcements, pollutes karma data with garbage keys, and confuses users.

## Problem Statement

The regex at `src/plugins/karma.ts:64`:

```typescript
app.message(/(.+?)(-{2,}|\+{2,})\s*$/, async ({ message, context, client, say }) => {
```

`(.+?)` matches **any text** before the operator. There's no requirement that the target be a single word, user mention, or even intentional. The only guard is a 34-character length limit on the target (line 93).

### Examples of false positives

| Message | What happens |
|---|---|
| `I was thinking about this--` | Decrements karma for "i was thinking about this" |
| `Looking forward to next week---` | Decrements karma for "looking forward to next week" |
| `Check out C++` | Increments karma for "check out c" |
| `https://example.com/path++` | Increments karma for URL fragment |

## Proposed Solution

Replace the overly broad regex with one that requires the target to be either a **Slack user mention** or a **single word** (letters, digits, underscores, dots, hyphens).

### New regex

```typescript
/^\s*(<@[UW][A-Z0-9]+>|[\w][\w.-]*)(\+{2,}|-{2,})\s*$/
```

| Component | Meaning |
|---|---|
| `^\s*` | Start of message, optional leading whitespace |
| `(<@[UW][A-Z0-9]+>)` | Slack user mention (e.g. `<@U12345>`) |
| `([\w][\w.-]*)` | OR a word starting with `\w`, optionally followed by `\w`, `.`, `-` |
| `(\+{2,}\|-{2,})` | Two or more `+` or `-` |
| `\s*$` | Optional trailing whitespace, end of message |

### Design decisions

1. **Drop multi-word karma targets.** Production data (`data/T02KKQQ8L_karma.json`) contains no multi-word keys. Multi-word support is the root cause of false positives — any sentence ending in `--` triggers karma. If multi-word support is desired later, a quoting syntax like `"good vibes"++` can be added.

2. **Minimum target length: 1 character.** Single-character targets like `C++` are edge cases but rare as standalone Slack messages. Adding a 2-char minimum would be overly restrictive for targets like `go++`.

3. **Register the `++`/`--` pattern in the pattern registry.** Currently only the `karma` query patterns are registered (lines 60-61). The give/take pattern should also be registered so other plugins (factoids) can detect conflicts.

4. **Tolerate leading/trailing whitespace.** Users may have leading spaces from copy-paste.

5. **No data migration needed.** Old false-positive keys become inert — they can never be matched again. Harmless clutter in storage.

## Technical Considerations

- **Backwards compatibility**: Existing single-word and user-mention karma is preserved. Only multi-word targets (which were all false positives) are dropped.
- **Pattern registry**: Register the new regex at priority 10 alongside existing karma patterns.
- **No test coverage exists** for karma. This fix must include a comprehensive test file.

## Acceptance Criteria

- [x] Replace karma give/take regex in `src/plugins/karma.ts:64` with anchored single-word pattern
- [x] Register the `++`/`--` pattern in the pattern registry (`src/plugins/karma.ts:60-61`)
- [x] Create `src/plugins/__tests__/karma.test.ts` with pattern matching tests
- [x] Valid patterns match: `coffee++`, `coffee--`, `<@U12345>++`, `node.js++`, `my-thing++`, `my_thing++`, `CoffEE++`, `sirkit++`
- [x] Invalid patterns do NOT match: `I was thinking about this--`, `Check out C++`, URLs ending in `++`/`--`, `++` alone, `--` alone, empty messages
- [x] Existing karma queries (`karma coffee`, `@bot karma coffee`) are unaffected
- [x] Self-karma prevention still works
- [x] Thread-aware responses still work
- [x] Rate limiting still works

## MVP

### `src/plugins/karma.ts` — regex change (line 64)

```typescript
// Before:
app.message(/(.+?)(-{2,}|\+{2,})\s*$/, async ({ message, context, client, say }) => {

// After:
app.message(/^\s*(<@[UW][A-Z0-9]+>|[\w][\w.-]*)(\+{2,}|-{2,})\s*$/, async ({ message, context, client, say }) => {
```

### `src/plugins/karma.ts` — pattern registry (after line 61)

```typescript
patternRegistry.registerPattern(/^\s*(.+?)(\+{2,}|-{2,})\s*$/, 'karma', 10);
```

### `src/plugins/__tests__/karma.test.ts` — new test file

```typescript
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
```

## References

- Issue: #224
- Karma plugin: `src/plugins/karma.ts`
- Pattern registry: `src/services/pattern-registry.ts`
- Existing test pattern to follow: `src/plugins/__tests__/factoids.test.ts`
- Related: institutional learning from `docs/solutions/SECURITY_GUARDRAILS_LESSONS.md` — "specific patterns catch real threats; generic patterns catch too much noise"
