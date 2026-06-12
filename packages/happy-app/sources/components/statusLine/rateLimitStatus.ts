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
import { gradientColor } from './gradient';

export type RateLimitSegment = { text: string; color: string };
export type RateLimitStatus = { segments: RateLimitSegment[] };

/** Claude Code statusline shape: used_percentage 0-100, resets_at epoch seconds. */
type RateLimitWindow = { used_percentage: number | null; resets_at: number | null; status?: string | null } | null | undefined;
export type RateLimits = { five_hour?: RateLimitWindow; seven_day?: RateLimitWindow } | null | undefined;

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// A just-reset window's near-zero elapsed time would explode the pace ratio.
const MIN_ELAPSED = 0.1;

// Without the always-show setting, the segment only appears once either
// window's projected end-of-window usage crosses into orange territory.
const AUTO_SHOW_SEVERITY = 150;

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

// Setup-token sessions get header-derived status without a percentage —
// colour the bare countdown by standing instead of pace.
const STATUS_SEVERITY: Record<string, number> = {
    allowed: 0,
    allowed_warning: 150,
    rejected: 200,
};

function windowSegment(w: RateLimitWindow, windowMs: number, nowMs: number): (RateLimitSegment & { severity: number }) | null {
    if (!w) return null;
    let remainingMs: number | null = null;
    if (w.resets_at != null) {
        const resetMs = w.resets_at * 1000;
        // A reset in the past means the snapshot predates the window
        // rolling over — the stored data is no longer true.
        if (resetMs <= nowMs) return null;
        remainingMs = resetMs - nowMs;
    }
    if (w.used_percentage == null) {
        // No percentage (utilization-less rate_limit_event payloads): render
        // the reset countdown alone, coloured by the event's status.
        if (remainingMs === null) return null;
        const severity = STATUS_SEVERITY[w.status ?? 'allowed'] ?? 0;
        return {
            text: formatResetCountdown(remainingMs),
            color: gradientColor(severity),
            severity,
        };
    }
    const severity = paceSeverity(w.used_percentage, remainingMs, windowMs);
    const countdown = remainingMs !== null ? `(${formatResetCountdown(remainingMs)})` : '';
    return {
        text: `${Math.round(w.used_percentage)}%${countdown}`,
        color: gradientColor(severity),
        severity,
    };
}

function legacyWindow(w: { utilization: number | null; resetsAt: string | null; status?: string | null } | null | undefined): RateLimitWindow {
    if (!w) return undefined;
    const resetMs = w.resetsAt !== null ? Date.parse(w.resetsAt) : NaN;
    return {
        used_percentage: w.utilization,
        resets_at: Number.isFinite(resetMs) ? Math.round(resetMs / 1000) : null,
        ...(w.status != null ? { status: w.status } : {}),
    };
}

/**
 * Pick the rate-limit windows off session metadata: the Claude Code-shaped
 * `statusLine.rate_limits` when the CLI publishes it, else the deprecated
 * camelCase/ISO `rateLimits` mirror from old CLIs, adapted to the CC shape.
 */
export function selectRateLimits(metadata: Pick<Metadata, 'statusLine' | 'rateLimits'> | null | undefined): RateLimits {
    const modern = metadata?.statusLine?.rate_limits;
    if (modern) return modern;
    const legacy = metadata?.rateLimits;
    if (!legacy) return null;
    return {
        five_hour: legacyWindow(legacy.fiveHour),
        seven_day: legacyWindow(legacy.sevenDay),
    };
}

/**
 * Build the displayable rate-limit segments (5h first, then 7d), or null when
 * there is nothing to show. The 7d window never shows on its own — without a
 * live 5h datum the whole segment is hidden. When `alwaysShow` is off, the
 * segment still auto-appears once either window's pace turns orange.
 */
export function getRateLimitStatus(
    rateLimits: RateLimits,
    alwaysShow: boolean,
    nowMs: number = Date.now(),
): RateLimitStatus | null {
    const five = windowSegment(rateLimits?.five_hour, FIVE_HOURS_MS, nowMs);
    if (!five) return null;
    const seven = windowSegment(rateLimits?.seven_day, SEVEN_DAYS_MS, nowMs);
    const withSeverity = seven ? [five, seven] : [five];
    if (!alwaysShow && !withSeverity.some((s) => s.severity >= AUTO_SHOW_SEVERITY)) return null;
    return { segments: withSeverity.map(({ text, color }) => ({ text, color })) };
}
