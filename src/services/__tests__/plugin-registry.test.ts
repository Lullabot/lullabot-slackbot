import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginRegistry } from '../plugin-registry';

const ALL_PLUGINS = [
    'karma.ts',
    'factoids.ts',
    'help.ts',
    'uptime.ts',
    'botsnack.ts',
    'hello.ts',
    'conversions.ts',
    'add-prompt.ts',
];

describe('Plugin Registry Service', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
        // Save original environment variable
        originalEnv = process.env.DISABLED_PLUGINS;
    });

    afterEach(() => {
        // Restore original environment variable
        if (originalEnv === undefined) {
            delete process.env.DISABLED_PLUGINS;
        } else {
            process.env.DISABLED_PLUGINS = originalEnv;
        }
        vi.restoreAllMocks();
    });

    describe('When DISABLED_PLUGINS is not set', () => {
        it('should enable all plugins by default', () => {
            delete process.env.DISABLED_PLUGINS;
            const registry = new PluginRegistry();

            ALL_PLUGINS.forEach(plugin => {
                expect(registry.isPluginEnabled(plugin)).toBe(true);
            });
        });

        it('should return an empty array for getDisabledPlugins', () => {
            delete process.env.DISABLED_PLUGINS;
            const registry = new PluginRegistry();

            expect(registry.getDisabledPlugins()).toEqual([]);
        });

        it('should enable plugins added in the future without config changes', () => {
            delete process.env.DISABLED_PLUGINS;
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('brand-new-plugin.ts')).toBe(true);
        });
    });

    describe('When DISABLED_PLUGINS is set', () => {
        it('should disable only the listed plugins', () => {
            process.env.DISABLED_PLUGINS = 'add-prompt,conversions';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('add-prompt.ts')).toBe(false);
            expect(registry.isPluginEnabled('conversions.ts')).toBe(false);
            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
            expect(registry.isPluginEnabled('factoids.ts')).toBe(true);
        });

        it('should return array of disabled plugins', () => {
            process.env.DISABLED_PLUGINS = 'add-prompt,conversions';
            const registry = new PluginRegistry();

            expect(registry.getDisabledPlugins()).toEqual(['add-prompt', 'conversions']);
        });
    });

    describe('When DISABLED_PLUGINS has whitespace or messy formatting', () => {
        it('should trim whitespace and ignore empty entries', () => {
            process.env.DISABLED_PLUGINS = ' add-prompt , , conversions , ';
            const registry = new PluginRegistry();

            expect(registry.getDisabledPlugins()).toEqual(['add-prompt', 'conversions']);
            expect(registry.isPluginEnabled('add-prompt.ts')).toBe(false);
            expect(registry.isPluginEnabled('conversions.ts')).toBe(false);
            expect(registry.isPluginEnabled('karma.ts')).toBe(true);
        });
    });

    describe('When DISABLED_PLUGINS is an empty string', () => {
        it('should enable all plugins like when not set', () => {
            process.env.DISABLED_PLUGINS = '';
            const registry = new PluginRegistry();

            ALL_PLUGINS.forEach(plugin => {
                expect(registry.isPluginEnabled(plugin)).toBe(true);
            });
            expect(registry.getDisabledPlugins()).toEqual([]);
        });
    });

    describe('File extension handling', () => {
        it('should match regardless of .ts, .js, or no extension', () => {
            process.env.DISABLED_PLUGINS = 'karma';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('karma.ts')).toBe(false);
            expect(registry.isPluginEnabled('karma.js')).toBe(false);
            expect(registry.isPluginEnabled('karma')).toBe(false);
        });
    });

    describe('warnUnknownPlugins', () => {
        it('should warn for entries that do not match any known plugin', () => {
            process.env.DISABLED_PLUGINS = 'factiods'; // typo of factoids
            const registry = new PluginRegistry();
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            registry.warnUnknownPlugins(ALL_PLUGINS);

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('factiods');
        });

        it('should not warn when all disabled plugins are known', () => {
            process.env.DISABLED_PLUGINS = 'add-prompt,conversions';
            const registry = new PluginRegistry();
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            registry.warnUnknownPlugins(ALL_PLUGINS);

            expect(warn).not.toHaveBeenCalled();
        });

        it('should not warn when nothing is disabled', () => {
            delete process.env.DISABLED_PLUGINS;
            const registry = new PluginRegistry();
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            registry.warnUnknownPlugins(ALL_PLUGINS);

            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe('Real-world scenarios', () => {
        it('should support Lullabot full deployment (nothing disabled)', () => {
            delete process.env.DISABLED_PLUGINS;
            const registry = new PluginRegistry();

            ALL_PLUGINS.forEach(plugin => {
                expect(registry.isPluginEnabled(plugin)).toBe(true);
            });
        });

        it('should support Tugboat deployment (add-prompt disabled)', () => {
            process.env.DISABLED_PLUGINS = 'add-prompt';
            const registry = new PluginRegistry();

            expect(registry.isPluginEnabled('add-prompt.ts')).toBe(false);
            ALL_PLUGINS.filter(p => p !== 'add-prompt.ts').forEach(plugin => {
                expect(registry.isPluginEnabled(plugin)).toBe(true);
            });
        });
    });
});
