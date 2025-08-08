import { App } from '@slack/bolt';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from './types';
import { config } from './config';

// Initialize the Bolt app with validated config
const app = new App({
    token: config.BOT_TOKEN,
    signingSecret: config.CLIENT_SIGNING_SECRET,
    socketMode: true,
    appToken: config.SLACK_APP_TOKEN,
});

// Plugin loader function
const loadPlugins = async (app: App): Promise<void> => {
    console.log('Starting to load plugins...');
    const pluginsDir = path.join(__dirname, 'plugins');
    
    // Create plugins directory if it doesn't exist
    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir);
        console.log('Created plugins directory');
    }

    // Read all files from plugins directory
    // In dev mode (ts-node) look for .ts files, in prod mode look for .js files
    const extension = process.env.NODE_ENV === 'production' ? '.js' : '.ts';
    const pluginFiles = fs.readdirSync(pluginsDir)
        .filter(file => file.endsWith(extension));

    console.log(`Found ${pluginFiles.length} plugins to load:`, pluginFiles);

    // Load each plugin
    for (const file of pluginFiles) {
        try {
            const pluginModule = await import(path.join(pluginsDir, file));
            const plugin: Plugin = pluginModule.default;
            
            if (typeof plugin === 'function') {
                await plugin(app);
                console.log(`✅ Successfully loaded plugin: ${file}`);
            } else {
                console.warn(`⚠️ Plugin ${file} does not export a default function`);
            }
        } catch (error) {
            console.error(`❌ Error loading plugin ${file}:`, error);
        }
    }
    
    console.log('Finished loading plugins');
};

// Start the app and load plugins
(async () => {
    try {
        // Load plugins before starting the app
        await loadPlugins(app);
        
        // Start the app
        const port = process.env.PORT || 3000;
        await app.start(port);
        console.log(`⚡️ Bolt app is running on port ${port}!`);
    } catch (error) {
        console.error('❌ Error starting the app:', error);
        process.exit(1);
    }
})(); 