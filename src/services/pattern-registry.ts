import { PatternEntry, PatternRegistry } from '../types';

/**
 * A central registry for command patterns across all plugins.
 * Allows plugins to register their patterns and check if a text matches any registered pattern.
 */
class PatternRegistryService implements PatternRegistry {
    private patterns: PatternEntry[] = [];
    
    /**
     * Register a pattern with the registry
     * @param pattern The regex pattern to register
     * @param pluginName The name of the plugin registering the pattern
     * @param priority Optional priority (higher priority patterns are checked first)
     * @param exclusive Optional exclusive flag
     */
    registerPattern(pattern: RegExp, pluginName: string, priority: number = 1, exclusive: boolean = false): void {
        this.patterns.push({
            pattern,
            pluginName,
            priority,
            exclusive
        });
        
        // Sort patterns by priority (descending)
        this.patterns.sort((a, b) => b.priority - a.priority);
        
        console.log(`Registered pattern ${pattern} from plugin ${pluginName} with priority ${priority}${exclusive ? ' (exclusive)' : ''}`);
    }
    
    /**
     * Check if text matches any registered pattern
     * @param text The text to check
     * @returns true if text matches any registered pattern, false otherwise
     */
    matchesAnyPattern(text: string): boolean {
        for (const entry of this.patterns) {
            if (entry.pattern.test(text)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Get all registered patterns
     * @returns Array of pattern entries
     */
    getPatterns(): PatternEntry[] {
        return [...this.patterns];
    }

    getExclusiveMatch(text: string): PatternEntry | null {
        for (const entry of this.patterns) {
            if (entry.exclusive && entry.pattern.test(text)) {
                return entry;
            }
        }
        return null;
    }
}

// Create a singleton instance
const patternRegistry = new PatternRegistryService();

export default patternRegistry; 