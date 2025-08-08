import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
    // Required core Slack bot configuration
    BOT_TOKEN: string;
    SLACK_APP_TOKEN: string;
    CLIENT_SIGNING_SECRET: string;
    
    // Optional add-prompt plugin configuration
    SLACK_SHARED_SECRET?: string;
    GITHUB_TOKEN?: string;
    
    // Environment
    NODE_ENV: string;
}

/**
 * Validates that all required environment variables are present
 * Fails fast if any required variables are missing
 */
function validateConfig(): Config {
    const errors: string[] = [];
    
    // Check required core variables
    if (!process.env.BOT_TOKEN) {
        errors.push('BOT_TOKEN is required');
    }
    
    if (!process.env.SLACK_APP_TOKEN) {
        errors.push('SLACK_APP_TOKEN is required');
    }
    
    if (!process.env.CLIENT_SIGNING_SECRET) {
        errors.push('CLIENT_SIGNING_SECRET is required');
    }
    
    // If there are errors, fail fast
    if (errors.length > 0) {
        console.error('❌ Configuration validation failed:');
        errors.forEach(error => console.error(`  - ${error}`));
        console.error('\nPlease ensure all required environment variables are set.');
        process.exit(1);
    }
    
    // Log warning if add-prompt variables are missing (optional but recommended)
    if (!process.env.SLACK_SHARED_SECRET || !process.env.GITHUB_TOKEN) {
        console.warn('⚠️  Warning: add-prompt plugin configuration incomplete');
        if (!process.env.SLACK_SHARED_SECRET) {
            console.warn('  - SLACK_SHARED_SECRET is not set (add-prompt plugin will not work)');
        }
        if (!process.env.GITHUB_TOKEN) {
            console.warn('  - GITHUB_TOKEN is not set (add-prompt plugin will not work)');
        }
    }
    
    return {
        BOT_TOKEN: process.env.BOT_TOKEN!,
        SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN!,
        CLIENT_SIGNING_SECRET: process.env.CLIENT_SIGNING_SECRET!,
        SLACK_SHARED_SECRET: process.env.SLACK_SHARED_SECRET,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        NODE_ENV: process.env.NODE_ENV || 'development'
    };
}

// Export validated config
export const config = validateConfig();

// Export helper to check if add-prompt is properly configured
export function isAddPromptConfigured(): boolean {
    return !!(config.SLACK_SHARED_SECRET && config.GITHUB_TOKEN);
}