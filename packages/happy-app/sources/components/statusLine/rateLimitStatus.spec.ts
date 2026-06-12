import { describe, it, expect } from 'vitest';
import { paceSeverity, formatResetCountdown, getRateLimitStatus, selectRateLimits } from './rateLimitStatus';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-06-11T12:00:00Z');
const epoch = (offsetMs: number) => Math.round((NOW + offsetMs) / 1000);

describe('paceSeverity', () => {
    it('equals used% doubled at the window midpoint', () => {
        expect(paceSeverity(50, 2.5 * HOUR, 5 * HOUR)).toBe(100);
    });

    it('reads green for a lightly-used window near reset (the false-amber fix)', () => {
        expect(paceSeverity(42, 0.1 * HOUR, 5 * HOUR)).toBeLessThan(50);
    });

    it('floors elapsed time for a just-reset window instead of exploding', () => {
        expect(paceSeverity(5, 4.95 * HOUR, 5 * HOUR)).toBe(50);
    });

    it('clamps runaway projections to 200', () => {
        expect(paceSeverity(90, 4 * HOUR, 5 * HOUR)).toBe(200);
    });

    it('falls back to used% doubled without a reset timestamp', () => {
        expect(paceSeverity(70, null, 5 * HOUR)).toBe(140);
    });
});

describe('formatResetCountdown', () => {
    it('renders days, hours, and minutes tiers', () => {
        expect(formatResetCountdown(5 * DAY)).toBe('~5d');
        expect(formatResetCountdown(3 * HOUR)).toBe('~3h');
        expect(formatResetCountdown(45 * 60 * 1000)).toBe('45m');
    });

    it('never renders zero minutes', () => {
        expect(formatResetCountdown(10 * 1000)).toBe('1m');
    });
});

describe('selectRateLimits', () => {
    it('prefers the Claude Code-shaped statusLine.rate_limits when present', () => {
        const selected = selectRateLimits({
            statusLine: {
                rate_limits: { five_hour: { used_percentage: 42, resets_at: epoch(2 * HOUR) } },
                updated_at: NOW,
            },
            rateLimits: {
                fiveHour: { utilization: 99, resetsAt: new Date(NOW + HOUR).toISOString() },
                updatedAt: NOW,
            },
        });
        expect(selected).toEqual({ five_hour: { used_percentage: 42, resets_at: epoch(2 * HOUR) } });
    });

    it('adapts the legacy camelCase/ISO rateLimits field from old CLIs', () => {
        const selected = selectRateLimits({
            rateLimits: {
                fiveHour: { utilization: 42, resetsAt: new Date(NOW + 2 * HOUR).toISOString(), status: 'allowed' },
                sevenDay: { utilization: 71, resetsAt: null },
                updatedAt: NOW,
            },
        });
        expect(selected).toEqual({
            five_hour: { used_percentage: 42, resets_at: epoch(2 * HOUR), status: 'allowed' },
            seven_day: { used_percentage: 71, resets_at: null },
        });
    });

    it('returns null when neither field carries data', () => {
        expect(selectRateLimits(undefined)).toBeNull();
        expect(selectRateLimits({})).toBeNull();
        expect(selectRateLimits({ statusLine: { updated_at: NOW } })).toBeNull();
    });
});

describe('getRateLimitStatus', () => {
    const snapshot = {
        five_hour: { used_percentage: 42, resets_at: epoch(2 * HOUR) },
        seven_day: { used_percentage: 71, resets_at: epoch(5 * DAY) },
    };

    it('renders both windows in statusline format when always shown', () => {
        const status = getRateLimitStatus(snapshot, true, NOW);
        expect(status?.segments.map((s) => s.text)).toEqual(['42%(~2h)', '71%(~5d)']);
    });

    it('hides everything without a 5h datum — the 7d window never shows alone', () => {
        expect(getRateLimitStatus({ ...snapshot, five_hour: undefined }, true, NOW)).toBeNull();
        expect(getRateLimitStatus({ ...snapshot, five_hour: { used_percentage: null, resets_at: null } }, true, NOW)).toBeNull();
    });

    it('hides a calm snapshot unless always-show is on', () => {
        const calm = {
            five_hour: { used_percentage: 42, resets_at: epoch(2 * HOUR) },
            seven_day: { used_percentage: 71, resets_at: epoch(1 * DAY) },
        };
        expect(getRateLimitStatus(calm, false, NOW)).toBeNull();
        expect(getRateLimitStatus(calm, true, NOW)).not.toBeNull();
    });

    it('auto-appears once pace turns orange even when always-show is off', () => {
        const hot = { ...snapshot, five_hour: { used_percentage: 90, resets_at: epoch(2 * HOUR) } };
        expect(getRateLimitStatus(hot, false, NOW)).not.toBeNull();
    });

    it('drops a window whose reset already passed (stale snapshot)', () => {
        const stale5h = { ...snapshot, five_hour: { used_percentage: 80, resets_at: epoch(-10 * 60 * 1000) } };
        expect(getRateLimitStatus(stale5h, true, NOW)).toBeNull();
        const stale7d = { ...snapshot, seven_day: { used_percentage: 80, resets_at: epoch(-10 * 60 * 1000) } };
        expect(getRateLimitStatus(stale7d, true, NOW)?.segments).toHaveLength(1);
    });

    it('renders a countdown-only segment for utilization-less token-session windows, coloured by status', () => {
        const tokenSnapshot = {
            five_hour: { used_percentage: null, resets_at: epoch(2 * HOUR), status: 'allowed' as const },
        };
        const status = getRateLimitStatus(tokenSnapshot, true, NOW);
        expect(status?.segments.map((s) => s.text)).toEqual(['~2h']);
        expect(status?.segments[0].color).toBe('#2d963c');

        const warning = getRateLimitStatus({
            five_hour: { ...tokenSnapshot.five_hour, status: 'allowed_warning' as const },
        }, true, NOW);
        expect(warning?.segments[0].color).toBe('#c16428');

        const rejected = getRateLimitStatus({
            five_hour: { ...tokenSnapshot.five_hour, status: 'rejected' as const },
        }, true, NOW);
        expect(rejected?.segments[0].color).toBe('#de3c34');
    });

    it('auto-shows utilization-less windows on warning or rejection, hides calm ones', () => {
        const calm = {
            five_hour: { used_percentage: null, resets_at: epoch(2 * HOUR), status: 'allowed' as const },
        };
        expect(getRateLimitStatus(calm, false, NOW)).toBeNull();
        const warning = {
            five_hour: { ...calm.five_hour, status: 'allowed_warning' as const },
        };
        expect(getRateLimitStatus(warning, false, NOW)).not.toBeNull();
    });

    it('handles missing snapshots', () => {
        expect(getRateLimitStatus(null, true, NOW)).toBeNull();
        expect(getRateLimitStatus(undefined, true, NOW)).toBeNull();
    });
});
