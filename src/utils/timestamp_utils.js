/**
 * Timestamp Utility for Security Documents Generator
 *
 * Supports configurable date ranges, multi-day data generation,
 * and various time distribution patterns for realistic security data.
 */
import moment from 'moment';
import { faker } from '@faker-js/faker';
import { getConfig } from '../get_config';
/**
 * Parse relative date strings like "7d", "1w", "1M" to moment objects
 */
const parseRelativeDate = (dateStr, baseDate = moment()) => {
    // Handle special case for "now"
    if (dateStr === 'now') {
        return moment();
    }
    const match = dateStr.match(/^(\d+)([mhdwMy])$/);
    if (!match) {
        // Try parsing as ISO date
        return moment(dateStr);
    }
    const [, amount, unit] = match;
    const unitMap = {
        m: 'minutes',
        h: 'hours',
        d: 'days',
        w: 'weeks',
        M: 'months',
        y: 'years',
    };
    return baseDate.clone().subtract(parseInt(amount), unitMap[unit]);
};
/**
 * Get time range from configuration
 */
export const getTimeRange = (config) => {
    const appConfig = getConfig();
    const timestampConfig = config || {};
    let start;
    let end;
    // Default to current legacy behavior if no specific config
    if (!timestampConfig.startDate && !timestampConfig.endDate) {
        const offsetHours = timestampConfig.eventDateOffsetHours ||
            appConfig.eventDateOffsetHours ||
            24;
        end = moment();
        start = moment().subtract(offsetHours, 'hours');
    }
    else {
        // Parse start date
        if (timestampConfig.startDate) {
            start = parseRelativeDate(timestampConfig.startDate);
        }
        else {
            start = moment().subtract(7, 'days'); // Default to 7 days ago
        }
        // Parse end date
        if (timestampConfig.endDate === 'now' || !timestampConfig.endDate) {
            end = moment();
        }
        else {
            end = parseRelativeDate(timestampConfig.endDate);
        }
    }
    // Ensure start is before end
    if (start.isAfter(end)) {
        [start, end] = [end, start];
    }
    return { start, end };
};
/**
 * Generate a random timestamp within the specified range based on pattern
 */
export const generateTimestamp = (config) => {
    const { start, end } = getTimeRange(config);
    const pattern = config?.pattern || 'uniform';
    let timestamp;
    switch (pattern) {
        case 'business_hours': {
            timestamp = generateBusinessHoursTimestamp(start, end);
            break;
        }
        case 'attack_simulation': {
            timestamp = generateAttackSimulationTimestamp(start, end);
            break;
        }
        case 'weekend_heavy': {
            timestamp = generateWeekendHeavyTimestamp(start, end);
            break;
        }
        case 'random': {
            timestamp = generateRandomTimestamp(start, end);
            break;
        }
        case 'uniform':
        default: {
            timestamp = generateUniformTimestamp(start, end);
            break;
        }
    }
    return timestamp.format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
};
/**
 * Generate timestamps distributed uniformly across the time range
 */
const generateUniformTimestamp = (start, end) => {
    const startMs = start.valueOf();
    const endMs = end.valueOf();
    const randomMs = startMs + Math.random() * (endMs - startMs);
    return moment(randomMs);
};
/**
 * Generate timestamps heavily weighted toward business hours (9 AM - 6 PM, Mon-Fri)
 */
const generateBusinessHoursTimestamp = (start, end) => {
    const duration = end.diff(start, 'days');
    // 70% chance for business hours, 30% for off-hours
    const isBusinessHours = Math.random() < 0.7;
    if (isBusinessHours && duration > 0) {
        // Pick a random weekday
        const dayOffset = Math.floor(Math.random() * Math.ceil(duration));
        const baseDay = start.clone().add(dayOffset, 'days');
        // Skip weekends for business hours
        while (baseDay.day() === 0 || baseDay.day() === 6) {
            baseDay.add(1, 'day');
            if (baseDay.isAfter(end)) {
                return generateUniformTimestamp(start, end);
            }
        }
        // Set to business hours (9 AM - 6 PM)
        const businessHour = 9 + Math.random() * 9; // 9-18 hours
        const minutes = Math.floor(Math.random() * 60);
        const seconds = Math.floor(Math.random() * 60);
        return baseDay
            .hour(Math.floor(businessHour))
            .minute(minutes)
            .second(seconds);
    }
    return generateUniformTimestamp(start, end);
};
/**
 * Generate timestamps for attack simulation (burst patterns, late night activity)
 */
const generateAttackSimulationTimestamp = (start, end) => {
    const patterns = ['late_night', 'burst', 'weekend', 'normal'];
    const pattern = faker.helpers.arrayElement(patterns);
    switch (pattern) {
        case 'late_night': {
            // 11 PM - 4 AM activity
            return generateTimeInHourRange(start, end, [23, 4]);
        }
        case 'burst': {
            // Create 5-15 minute burst windows
            const baseTime = generateUniformTimestamp(start, end);
            const burstOffset = Math.random() * 15; // 0-15 minutes
            return baseTime.add(burstOffset, 'minutes');
        }
        case 'weekend': {
            // Weekend activity
            return generateWeekendTimestamp(start, end);
        }
        default: {
            return generateUniformTimestamp(start, end);
        }
    }
};
/**
 * Generate timestamps with heavy weekend weighting
 */
const generateWeekendHeavyTimestamp = (start, end) => {
    // 60% chance for weekend, 40% for weekday
    const isWeekend = Math.random() < 0.6;
    if (isWeekend) {
        return generateWeekendTimestamp(start, end);
    }
    return generateUniformTimestamp(start, end);
};
/**
 * Generate weekend timestamps (Saturday/Sunday)
 */
const generateWeekendTimestamp = (start, end) => {
    let attempts = 0;
    while (attempts < 20) {
        // Prevent infinite loop
        const randomTime = generateUniformTimestamp(start, end);
        if (randomTime.day() === 0 || randomTime.day() === 6) {
            // Sunday or Saturday
            return randomTime;
        }
        attempts++;
    }
    return generateUniformTimestamp(start, end);
};
/**
 * Generate timestamp within specific hour ranges
 */
const generateTimeInHourRange = (start, end, hourRange) => {
    const [startHour, endHour] = hourRange;
    const baseTime = generateUniformTimestamp(start, end);
    let targetHour;
    if (startHour > endHour) {
        // Overnight range (e.g., 23-4)
        if (Math.random() < 0.5) {
            targetHour = startHour + Math.random() * (24 - startHour);
        }
        else {
            targetHour = Math.random() * endHour;
        }
    }
    else {
        // Same day range (e.g., 9-17)
        targetHour = startHour + Math.random() * (endHour - startHour);
    }
    const minutes = Math.floor(Math.random() * 60);
    const seconds = Math.floor(Math.random() * 60);
    return baseTime.hour(Math.floor(targetHour)).minute(minutes).second(seconds);
};
/**
 * Generate completely random timestamps (higher variance)
 */
const generateRandomTimestamp = (start, end) => {
    // Use faker for more randomness
    const startMs = start.valueOf();
    const endMs = end.valueOf();
    const randomMs = faker.number.int({ min: startMs, max: endMs });
    return moment(randomMs);
};
/**
 * Generate a sequence of timestamps for attack chain scenarios
 */
export const generateAttackChainTimestamps = (count, config) => {
    const { start, end } = getTimeRange(config);
    const maxGap = config?.maxGapMinutes || 60; // Default 1 hour max gap
    const pattern = config?.sequencePattern || 'tight';
    const timestamps = [];
    // Generate initial timestamp within the time range
    const timeRangeMs = end.diff(start);
    const randomOffset = Math.random() * timeRangeMs;
    let currentMoment = start.clone().add(randomOffset, 'milliseconds');
    timestamps.push(currentMoment.clone());
    // Generate subsequent timestamps based on pattern
    for (let i = 1; i < count; i++) {
        let nextTime;
        switch (pattern) {
            case 'tight': {
                // 1-15 minutes between events
                nextTime = currentMoment.clone().add(Math.random() * 15 + 1, 'minutes');
                break;
            }
            case 'burst': {
                // Very tight clusters (seconds to few minutes)
                nextTime = currentMoment
                    .clone()
                    .add(Math.random() * 300 + 10, 'seconds'); // 10s - 5min
                break;
            }
            case 'spread':
            default: {
                // Spread over hours
                nextTime = currentMoment
                    .clone()
                    .add(Math.random() * maxGap + 5, 'minutes');
                break;
            }
        }
        // Ensure we don't exceed the end time
        if (nextTime.isAfter(end)) {
            nextTime = end.clone().subtract(Math.random() * 60, 'minutes');
        }
        timestamps.push(nextTime);
        currentMoment = nextTime;
    }
    return timestamps.map((ts) => ts.format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'));
};
/**
 * Get day-wise statistics for a time range
 */
export const getTimeRangeStats = (config) => {
    const { start, end } = getTimeRange(config);
    const totalHours = end.diff(start, 'hours');
    const totalDays = Math.ceil(totalHours / 24);
    let weekdays = 0;
    let weekends = 0;
    let businessHours = 0;
    const current = start.clone();
    while (current.isBefore(end)) {
        const dayOfWeek = current.day();
        const hour = current.hour();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            weekends++;
        }
        else {
            weekdays++;
            if (hour >= 9 && hour <= 17) {
                businessHours++;
            }
        }
        current.add(1, 'hour');
    }
    return {
        totalDays,
        totalHours,
        weekdays: Math.ceil(weekdays / 24),
        weekends: Math.ceil(weekends / 24),
        businessHours,
    };
};
