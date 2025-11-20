/**
 * Plugin Registry Service
 *
 * Manages which plugins are enabled based on the ENABLED_PLUGINS environment variable.
 *
 * Environment variable format:
 * ENABLED_PLUGINS=karma,factoids,help,uptime,botsnack,hello,conversions,add-prompt
 *
 * If ENABLED_PLUGINS is not set, all plugins are enabled by default.
 */

export class PluginRegistry {
    private enabledPlugins: Set<string> | null;

    constructor() {
        const enabledPluginsEnv = process.env.ENABLED_PLUGINS;

        if (enabledPluginsEnv) {
            // Parse comma-separated list and trim whitespace
            const pluginList = enabledPluginsEnv
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0);

            this.enabledPlugins = new Set(pluginList);
            console.log(`Plugin registry: ${pluginList.length} plugins enabled via ENABLED_PLUGINS`);
        } else {
            // null means all plugins are enabled
            this.enabledPlugins = null;
            console.log('Plugin registry: ENABLED_PLUGINS not set, all plugins enabled by default');
        }
    }

    /**
     * Check if a plugin is enabled
     * @param pluginFileName The plugin file name (e.g., 'karma.ts' or 'karma.js')
     * @returns true if the plugin should be loaded
     */
    isPluginEnabled(pluginFileName: string): boolean {
        // Extract plugin name from file name (remove .ts or .js extension)
        const pluginName = pluginFileName.replace(/\.(ts|js)$/, '');

        // If no ENABLED_PLUGINS set, all are enabled
        if (this.enabledPlugins === null) {
            return true;
        }

        // Check if this plugin is in the enabled set
        return this.enabledPlugins.has(pluginName);
    }

    /**
     * Get list of enabled plugin names (for logging/debugging)
     * @returns Array of enabled plugin names, or null if all are enabled
     */
    getEnabledPlugins(): string[] | null {
        if (this.enabledPlugins === null) {
            return null;
        }
        return Array.from(this.enabledPlugins);
    }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();
