/**
 * Rate-limit snapshot store: merges partial updates from any producer
 * (SDK `rate_limit_event` stream messages, `get_usage` control requests,
 * header probes) into a RateLimitsSnapshot shaped exactly like Claude
 * Code's statusline `rate_limits` payload (five_hour/seven_day windows,
 * used_percentage 0-100, resets_at epoch seconds).
 *
 * Merge rule — mirroring Claude Code's own header cache: fields an update
 * omits keep their last-known value rather than erasing it. Events from
 * setup-token sessions often carry only status + reset; probes carry only
 * used_percentage + reset. Neither should clobber what the other learned.
 */
import type { LegacyRateLimitsSnapshot, RateLimitsSnapshot, RateLimitWindow } from '@/api/types';

export type RateLimitEventInfo = {
    status: 'allowed' | 'allowed_warning' | 'rejected',
    /** Epoch timestamp of the window reset — seconds or milliseconds depending on binary version. */
    resetsAt?: number,
    rateLimitType?: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage',
    /** Percentage of the window used, 0-100. */
    utilization?: number,
};

const EPOCH_MS_THRESHOLD = 1e12;

/**
 * Normalize a reset timestamp to epoch seconds (Claude Code's wire unit).
 * Accepts epoch seconds, epoch milliseconds, or an ISO string (the
 * `get_usage` control response carries ISO).
 */
export function toEpochSeconds(resetsAt: number | string | null | undefined): number | null {
    if (resetsAt == null) return null;
    const value = typeof resetsAt === 'string' ? Date.parse(resetsAt) / 1000 : resetsAt;
    if (!Number.isFinite(value)) return null;
    return Math.round(value >= EPOCH_MS_THRESHOLD ? value / 1000 : value);
}

function mergeWindow(
    prev: RateLimitWindow | null | undefined,
    update: Partial<RateLimitWindow>,
): RateLimitWindow {
    const status = update.status ?? prev?.status;
    return {
        used_percentage: update.used_percentage ?? prev?.used_percentage ?? null,
        resets_at: update.resets_at ?? prev?.resets_at ?? null,
        ...(status !== undefined ? { status } : {}),
    };
}

/**
 * Merge per-window partial updates into the previous snapshot. Windows the
 * update does not mention pass through untouched.
 */
export function mergeRateLimitWindows(
    prev: RateLimitsSnapshot | null,
    updates: { five_hour?: Partial<RateLimitWindow>, seven_day?: Partial<RateLimitWindow> },
    now: number,
): RateLimitsSnapshot {
    return {
        five_hour: updates.five_hour ? mergeWindow(prev?.five_hour, updates.five_hour) : prev?.five_hour ?? null,
        seven_day: updates.seven_day ? mergeWindow(prev?.seven_day, updates.seven_day) : prev?.seven_day ?? null,
        updated_at: now,
    };
}

/**
 * Adapt an SDK rate_limit_event onto the snapshot store. Returns null when
 * the event carries nothing usable (overage claims, or no claim type to
 * attribute it to).
 */
export function mergeRateLimitEvent(
    prev: RateLimitsSnapshot | null,
    info: RateLimitEventInfo,
    now: number,
): RateLimitsSnapshot | null {
    if (info.rateLimitType == null || info.rateLimitType === 'overage') {
        return null;
    }
    const update: Partial<RateLimitWindow> = {
        status: info.status,
    };
    if (info.utilization != null) update.used_percentage = info.utilization;
    const resetsAt = toEpochSeconds(info.resetsAt);
    if (resetsAt !== null) update.resets_at = resetsAt;

    const windowKey = info.rateLimitType === 'five_hour' ? 'five_hour' : 'seven_day';
    return mergeRateLimitWindows(prev, { [windowKey]: update }, now);
}

function toLegacyWindow(window: RateLimitWindow | null | undefined): LegacyRateLimitsSnapshot['fiveHour'] {
    if (window == null) return null;
    return {
        utilization: window.used_percentage,
        resetsAt: window.resets_at !== null ? new Date(window.resets_at * 1000).toISOString() : null,
        ...(window.status !== undefined ? { status: window.status } : {}),
    };
}

/**
 * Deprecated mirror for webapps that predate the `statusLine` metadata
 * field (camelCase keys, ISO resetsAt). Remove once all clients read
 * `statusLine.rate_limits`.
 */
export function toLegacyRateLimits(snapshot: RateLimitsSnapshot): LegacyRateLimitsSnapshot {
    return {
        fiveHour: toLegacyWindow(snapshot.five_hour),
        sevenDay: toLegacyWindow(snapshot.seven_day),
        updatedAt: snapshot.updated_at,
    };
}
