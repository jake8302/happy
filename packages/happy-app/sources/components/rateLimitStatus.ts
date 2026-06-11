/**
 * Plan rate-limit segments for the AgentInput status row.
 *
 * Each window renders its RAW used % plus a compact reset countdown
 * (`42%(~2h)`), but is COLOURED by pace: the current burn extrapolated to the
 * window's reset. projected% = used% / elapsed_fraction — 100% projected
 * (you'd spend the whole budget exactly at reset) sits at amber and 200%+
 * (you'd be blocked before reset) at the worst red. Near reset a lightly-used
 * window reads green because a fresh budget is seconds away; raw-fullness
 * colouring would render that false-amber (42% used with minutes left is
 * completely safe).
 */
import type { Metadata } from '@/sync/storageTypes';

export type RateLimitSegment = { text: string; color: string };
export type RateLimitStatus = { segments: RateLimitSegment[] };

type RateLimitWindow = { utilization: number | null; resetsAt: string | null } | null | undefined;

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// A just-reset window's near-zero elapsed time would explode the pace ratio.
const MIN_ELAPSED = 0.1;

// Without the always-show setting, the segment only appears once either
// window's projected end-of-window usage crosses into orange territory.
const AUTO_SHOW_SEVERITY = 150;

/**
 * Severity gradient stops over the 0..200 pace scale: green -> amber(100) ->
 * orange(150) -> red(200). Severity is carried by hue at near-constant mid
 * luminance so every interpolated point stays legible on both the light and
 * dark themes.
 */
const GRADIENT_STOPS: Array<[number, [number, number, number]]> = [
    [0, [45, 150, 60]],
    [100, [150, 120, 28]],
    [150, [193, 100, 40]],
    [200, [222, 60, 52]],
];

export function gradientColor(pos: number): string {
    const stops = GRADIENT_STOPS;
    let rgb = stops[stops.length - 1][1];
    if (pos <= stops[0][0]) {
        rgb = stops[0][1];
    } else if (pos < stops[stops.length - 1][0]) {
        for (let i = 0; i < stops.length - 1; i++) {
            const [loPos, loRgb] = stops[i];
            const [hiPos, hiRgb] = stops[i + 1];
            if (pos >= loPos && pos <= hiPos) {
                const t = (pos - loPos) / (hiPos - loPos);
                rgb = [
                    Math.round(loRgb[0] + (hiRgb[0] - loRgb[0]) * t),
                    Math.round(loRgb[1] + (hiRgb[1] - loRgb[1]) * t),
                    Math.round(loRgb[2] + (hiRgb[2] - loRgb[2]) * t),
                ];
                break;
            }
        }
    }
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/**
 * Map a window onto the 0..200 gradient scale by projected end-of-window
 * usage. With no reset timestamp to derive elapsed time from, falls back to
 * used% doubled (the window-midpoint equivalent).
 */
export function paceSeverity(usedPct: number, remainingMs: number | null, windowMs: number): number {
    if (remainingMs === null) {
        return Math.max(0, Math.min(200, Math.round(usedPct * 2)));
    }
    const elapsed = Math.max(MIN_ELAPSED, 1 - remainingMs / windowMs);
    return Math.max(0, Math.min(200, Math.round(usedPct / elapsed)));
}

export function formatResetCountdown(remainingMs: number): string {
    const remainingM = Math.max(1, Math.round(remainingMs / 60000));
    if (remainingM >= 24 * 60) return `~${Math.round(remainingM / (24 * 60))}d`;
    if (remainingM >= 60) return `~${Math.round(remainingM / 60)}h`;
    return `${remainingM}m`;
}

function windowSegment(w: RateLimitWindow, windowMs: number, nowMs: number): (RateLimitSegment & { severity: number }) | null {
    if (!w || w.utilization == null) return null;
    let remainingMs: number | null = null;
    if (w.resetsAt) {
        const resetMs = Date.parse(w.resetsAt);
        if (Number.isFinite(resetMs)) {
            // A reset in the past means the snapshot predates the window
            // rolling over — the stored utilization is no longer true.
            if (resetMs <= nowMs) return null;
            remainingMs = resetMs - nowMs;
        }
    }
    const severity = paceSeverity(w.utilization, remainingMs, windowMs);
    const countdown = remainingMs !== null ? `(${formatResetCountdown(remainingMs)})` : '';
    return {
        text: `${Math.round(w.utilization)}%${countdown}`,
        color: gradientColor(severity),
        severity,
    };
}

/**
 * Build the displayable rate-limit segments (5h first, then 7d), or null when
 * there is nothing to show. The 7d window never shows on its own — without a
 * live 5h datum the whole segment is hidden. When `alwaysShow` is off, the
 * segment still auto-appears once either window's pace turns orange.
 */
export function getRateLimitStatus(
    rateLimits: Metadata['rateLimits'],
    alwaysShow: boolean,
    nowMs: number = Date.now(),
): RateLimitStatus | null {
    const five = windowSegment(rateLimits?.fiveHour, FIVE_HOURS_MS, nowMs);
    if (!five) return null;
    const seven = windowSegment(rateLimits?.sevenDay, SEVEN_DAYS_MS, nowMs);
    const withSeverity = seven ? [five, seven] : [five];
    if (!alwaysShow && !withSeverity.some((s) => s.severity >= AUTO_SHOW_SEVERITY)) return null;
    return { segments: withSeverity.map(({ text, color }) => ({ text, color })) };
}
