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

    // Function to process conversions with an optional explicit target unit
    function processConversionsWithTarget(text: string, targetUnit?: string): string[] {
        const conversions: string[] = [];
        
        // Process temperature conversions
        const tempMatches = [...text.matchAll(temperaturePattern)];
        for (const match of tempMatches) {
            try {
                const value = parseFloat(match[1]);
                const fromUnit = match[2];
                
                if (targetUnit) {
                    // Convert to the specified target unit
                    try {
                        const converted = convertTemperature(value, fromUnit, targetUnit);
                        const targetAbbrev = getTemperatureUnitAbbreviation(targetUnit);
                        conversions.push(`*${match[1]}°${getTemperatureUnitAbbreviation(fromUnit)}* is *${formatNumber(converted)}°${targetAbbrev}*`);
                    } catch (error) {
                        // If target unit is invalid for temperature, fall back to default behavior
                        logger.warn({ error, targetUnit }, 'Invalid temperature target unit, falling back to default');
                        // Fall through to default temperature conversion logic below
                    }
                } 
                
                if (!targetUnit || conversions.length === 0) {
                    // Default behavior: Convert to all three temperature units
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
                }
            } catch (error) {
                logger.error({ error }, 'Temperature conversion error');
            }
        }
        
        // Process distance conversions
        const distMatches = [...text.matchAll(distancePattern)];
        for (const match of distMatches) {
            try {
                const value = parseFloat(match[1]);
                const fromUnit = match[2];
                let toUnit: string;
                
                if (targetUnit) {
                    // Use the explicit target unit
                    toUnit = targetUnit;
                } else {
                    // Use default opposite unit
                    toUnit = getOppositeDistanceUnit(fromUnit);
                }
                
                if (toUnit !== 'unknown') {
                    try {
                        const converted = convertDistance(value, fromUnit, toUnit);
                        conversions.push(`*${match[1]} ${fromUnit}* is *${formatNumber(converted)} ${toUnit}*`);
                    } catch (error) {
                        if (targetUnit) {
                            logger.warn({ error, targetUnit }, 'Invalid distance target unit, falling back to default');
                            // Fall back to default opposite unit
                            const defaultToUnit = getOppositeDistanceUnit(fromUnit);
                            if (defaultToUnit !== 'unknown') {
                                const converted = convertDistance(value, fromUnit, defaultToUnit);
                                conversions.push(`*${match[1]} ${fromUnit}* is *${formatNumber(converted)} ${defaultToUnit}*`);
                            }
                        } else {
                            throw error; // Re-throw if it's not a target unit issue
                        }
                    }
                }
            } catch (error) {
                logger.error({ error }, 'Distance conversion error');
            }
        }
        
        return conversions;
    }

    // Function to process conversions in a message (backward compatibility)
    function processConversions(text: string): string[] {
        return processConversionsWithTarget(text);
    }

    // Helper function to handle convert command logic (eliminates code duplication)
    function handleConvertCommand(conversionText: string, logPrefix: string, userInfo: string): { conversions: string[], logMessage: string } {
        let conversions: string[];
        let logMessage: string;
        
        // Check if it's a "convert X to Y" format
        const toMatch = conversionText.match(/^(.+?)\s+to\s+(.+)$/i);
        if (toMatch) {
            // "convert X to Y" format - use explicit target
            const sourceText = toMatch[1].trim(); // e.g., "5k"
            const targetUnit = toMatch[2].trim(); // e.g., "in"
            conversions = processConversionsWithTarget(sourceText, targetUnit);
            
            if (conversions.length > 0) {
                logMessage = `Converted ${conversions.length} units via ${logPrefix} convert X to Y command from user ${userInfo} (target: ${targetUnit})`;
            } else {
                logMessage = '';
            }
        } else {
            // "convert X" format - use default opposite units
            conversions = processConversions(conversionText);
            
            if (conversions.length > 0) {
                logMessage = `Converted ${conversions.length} units via ${logPrefix} convert command from user ${userInfo}`;
            } else {
                logMessage = '';
            }
        }
        
        return { conversions, logMessage };
    }

    // Helper function to send conversion response (eliminates code duplication)
    async function sendConversionResponse(
        conversions: string[], 
        say: Function, 
        logMessage: string, 
        errorMessage: string,
        threadTs?: string
    ): Promise<void> {
        if (conversions.length > 0) {
            try {
                await say({
                    text: conversions.join('\n'),
                    ...(threadTs && { thread_ts: threadTs })
                });
                
                if (logMessage) {
                    logger.info(logMessage);
                }
            } catch (error) {
                logger.error({ error }, 'Error sending conversion response');
            }
        } else {
            // No valid conversions found
            await say({
                text: errorMessage,
                ...(threadTs && { thread_ts: threadTs })
            });
        }
    }

    // Handle explicit convert commands
    app.message(/^convert\s+(.+)$/i, async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        
        // Skip bot messages to avoid loops
        if (msg.bot_id) return;
        
        // Extract the conversion text from the message
        const match = (msg.text || '').match(/^convert\s+(.+)$/i);
        if (!match) return; // This shouldn't happen, but just in case
        
        const conversionText = match[1]; // e.g., "5k to in" or just "5k"
        
        // Use helper function to handle conversion logic
        const { conversions, logMessage } = handleConvertCommand(conversionText, '', msg.user);
        
        // Use helper function to send response
        await sendConversionResponse(
            conversions,
            say,
            logMessage,
            'No valid temperature or distance units found. Try something like: `convert 75°F`, `convert 5 miles`, or `convert 5k to inches`',
            msg.thread_ts
        );
    });

    // Handle question-based conversion commands  
    app.message(/^what\s+is\s+(.+)\s+in\s+(.+)\?$/i, async ({ message, say, client }) => {
        const msg = message as GenericMessageEvent;
        
        // Skip bot messages to avoid loops
        if (msg.bot_id) return;
        
        // Extract the source and target from the regex groups
        const match = (msg.text || '').match(/^what\s+is\s+(.+)\s+in\s+(.+)\?$/i);
        if (!match) return; // This shouldn't happen, but just in case
        
        const sourceText = match[1]; // e.g., "5k" from "what is 5k in inches?"
        const targetUnit = match[2].trim(); // e.g., "inches" from "what is 5k in inches?"
        
        // Use the new function with explicit target unit
        const conversions = processConversionsWithTarget(sourceText, targetUnit);
        
        // Use helper function to send response
        await sendConversionResponse(
            conversions,
            say,
            conversions.length > 0 ? `Converted ${conversions.length} units via question command from user ${msg.user} (target: ${targetUnit})` : '',
            'I couldn\'t find valid units to convert. Try something like: `what is 75°F in celsius?` or `what is 5 miles in km?`',
            msg.thread_ts
        );
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
            const conversionText = convertMatch[1]; // e.g., "5k to in" or just "5k"
            
            // Use helper function to handle conversion logic
            const { conversions, logMessage } = handleConvertCommand(conversionText, '@bot', mention.user || 'unknown');
            
            // Use helper function to send response
            await sendConversionResponse(
                conversions,
                say,
                logMessage,
                'No valid temperature or distance units found. Try something like: `@bot convert 75°F`, `@bot convert 5 miles`, or `@bot convert 5k to inches`',
                mention.thread_ts
            );
        } else if (questionMatch) {
            // Extract the source and target from the regex groups (like main question handler)
            const sourceText = questionMatch[1]; // e.g., "5k" from "what is 5k in inches?"
            const targetUnit = questionMatch[2].trim(); // e.g., "inches" from "what is 5k in inches?"
            
            // Use the new function with explicit target unit
            const conversions = processConversionsWithTarget(sourceText, targetUnit);
            
            // Use helper function to send response
            await sendConversionResponse(
                conversions,
                say,
                conversions.length > 0 ? `Converted ${conversions.length} units via @bot question command from user ${mention.user || 'unknown'} (target: ${targetUnit})` : '',
                'I couldn\'t find valid units to convert. Try something like: `@bot what is 75°F in celsius?` or `@bot what is 5 miles in km?`',
                mention.thread_ts
            );
        }
    });
};

export default conversionsPlugin;
