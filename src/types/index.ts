import { App } from '@slack/bolt';

export interface Plugin {
    (app: App): Promise<void>;
}

export interface StorageData {
    [key: string]: any;
}

export interface Storage {
    id: string;
    data: StorageData;
}

export interface Command {
    pattern: string;
    description: string;
}

export interface HelpSection {
    title: string;
    description: string;
    commands: Command[];
}

export interface HelpText {
    [key: string]: HelpSection;
}

// Pattern registry interfaces
export interface PatternEntry {
    pattern: RegExp;  // The regex pattern for the command
    pluginName: string;  // The name of the plugin that registered the pattern
    priority: number;  // Higher priority patterns are checked first
    exclusive?: boolean; // If true, no other plugin should process if this matches
}

export interface PatternRegistry {
    registerPattern(pattern: RegExp, pluginName: string, priority?: number, exclusive?: boolean): void;
    matchesAnyPattern(text: string): boolean;
    getPatterns(): PatternEntry[];
    getExclusiveMatch(text: string): PatternEntry | null;
} 