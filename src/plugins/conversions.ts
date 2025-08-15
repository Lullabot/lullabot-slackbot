import { App } from '@slack/bolt';
import { GenericMessageEvent } from '@slack/types/dist/events/message';
import { AppMentionEvent } from '@slack/types/dist/events/app';
import { Plugin } from '../types';
import patternRegistry from '../services/pattern-registry';
import { createLogger } from '../logger';

const logger = createLogger('conversions');

// Temperature conversion functions
function convertTemperature(value: number, fromUnit: string, toUnit: string): number {
    const from = fromUnit.toLowerCase();
    const to = toUnit.toLowerCase();
    
    // Convert to Celsius first (as our base unit)
    let celsius: number;
    if (from.charAt(0) === 'f') {
        celsius = (value - 32) * 5/9;
    } else if (from.charAt(0) === 'c') {
        celsius = value;
    } else if (from === 'kelvin') {
        celsius = value - 273.15;
    } else {
        throw new Error(`Unknown temperature unit: ${fromUnit}`);
    }
    
    // Convert from Celsius to target unit
    if (to.charAt(0) === 'f') {
        return celsius * 9/5 + 32;
    } else if (to.charAt(0) === 'c') {
        return celsius;
    } else if (to === 'kelvin') {
        return celsius + 273.15;
    } else {
        throw new Error(`Unknown temperature unit: ${toUnit}`);
    }
}

// Distance conversion functions
function convertDistance(value: number, fromUnit: string, toUnit: string): number {
    const from = fromUnit.toLowerCase();
    const to = toUnit.toLowerCase();
    
    // Convert to meters first (as our base unit)
    let meters: number;
    
    // Handle imperial to metric
    if (from.startsWith('mile') || from === 'mi') {
        meters = value * 1609.344; // 1 mile = 1609.344 meters
    } else if (from.startsWith('feet') || from === 'ft') {
        meters = value * 0.3048; // 1 foot = 0.3048 meters
    } else if (from.startsWith('inch') || from === 'in') {
        meters = value * 0.0254; // 1 inch = 0.0254 meters
    }
    // Handle metric units
    else if (from.startsWith('kilometer') || from === 'km' || from === 'k') {
        meters = value * 1000;
    } else if (from.startsWith('meter') || from === 'm') {
        meters = value;
    } else if (from.startsWith('centimeter') || from === 'cm') {
        meters = value * 0.01;
    } else {
        throw new Error(`Unknown distance unit: ${fromUnit}`);
    }
    
    // Convert from meters to target unit
    if (to.startsWith('mile') || to === 'mi') {
        return meters / 1609.344;
    } else if (to.startsWith('feet') || to === 'ft') {
        return meters / 0.3048;
    } else if (to.startsWith('inch') || to === 'in') {
        return meters / 0.0254;
    } else if (to.startsWith('kilometer') || to === 'km' || to === 'k') {
        return meters / 1000;
    } else if (to.startsWith('meter') || to === 'm') {
        return meters;
    } else if (to.startsWith('centimeter') || to === 'cm') {
        return meters / 0.01;
    } else {
        throw new Error(`Unknown distance unit: ${toUnit}`);
    }
}

// Auto-conversion logic - determines the "opposite" system
function getOppositeTemperatureUnit(unit: string): string {
    const u = unit.toLowerCase();
    if (u.charAt(0) === 'f') {
        return 'C';
    } else if (u.charAt(0) === 'c') {
        return 'F';
    } else if (u === 'kelvin') {
        return 'C'; // Convert Kelvin to Celsius as it's more common
    } else {
        return 'C';
    }
}

function getOppositeDistanceUnit(unit: string): string {
    const u = unit.toLowerCase();
    
    // Imperial to Metric
    if (u.startsWith('mile') || u === 'mi') return 'km';
    if (u.startsWith('feet') || u === 'ft') return 'm';
    if (u.startsWith('inch') || u === 'in') return 'cm';
    
    // Metric to Imperial  
    if (u.startsWith('kilometer') || u === 'km' || u === 'k') return 'miles';
    if (u.startsWith('meter') || u === 'm') return 'feet';
    if (u.startsWith('centimeter') || u === 'cm') return 'inches';
    
    return 'unknown';
}

// Helper function to format numbers nicely
function formatNumber(num: number): string {
    // Round to 1 decimal place and remove trailing zeros
    return parseFloat(num.toFixed(1)).toString();
}

const conversionsPlugin: Plugin = async (app: App): Promise<void> => {
    // Define patterns for temperature and distance detection
    // Note: 'K' alone is treated as kilometers, 'kelvin' is treated as temperature
    const temperaturePattern = /(-?\d+(?:\.\d+)?)\s*°?\s*(f|fahrenheit|c|celsius|kelvin)\b/gi;
    const distancePattern = /(\d+(?:\.\d+)?)\s*(miles?|mi|feet|ft|inches?|in|kilometers?|km|k(?!elvin)|meters?|m|centimeters?|cm)\b/gi;
    
    // Register patterns with the registry (low priority since we want to detect, not command)
    patternRegistry.registerPattern(temperaturePattern, 'conversions', 1);
    patternRegistry.registerPattern(distancePattern, 'conversions', 1);

    // Function to process conversions in a message
    function processConversions(text: string): string[] {
        const conversions: string[] = [];
        
        // Process temperature conversions
        const tempMatches = [...text.matchAll(temperaturePattern)];
        for (const match of tempMatches) {
            try {
                const value = parseFloat(match[1]);
                const fromUnit = match[2];
                const toUnit = getOppositeTemperatureUnit(fromUnit);
                const converted = convertTemperature(value, fromUnit, toUnit);
                
                conversions.push(`${match[1]}°${fromUnit.toUpperCase()} = ${formatNumber(converted)}°${toUnit}`);
            } catch (error) {
                console.error('Temperature conversion error:', error);
            }
        }
        
        // Process distance conversions
        const distMatches = [...text.matchAll(distancePattern)];
        for (const match of distMatches) {
            try {
                const value = parseFloat(match[1]);
                const fromUnit = match[2];
                const toUnit = getOppositeDistanceUnit(fromUnit);
                
                if (toUnit !== 'unknown') {
                    const converted = convertDistance(value, fromUnit, toUnit);
                    conversions.push(`${match[1]} ${fromUnit} = ${formatNumber(converted)} ${toUnit}`);
                }
            } catch (error) {
                console.error('Distance conversion error:', error);
            }
        }
        
        return conversions;
    }

    // Handle regular messages with conversions
    app.message(async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        
        // Skip bot messages to avoid loops
        if (msg.bot_id) return;
        
        // Skip messages that are commands to other plugins
        if (msg.text && patternRegistry.matchesAnyPattern(msg.text.replace(/\s*\d+.*/, ''))) {
            return;
        }
        
        const conversions = processConversions(msg.text || '');
        
        if (conversions.length > 0) {
            try {
                await say({
                    text: conversions.join('\n'),
                    thread_ts: msg.thread_ts || msg.ts
                });
                
                logger.info(`Converted ${conversions.length} units in message from user ${msg.user}`);
            } catch (error) {
                console.error('Error sending conversion response:', error);
            }
        }
    });

    // Handle app mentions with conversions
    app.event('app_mention', async ({ event, say, client }) => {
        const mention = event as AppMentionEvent;
        
        // Remove the bot mention from the text
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        
        const conversions = processConversions(text);
        
        if (conversions.length > 0) {
            try {
                await say({
                    text: conversions.join('\n'),
                    thread_ts: mention.thread_ts || mention.ts
                });
                
                logger.info(`Converted ${conversions.length} units in mention from user ${mention.user}`);
            } catch (error) {
                console.error('Error sending conversion response:', error);
            }
        }
    });
};

export default conversionsPlugin;
