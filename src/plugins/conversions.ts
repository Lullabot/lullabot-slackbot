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

// Helper function to get proper temperature unit abbreviations
function getTemperatureUnitAbbreviation(unit: string): string {
    const u = unit.toLowerCase();
    if (u.charAt(0) === 'f') {
        return 'F';
    } else if (u.charAt(0) === 'c') {
        return 'C';
    } else if (u === 'kelvin') {
        return 'K';
    } else {
        return unit.toUpperCase();
    }
}

const conversionsPlugin: Plugin = async (app: App): Promise<void> => {
    // Define patterns for temperature and distance detection (used by conversion logic)
    // Note: 'K' alone is treated as kilometers, 'kelvin' is treated as temperature
    const temperaturePattern = /(-?\d+(?:\.\d+)?)\s*°?\s*(f|fahrenheit|c|celsius|kelvin)\b/gi;
    const distancePattern = /(\d+(?:\.\d+)?)\s*(miles?|mi|feet|ft|inches?|in|kilometers?|km|k\b|meters?|m|centimeters?|cm)\b/gi;
    
    // Register command patterns with the registry
    patternRegistry.registerPattern(/^convert\s+(.+)$/i, 'conversions', 1);
    patternRegistry.registerPattern(/^what\s+is\s+(.+)\s+in\s+(.+)\?$/i, 'conversions', 1);
    patternRegistry.registerPattern(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)\?$/, 'conversions', 1);

    // Function to process conversions in a message
    function processConversions(text: string): string[] {
        const conversions: string[] = [];
        
        // Process temperature conversions
        const tempMatches = [...text.matchAll(temperaturePattern)];
        for (const match of tempMatches) {
            try {
                const value = parseFloat(match[1]);
                const fromUnit = match[2];
                
                // Convert to all three temperature units
                const fahrenheit = convertTemperature(value, fromUnit, 'fahrenheit');
                const celsius = convertTemperature(value, fromUnit, 'celsius');
                const kelvin = convertTemperature(value, fromUnit, 'kelvin');
                
                // Build conversational response showing only the OTHER 2 units
                const fromUnitLower = fromUnit.toLowerCase();
                let otherUnits = [];
                
                if (fromUnitLower.charAt(0) !== 'f') otherUnits.push(`*${formatNumber(fahrenheit)}°F*`);
                if (fromUnitLower.charAt(0) !== 'c') otherUnits.push(`*${formatNumber(celsius)}°C*`);
                if (fromUnitLower !== 'kelvin') otherUnits.push(`*${formatNumber(kelvin)}°K*`);
                
                conversions.push(`*${match[1]}°${getTemperatureUnitAbbreviation(fromUnit)}* is ${otherUnits.join(' or ')}`);
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
                    conversions.push(`*${match[1]} ${fromUnit}* is *${formatNumber(converted)} ${toUnit}*`);
                }
            } catch (error) {
                console.error('Distance conversion error:', error);
            }
        }
        
        return conversions;
    }

    // Handle explicit convert commands
    app.message(/^convert\s+(.+)$/i, async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        
        // Skip bot messages to avoid loops
        if (msg.bot_id) return;
        
        const conversions = processConversions(msg.text || '');
        
        if (conversions.length > 0) {
            try {
                await say({
                    text: conversions.join('\n')
                });
                
                logger.info(`Converted ${conversions.length} units via convert command from user ${msg.user}`);
            } catch (error) {
                console.error('Error sending conversion response:', error);
            }
        } else {
            // No valid conversions found in the command
            await say({
                text: 'No valid temperature or distance units found. Try something like: `convert 75°F` or `convert 5 miles`'
            });
        }
    });

    // Handle question-based conversion commands  
    app.message(/^what\s+is\s+(.+)\s+in\s+(.+)\?$/i, async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        
        // Skip bot messages to avoid loops
        if (msg.bot_id) return;
        
        const conversions = processConversions(msg.text || '');
        
        if (conversions.length > 0) {
            try {
                await say({
                    text: conversions.join('\n')
                });
                
                logger.info(`Converted ${conversions.length} units via question command from user ${msg.user}`);
            } catch (error) {
                console.error('Error sending conversion response:', error);
            }
        } else {
            // No valid conversions found in the question
            await say({
                text: 'I couldn\'t find valid units to convert. Try something like: `what is 75°F in celsius?` or `what is 5 miles in km?`'
            });
        }
    });

    // Handle single listener pattern: [number][unit]? (e.g., "34F?", "25 C?", "-40C?")
    app.message(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)\?$/, async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        
        // Skip bot messages to avoid loops
        if (msg.bot_id) return;
        
        // Construct the unit string from the pattern match
        const match = msg.text?.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)\?$/);
        if (match) {
            const unitString = `${match[1]}${match[2]}`;
            const conversions = processConversions(unitString);
            
            if (conversions.length > 0) {
                try {
                    await say({
                        text: conversions.join('\n')
                    });
                    
                    logger.info(`Converted ${conversions.length} units via listener pattern from user ${msg.user}`);
                } catch (error) {
                    console.error('Error sending conversion response:', error);
                }
            } else {
                // Unit not recognized
                await say({
                    text: `I don't recognize "${match[2]}" as a temperature or distance unit. Try units like F, C, miles, km, feet, etc.`
                });
            }
        }
    });

    // Handle app mentions with convert commands
    app.event('app_mention', async ({ event, say, client }) => {
        const mention = event as AppMentionEvent;
        
        // Remove the bot mention from the text
        const text = mention.text.replace(/<@[^>]+>\s*/, '').trim();
        
        // Check if it's a convert command
        const convertMatch = text.match(/^convert\s+(.+)$/i);
        const questionMatch = text.match(/^what\s+is\s+(.+)\s+in\s+(.+)\?$/i);
        
        if (convertMatch) {
            const conversions = processConversions(convertMatch[1]);
            
            if (conversions.length > 0) {
                try {
                    await say({
                        text: conversions.join('\n')
                    });
                    
                    logger.info(`Converted ${conversions.length} units via @bot convert command from user ${mention.user}`);
                } catch (error) {
                    console.error('Error sending conversion response:', error);
                }
            } else {
                // No valid conversions found in the command
                await say({
                    text: 'No valid temperature or distance units found. Try something like: `@bot convert 75°F` or `@bot convert 5 miles`'
                });
            }
        } else if (questionMatch) {
            const conversions = processConversions(text);
            
            if (conversions.length > 0) {
                try {
                    await say({
                        text: conversions.join('\n')
                    });
                    
                    logger.info(`Converted ${conversions.length} units via @bot question command from user ${mention.user}`);
                } catch (error) {
                    console.error('Error sending conversion response:', error);
                }
            } else {
                // No valid conversions found in the question
                await say({
                    text: 'I couldn\'t find valid units to convert. Try something like: `@bot what is 75°F in celsius?` or `@bot what is 5 miles in km?`'
                });
            }
        }
    });
};

export default conversionsPlugin;
