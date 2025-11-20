import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginRegistry } from '../plugin-registry';

describe('Plugin Registry Service', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
        // Save original environment variable
        originalEnv = process.env.ENABLED_PLUGINS;
    });

    afterEach(() => {
        // Restore original environment variable
        if (originalEnv === undefined) {
            delete process.env.ENABLED_PLUGINS;
        } else {
            process.env.ENABLED_PLUGINS = originalEnv;
        }
    });

    describe('When ENABLED_PLUGINS is not set', () => {
        it('should enable all plugins by default', () => {
            delete process.env.ENABLED_PLUGINS;
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.isPluginEnabled('help.ts')).toBe(true);
            expect(registry.isPluginEnabled('uptime.ts')).toBe(true);
            expect(registry.isPluginEnabled('botsnack.ts')).toBe(true);
            expect(registry.isPluginEnabled('hello.ts')).toBe(true);
            expect(registry.isPluginEnabled('conversions.ts')).toBe(true);
            expect(registry.isPluginEnabled('add-prompt.ts')).toBe(true);
        });

        it('should return null for getEnabledPlugins', () => {
            delete process.env.ENABLED_PLUGINS;
            const registry = new PluginRegistry();

            expect(registry.getEnabledPlugins()).toBeNull();
        });

        it('should enable even non-existent plugin names', () => {
            delete process.env.ENABLED_PLUGINS;
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('nonexistent.ts')).toBe(true);
        });
    });

    describe('When ENABLED_PLUGINS is set to specific plugins', () => {
        it('should enable only specified plugins', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids,help';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.isPluginEnabled('help.ts')).toBe(true);
            expect(registry.isPluginEnabled('uptime.ts')).toBe(false);
            expect(registry.isPluginEnabled('botsnack.ts')).toBe(false);
        });

        it('should return array of enabled plugins', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids,help';
            const registry = new PluginRegistry();

            const enabled = registry.getEnabledPlugins();
            expect(enabled).toEqual(['karma', 'factoids', 'help']);
        });
    });

    describe('When ENABLED_PLUGINS has whitespace', () => {
        it('should trim whitespace from plugin names', () => {
            process.env.ENABLED_PLUGINS = ' karma , factoids , help ';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.isPluginEnabled('help.ts')).toBe(true);
        });

        it('should handle extra whitespace gracefully', () => {
            process.env.ENABLED_PLUGINS = '  karma  ,  factoids  ,  help  ';
            const registry = new PluginRegistry();

            const enabled = registry.getEnabledPlugins();
            expect(enabled).toEqual(['karma', 'factoids', 'help']);
        });
    });

    describe('When ENABLED_PLUGINS is empty string', () => {
        it('should enable all plugins like when not set', () => {
            process.env.ENABLED_PLUGINS = '';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.getEnabledPlugins()).toBeNull();
        });
    });

    describe('File extension handling', () => {
        it('should work with .ts extension', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
        });

        it('should work with .js extension', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.js')).toBe(true);
            expect(registry.isPluginEnabled('factoids.js')).toBe(true);
        });

        it('should work without extension', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma')).toBe(true);
            expect(registry.isPluginEnabled('factoids')).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should handle single plugin', () => {
            process.env.ENABLED_PLUGINS = 'karma';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(false);
            expect(registry.getEnabledPlugins()).toEqual(['karma']);
        });

        it('should handle trailing comma', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids,';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.getEnabledPlugins()).toEqual(['karma', 'factoids']);
        });

        it('should handle leading comma', () => {
            process.env.ENABLED_PLUGINS = ',karma,factoids';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.getEnabledPlugins()).toEqual(['karma', 'factoids']);
        });

        it('should handle multiple consecutive commas', () => {
            process.env.ENABLED_PLUGINS = 'karma,,factoids';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.getEnabledPlugins()).toEqual(['karma', 'factoids']);
        });
    });

    describe('Real-world scenarios', () => {
        it('should support Lullabot full deployment (all plugins)', () => {
            delete process.env.ENABLED_PLUGINS;
            const registry = new PluginRegistry();

            // All current plugins should be enabled
            const allPlugins = [
                'karma.ts',
                'factoids.ts',
                'help.ts',
                'uptime.ts',
                'botsnack.ts',
                'hello.ts',
                'conversions.ts',
                'add-prompt.ts'
            ];

            allPlugins.forEach(plugin => {
                expect(registry.isPluginEnabled(plugin)).toBe(true);
            });
        });

        it('should support Tugboat limited deployment (no add-prompt)', () => {
            process.env.ENABLED_PLUGINS = 'karma,factoids,help,uptime,botsnack,hello,conversions';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
            expect(registry.isPluginEnabled('help.ts')).toBe(true);
            expect(registry.isPluginEnabled('uptime.ts')).toBe(true);
            expect(registry.isPluginEnabled('botsnack.ts')).toBe(true);
            expect(registry.isPluginEnabled('hello.ts')).toBe(true);
            expect(registry.isPluginEnabled('conversions.ts')).toBe(true);
            expect(registry.isPluginEnabled('add-prompt.ts')).toBe(false);
        });

        it('should support development testing (minimal plugins)', () => {
            process.env.ENABLED_PLUGINS = 'help,uptime';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('help.ts')).toBe(true);
            expect(registry.isPluginEnabled('uptime.ts')).toBe(true);
            expect(registry.isPluginEnabled('karma.ts')).toBe(false);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(false);
        });
    });
});
