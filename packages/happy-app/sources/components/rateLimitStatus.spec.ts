import { describe, it, expect } from 'vitest';
import { paceSeverity, gradientColor, formatResetCountdown, getRateLimitStatus } from './rateLimitStatus';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-06-11T12:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

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

describe('gradientColor', () => {
    it('pins the scale endpoints to the theme stops', () => {
        expect(gradientColor(0)).toBe('rgb(45, 150, 60)');
        expect(gradientColor(100)).toBe('rgb(150, 120, 28)');
        expect(gradientColor(200)).toBe('rgb(222, 60, 52)');
    });

    it('clamps positions outside the scale', () => {
        expect(gradientColor(-50)).toBe(gradientColor(0));
        expect(gradientColor(400)).toBe(gradientColor(200));
    });

    it('interpolates between stops', () => {
        expect(gradientColor(50)).toBe('rgb(98, 135, 44)');
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

describe('getRateLimitStatus', () => {
    const snapshot = {
        fiveHour: { utilization: 42, resetsAt: iso(2 * HOUR) },
        sevenDay: { utilization: 71, resetsAt: iso(5 * DAY) },
        updatedAt: NOW,
    };

    it('renders both windows in statusline format when always shown', () => {
        const status = getRateLimitStatus(snapshot, true, NOW);
        expect(status?.segments.map((s) => s.text)).toEqual(['42%(~2h)', '71%(~5d)']);
    });

    it('hides everything without a 5h datum — the 7d window never shows alone', () => {
        expect(getRateLimitStatus({ ...snapshot, fiveHour: null }, true, NOW)).toBeNull();
        expect(getRateLimitStatus({ ...snapshot, fiveHour: { utilization: null, resetsAt: null } }, true, NOW)).toBeNull();
    });

    it('hides a calm snapshot unless always-show is on', () => {
        const calm = {
            fiveHour: { utilization: 42, resetsAt: iso(2 * HOUR) },
            sevenDay: { utilization: 71, resetsAt: iso(1 * DAY) },
            updatedAt: NOW,
        };
        expect(getRateLimitStatus(calm, false, NOW)).toBeNull();
        expect(getRateLimitStatus(calm, true, NOW)).not.toBeNull();
    });

    it('auto-appears once pace turns orange even when always-show is off', () => {
        const hot = { ...snapshot, fiveHour: { utilization: 90, resetsAt: iso(2 * HOUR) } };
        expect(getRateLimitStatus(hot, false, NOW)).not.toBeNull();
    });

    it('drops a window whose reset already passed (stale snapshot)', () => {
        const stale5h = { ...snapshot, fiveHour: { utilization: 80, resetsAt: iso(-10 * 60 * 1000) } };
        expect(getRateLimitStatus(stale5h, true, NOW)).toBeNull();
        const stale7d = { ...snapshot, sevenDay: { utilization: 80, resetsAt: iso(-10 * 60 * 1000) } };
        expect(getRateLimitStatus(stale7d, true, NOW)?.segments).toHaveLength(1);
    });

    it('renders a countdown-only segment for utilization-less token-session windows, coloured by status', () => {
        const tokenSnapshot = {
            fiveHour: { utilization: null, resetsAt: iso(2 * HOUR), status: 'allowed' as const },
            sevenDay: null,
            updatedAt: NOW,
        };
        const status = getRateLimitStatus(tokenSnapshot, true, NOW);
        expect(status?.segments.map((s) => s.text)).toEqual(['~2h']);
        expect(status?.segments[0].color).toBe('rgb(45, 150, 60)');

        const warning = getRateLimitStatus({
            ...tokenSnapshot,
            fiveHour: { ...tokenSnapshot.fiveHour, status: 'allowed_warning' as const },
        }, true, NOW);
        expect(warning?.segments[0].color).toBe('rgb(193, 100, 40)');

        const rejected = getRateLimitStatus({
            ...tokenSnapshot,
            fiveHour: { ...tokenSnapshot.fiveHour, status: 'rejected' as const },
        }, true, NOW);
        expect(rejected?.segments[0].color).toBe('rgb(222, 60, 52)');
    });

    it('auto-shows utilization-less windows on warning or rejection, hides calm ones', () => {
        const calm = {
            fiveHour: { utilization: null, resetsAt: iso(2 * HOUR), status: 'allowed' as const },
            sevenDay: null,
            updatedAt: NOW,
        };
        expect(getRateLimitStatus(calm, false, NOW)).toBeNull();
        const warning = {
            ...calm,
            fiveHour: { ...calm.fiveHour, status: 'allowed_warning' as const },
        };
        expect(getRateLimitStatus(warning, false, NOW)).not.toBeNull();
    });

    it('handles missing snapshots', () => {
        expect(getRateLimitStatus(null, true, NOW)).toBeNull();
        expect(getRateLimitStatus(undefined, true, NOW)).toBeNull();
    });
});
