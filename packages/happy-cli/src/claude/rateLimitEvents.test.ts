import { describe, expect, it } from 'vitest';
import { mergeRateLimitEvent, mergeRateLimitWindows, toLegacyRateLimits } from './rateLimitEvents';
import type { RateLimitsSnapshot } from '@/api/types';

const NOW = 1_770_000_000_000;

describe('mergeRateLimitWindows', () => {
    it('fills used_percentage from a probe-style update while keeping the event-carried status', () => {
        const prev: RateLimitsSnapshot = {
            five_hour: { used_percentage: null, resets_at: 1_770_007_200, status: 'allowed_warning' },
            seven_day: null,
            updated_at: NOW - 60_000,
        };

        const result = mergeRateLimitWindows(prev, {
            five_hour: { used_percentage: 15, resets_at: 1_770_010_800 },
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
        }, NOW);

        expect(result).toEqual({
            five_hour: { used_percentage: 15, resets_at: 1_770_010_800, status: 'allowed_warning' },
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW,
        });
    });

    it('leaves windows the update does not mention untouched', () => {
        const prev: RateLimitsSnapshot = {
            five_hour: { used_percentage: 15, resets_at: 1_770_007_200 },
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW - 60_000,
        };

        const result = mergeRateLimitWindows(prev, {
            five_hour: { used_percentage: 16 },
        }, NOW);

        expect(result).toEqual({
            five_hour: { used_percentage: 16, resets_at: 1_770_007_200 },
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW,
        });
    });

    it('builds windows from scratch when there is no previous snapshot', () => {
        const result = mergeRateLimitWindows(null, {
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
        }, NOW);

        expect(result).toEqual({
            five_hour: null,
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW,
        });
    });
});

describe('mergeRateLimitEvent', () => {
    it('creates a five-hour window from scratch, keeping resets_at in epoch seconds', () => {
        const result = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 42,
            resetsAt: 1_770_007_200,
        }, NOW);

        expect(result).toEqual({
            five_hour: { used_percentage: 42, resets_at: 1_770_007_200, status: 'allowed' },
            seven_day: null,
            updated_at: NOW,
        });
    });

    it('merges a seven-day event over a previous snapshot, preserving the five-hour window', () => {
        const prev: RateLimitsSnapshot = {
            five_hour: { used_percentage: 42, resets_at: 1_770_007_200 },
            seven_day: null,
            updated_at: NOW - 60_000,
        };

        const result = mergeRateLimitEvent(prev, {
            status: 'allowed_warning',
            rateLimitType: 'seven_day',
            utilization: 71,
            resetsAt: 1_770_400_000,
        }, NOW);

        expect(result).toEqual({
            five_hour: { used_percentage: 42, resets_at: 1_770_007_200 },
            seven_day: { used_percentage: 71, resets_at: 1_770_400_000, status: 'allowed_warning' },
            updated_at: NOW,
        });
    });

    it('maps model-specific seven-day claims onto the seven-day window', () => {
        const opus = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'seven_day_opus',
            utilization: 55,
        }, NOW);
        expect(opus?.seven_day).toEqual({ used_percentage: 55, resets_at: null, status: 'allowed' });

        const sonnet = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'seven_day_sonnet',
            utilization: 12,
        }, NOW);
        expect(sonnet?.seven_day).toEqual({ used_percentage: 12, resets_at: null, status: 'allowed' });
    });

    it('normalizes resetsAt given in epoch milliseconds down to seconds', () => {
        const result = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 5,
            resetsAt: 1_770_007_200_000,
        }, NOW);

        expect(result?.five_hour?.resets_at).toBe(1_770_007_200);
    });

    it('merges utilization-less events (real-world setup-token payloads), carrying status', () => {
        const result = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            resetsAt: 1_781_164_800,
        }, NOW);

        expect(result).toEqual({
            five_hour: { used_percentage: null, resets_at: 1_781_164_800, status: 'allowed' },
            seven_day: null,
            updated_at: NOW,
        });
    });

    it('keeps the last-known used_percentage when an event carries none (Claude Code merge rule)', () => {
        const prev: RateLimitsSnapshot = {
            five_hour: { used_percentage: 15, resets_at: 1_770_007_200 },
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW - 60_000,
        };

        const result = mergeRateLimitEvent(prev, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            resetsAt: 1_770_010_800,
        }, NOW);

        expect(result).toEqual({
            five_hour: { used_percentage: 15, resets_at: 1_770_010_800, status: 'allowed' },
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW,
        });
    });

    it('keeps the last-known resets_at when an event carries none', () => {
        const prev: RateLimitsSnapshot = {
            five_hour: null,
            seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
            updated_at: NOW - 60_000,
        };

        const result = mergeRateLimitEvent(prev, {
            status: 'allowed_warning',
            rateLimitType: 'seven_day',
        }, NOW);

        expect(result?.seven_day).toEqual({
            used_percentage: 54,
            resets_at: 1_770_400_000,
            status: 'allowed_warning',
        });
    });

    it('returns null (no update) for overage claims or a missing claim type', () => {
        expect(mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'overage',
            utilization: 90,
        }, NOW)).toBeNull();

        expect(mergeRateLimitEvent(null, {
            status: 'allowed',
            utilization: 30,
        }, NOW)).toBeNull();
    });
});

describe('toLegacyRateLimits', () => {
    it('converts the CC-shaped snapshot to the pre-statusLine camelCase/ISO mirror', () => {
        const legacy = toLegacyRateLimits({
            five_hour: { used_percentage: 42, resets_at: 1_770_007_200, status: 'allowed' },
            seven_day: { used_percentage: 71, resets_at: null },
            updated_at: NOW,
        });

        expect(legacy).toEqual({
            fiveHour: { utilization: 42, resetsAt: new Date(1_770_007_200_000).toISOString(), status: 'allowed' },
            sevenDay: { utilization: 71, resetsAt: null },
            updatedAt: NOW,
        });
    });

    it('passes absent windows through as null', () => {
        const legacy = toLegacyRateLimits({
            five_hour: { used_percentage: 10, resets_at: null },
            updated_at: NOW,
        });
        expect(legacy.sevenDay).toBeNull();
    });
});
