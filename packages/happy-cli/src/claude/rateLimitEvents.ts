/**
 * Rate-limit snapshot store: merges partial updates from any producer
 * (SDK `rate_limit_event` stream messages, `get_usage` control requests,
 * header probes) into a RateLimitsSnapshot.
 *
 * Merge rule — mirroring Claude Code's own header cache: fields an update
 * omits keep their last-known value rather than erasing it. Events from
 * setup-token sessions often carry only status + reset; probes carry only
 * utilization + reset. Neither should clobber what the other learned.
 */
import type { RateLimitsSnapshot, RateLimitWindow } from '@/api/types';

export type RateLimitEventInfo = {
    status: 'allowed' | 'allowed_warning' | 'rejected',
    /** Epoch timestamp of the window reset — seconds or milliseconds depending on binary version. */
    resetsAt?: number,
    rateLimitType?: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage',
    /** Percentage of the window used, 0-100. */
    utilization?: number,
};

const EPOCH_MS_THRESHOLD = 1e12;

function toIso(resetsAt: number | undefined): string | null {
    if (resetsAt == null) return null;
    const ms = resetsAt < EPOCH_MS_THRESHOLD ? resetsAt * 1000 : resetsAt;
    return new Date(ms).toISOString();
}

function mergeWindow(
    prev: RateLimitWindow | null | undefined,
    update: Partial<RateLimitWindow>,
): RateLimitWindow {
    const status = update.status ?? prev?.status;
    return {
        utilization: update.utilization ?? prev?.utilization ?? null,
        resetsAt: update.resetsAt ?? prev?.resetsAt ?? null,
        ...(status !== undefined ? { status } : {}),
    };
}

/**
 * Merge per-window partial updates into the previous snapshot. Windows the
 * update does not mention pass through untouched.
 */
export function mergeRateLimitWindows(
    prev: RateLimitsSnapshot | null,
    updates: { fiveHour?: Partial<RateLimitWindow>, sevenDay?: Partial<RateLimitWindow> },
    now: number,
): RateLimitsSnapshot {
    return {
        fiveHour: updates.fiveHour ? mergeWindow(prev?.fiveHour, updates.fiveHour) : prev?.fiveHour ?? null,
        sevenDay: updates.sevenDay ? mergeWindow(prev?.sevenDay, updates.sevenDay) : prev?.sevenDay ?? null,
        updatedAt: now,
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
    if (info.utilization != null) update.utilization = info.utilization;
    const resetsAt = toIso(info.resetsAt);
    if (resetsAt !== null) update.resetsAt = resetsAt;

    const windowKey = info.rateLimitType === 'five_hour' ? 'fiveHour' : 'sevenDay';
    return mergeRateLimitWindows(prev, { [windowKey]: update }, now);
}
