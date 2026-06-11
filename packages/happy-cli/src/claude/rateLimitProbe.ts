/**
 * Header-derived rate-limit probe for setup-token sessions.
 *
 * The SDK's get_usage control request needs the `user:profile` scope, which
 * setup tokens (CLAUDE_CODE_OAUTH_TOKEN) lack — so it returns
 * `rate_limits_available: false` (or rejects), leaving the app's status row
 * without window percentages. But every inference response carries the full
 * `anthropic-ratelimit-unified-*` header set under any auth.
 *
 * This mirrors Claude Code's own `quota_check`: a throwaway `max_tokens: 1`
 * message whose only purpose is to read the rate-limit headers off the
 * response. It runs on the session's own setup token, so it consumes that
 * account's subscription quota (~1 token) rather than incurring API cost.
 */
import type { RateLimitsSnapshot, RateLimitWindow } from '@/api/types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

// The cheapest universally-available model — the call generates 1 output token
// and is discarded, so the model only needs to be one the account can reach.
const PROBE_MODEL = 'claude-haiku-4-5-20251001';

// OAuth/subscription tokens reject requests that don't present the Claude Code
// identity, so the probe must spoof it exactly as the real binary does.
const PROBE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";

// Epoch values below this are seconds; at or above, already milliseconds.
const EPOCH_MS_THRESHOLD = 1e12;

type HeaderBag = { get(name: string): string | null };

function resetToIso(raw: string | null): string | null {
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const ms = n < EPOCH_MS_THRESHOLD ? n * 1000 : n;
    return new Date(ms).toISOString();
}

function windowFromHeaders(headers: HeaderBag, abbrev: string): RateLimitWindow | null {
    const rawUtil = headers.get(`anthropic-ratelimit-unified-${abbrev}-utilization`);
    if (rawUtil === null) return null;
    const frac = Number(rawUtil);
    if (!Number.isFinite(frac)) return null;
    // Headers express utilization as a 0-1 fraction; the snapshot/app contract
    // is a 0-100 percentage (one decimal keeps it clean past float noise).
    const utilization = Math.round(frac * 1000) / 10;
    const resetsAt = resetToIso(headers.get(`anthropic-ratelimit-unified-${abbrev}-reset`));
    return { utilization, resetsAt };
}

/**
 * Parse a unified rate-limit header set into a snapshot, or null when neither
 * window carries a utilization figure (nothing worth pushing).
 */
export function parseRateLimitHeaders(headers: HeaderBag, now: number): RateLimitsSnapshot | null {
    const fiveHour = windowFromHeaders(headers, '5h');
    const sevenDay = windowFromHeaders(headers, '7d');
    if (!fiveHour && !sevenDay) return null;
    return { fiveHour, sevenDay, updatedAt: now };
}

export type ProbeOptions = {
    token: string,
    baseUrl?: string,
    model?: string,
    signal?: AbortSignal,
};

/**
 * Fire the quota probe and return the parsed snapshot, or null on any failure
 * (network error, or a response without usable rate-limit headers). The
 * rate-limit headers ride both 200 and 429 responses, so headers are parsed
 * regardless of status; only a thrown fetch or unparseable headers yield null.
 */
export async function probeRateLimits(
    opts: ProbeOptions,
    fetchImpl: typeof fetch = fetch,
    now: number = Date.now(),
): Promise<RateLimitsSnapshot | null> {
    const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    try {
        const res = await fetchImpl(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${opts.token}`,
                'anthropic-beta': 'oauth-2025-04-20',
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: opts.model ?? PROBE_MODEL,
                max_tokens: 1,
                system: PROBE_SYSTEM,
                messages: [{ role: 'user', content: 'quota' }],
            }),
            signal: opts.signal,
        });
        return parseRateLimitHeaders(res.headers, now);
    } catch {
        return null;
    }
}
