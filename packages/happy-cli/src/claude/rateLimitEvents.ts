/**
 * Maps SDK `rate_limit_event` stream messages onto RateLimitsSnapshot.
 *
 * These events are parsed by Claude Code from the `anthropic-ratelimit-unified-*`
 * headers on inference responses, so they work under any auth that can call the
 * API — including setup tokens (CLAUDE_CODE_OAUTH_TOKEN), which lack the
 * `user:profile` scope that the richer `get_usage` control request needs.
 *
 * Each event carries only the representative (currently binding) window, so we
 * merge into the previous snapshot instead of replacing it.
 */
import type { RateLimitsSnapshot } from '@/api/types';

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

/**
 * Returns an updated snapshot, or null when the event carries nothing usable
 * (overage claims, missing utilization, or no claim type to attribute it to).
 */
export function mergeRateLimitEvent(
    prev: RateLimitsSnapshot | null,
    info: RateLimitEventInfo,
    now: number,
): RateLimitsSnapshot | null {
    if (info.utilization == null || info.rateLimitType == null || info.rateLimitType === 'overage') {
        return null;
    }
    const window = { utilization: info.utilization, resetsAt: toIso(info.resetsAt) };
    if (info.rateLimitType === 'five_hour') {
        return { fiveHour: window, sevenDay: prev?.sevenDay ?? null, updatedAt: now };
    }
    return { fiveHour: prev?.fiveHour ?? null, sevenDay: window, updatedAt: now };
}
