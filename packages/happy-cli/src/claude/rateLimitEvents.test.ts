import { describe, expect, it } from 'vitest';
import { mergeRateLimitEvent, mergeRateLimitWindows } from './rateLimitEvents';
import type { RateLimitsSnapshot } from '@/api/types';

const NOW = 1_770_000_000_000;

describe('mergeRateLimitWindows', () => {
    it('fills utilization from a probe-style update while keeping the event-carried status', () => {
        const prev: RateLimitsSnapshot = {
            fiveHour: { utilization: null, resetsAt: '2026-02-02T02:00:00.000Z', status: 'allowed_warning' },
            sevenDay: null,
            updatedAt: NOW - 60_000,
        };

        const result = mergeRateLimitWindows(prev, {
            fiveHour: { utilization: 15, resetsAt: '2026-02-02T03:00:00.000Z' },
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
        }, NOW);

        expect(result).toEqual({
            fiveHour: { utilization: 15, resetsAt: '2026-02-02T03:00:00.000Z', status: 'allowed_warning' },
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW,
        });
    });

    it('leaves windows the update does not mention untouched', () => {
        const prev: RateLimitsSnapshot = {
            fiveHour: { utilization: 15, resetsAt: '2026-02-02T02:00:00.000Z' },
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW - 60_000,
        };

        const result = mergeRateLimitWindows(prev, {
            fiveHour: { utilization: 16 },
        }, NOW);

        expect(result).toEqual({
            fiveHour: { utilization: 16, resetsAt: '2026-02-02T02:00:00.000Z' },
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW,
        });
    });

    it('builds windows from scratch when there is no previous snapshot', () => {
        const result = mergeRateLimitWindows(null, {
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
        }, NOW);

        expect(result).toEqual({
            fiveHour: null,
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW,
        });
    });
});

describe('mergeRateLimitEvent', () => {
    it('creates a five-hour window from scratch, converting epoch-seconds resetsAt to ISO', () => {
        const result = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 42,
            resetsAt: 1_770_007_200,
        }, NOW);

        expect(result).toEqual({
            fiveHour: { utilization: 42, resetsAt: new Date(1_770_007_200_000).toISOString(), status: 'allowed' },
            sevenDay: null,
            updatedAt: NOW,
        });
    });

    it('merges a seven-day event over a previous snapshot, preserving the five-hour window', () => {
        const prev: RateLimitsSnapshot = {
            fiveHour: { utilization: 42, resetsAt: '2026-02-02T02:00:00.000Z' },
            sevenDay: null,
            updatedAt: NOW - 60_000,
        };

        const result = mergeRateLimitEvent(prev, {
            status: 'allowed_warning',
            rateLimitType: 'seven_day',
            utilization: 71,
            resetsAt: 1_770_400_000,
        }, NOW);

        expect(result).toEqual({
            fiveHour: { utilization: 42, resetsAt: '2026-02-02T02:00:00.000Z' },
            sevenDay: { utilization: 71, resetsAt: new Date(1_770_400_000_000).toISOString(), status: 'allowed_warning' },
            updatedAt: NOW,
        });
    });

    it('maps model-specific seven-day claims onto the seven-day window', () => {
        const opus = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'seven_day_opus',
            utilization: 55,
        }, NOW);
        expect(opus?.sevenDay).toEqual({ utilization: 55, resetsAt: null, status: 'allowed' });

        const sonnet = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'seven_day_sonnet',
            utilization: 12,
        }, NOW);
        expect(sonnet?.sevenDay).toEqual({ utilization: 12, resetsAt: null, status: 'allowed' });
    });

    it('accepts resetsAt already in epoch milliseconds', () => {
        const result = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            utilization: 5,
            resetsAt: 1_770_007_200_000,
        }, NOW);

        expect(result?.fiveHour?.resetsAt).toBe(new Date(1_770_007_200_000).toISOString());
    });

    it('merges utilization-less events (real-world setup-token payloads), carrying status', () => {
        const result = mergeRateLimitEvent(null, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            resetsAt: 1_781_164_800,
        }, NOW);

        expect(result).toEqual({
            fiveHour: { utilization: null, resetsAt: new Date(1_781_164_800_000).toISOString(), status: 'allowed' },
            sevenDay: null,
            updatedAt: NOW,
        });
    });

    it('keeps the last-known utilization when an event carries none (Claude Code merge rule)', () => {
        const prev: RateLimitsSnapshot = {
            fiveHour: { utilization: 15, resetsAt: '2026-02-02T02:00:00.000Z' },
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW - 60_000,
        };

        const result = mergeRateLimitEvent(prev, {
            status: 'allowed',
            rateLimitType: 'five_hour',
            resetsAt: 1_770_007_200,
        }, NOW);

        expect(result).toEqual({
            fiveHour: { utilization: 15, resetsAt: new Date(1_770_007_200_000).toISOString(), status: 'allowed' },
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW,
        });
    });

    it('keeps the last-known resetsAt when an event carries none', () => {
        const prev: RateLimitsSnapshot = {
            fiveHour: null,
            sevenDay: { utilization: 54, resetsAt: '2026-02-05T02:00:00.000Z' },
            updatedAt: NOW - 60_000,
        };

        const result = mergeRateLimitEvent(prev, {
            status: 'allowed_warning',
            rateLimitType: 'seven_day',
        }, NOW);

        expect(result?.sevenDay).toEqual({
            utilization: 54,
            resetsAt: '2026-02-05T02:00:00.000Z',
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
