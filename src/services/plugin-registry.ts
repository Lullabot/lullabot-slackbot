/**
 * Plugin Registry Service
 *
 * Manages which plugins are disabled based on the DISABLED_PLUGINS environment variable.
 *
 * Environment variable format:
 * DISABLED_PLUGINS=add-prompt,conversions
 *
 * If DISABLED_PLUGINS is not set, all plugins are enabled by default. This is a
 * deny-list: every plugin loads unless it is explicitly listed here. New plugins
 * are therefore enabled automatically without needing to update each deployment.
 */

export class PluginRegistry {
    private disabledPlugins: Set<string>;

    constructor() {
        const disabledPluginsEnv = process.env.DISABLED_PLUGINS;

        if (disabledPluginsEnv) {
            // Parse comma-separated list and trim whitespace
            const pluginList = disabledPluginsEnv
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0);

            this.disabledPlugins = new Set(pluginList);
            console.log(`Plugin registry: ${pluginList.length} plugin(s) disabled via DISABLED_PLUGINS`);
        } else {
            this.disabledPlugins = new Set();
            console.log('Plugin registry: DISABLED_PLUGINS not set, all plugins enabled by default');
        }
    }

    /**
     * Normalize a plugin file name or bare name to its plugin name.
     * @param pluginFileName The plugin file name (e.g., 'karma.ts', 'karma.js', or 'karma')
     */
    private normalize(pluginFileName: string): string {
        return pluginFileName.replace(/\.(ts|js)$/, '');
    }

    /**
     * Check if a plugin is enabled
     * @param pluginFileName The plugin file name (e.g., 'karma.ts' or 'karma.js')
     * @returns true if the plugin should be loaded
     */
    isPluginEnabled(pluginFileName: string): boolean {
        return !this.disabledPlugins.has(this.normalize(pluginFileName));
    }

    /**
     * Get list of disabled plugin names (for logging/debugging)
     * @returns Array of disabled plugin names (empty if none are disabled)
     */
    getDisabledPlugins(): string[] {
        return Array.from(this.disabledPlugins);
    }

    /**
     * Warn about entries in DISABLED_PLUGINS that don't match any real plugin.
     * Catches typos (e.g. `factiods`) that would otherwise silently do nothing.
     * @param knownPluginFiles The plugin file names discovered on disk
     */
    warnUnknownPlugins(knownPluginFiles: string[]): void {
        const knownNames = new Set(knownPluginFiles.map(file => this.normalize(file)));
        for (const name of this.disabledPlugins) {
            if (!knownNames.has(name)) {
                console.warn(`⚠️  DISABLED_PLUGINS lists unknown plugin "${name}" — no matching plugin file found (typo?)`);
            }
        }
    }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();
