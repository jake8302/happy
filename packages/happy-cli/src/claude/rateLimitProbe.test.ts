import { describe, expect, it, vi } from 'vitest';
import { parseRateLimitHeaders, probeRateLimits } from './rateLimitProbe';

const NOW = 1_770_000_000_000;

function headers(map: Record<string, string>): Headers {
    return new Headers(map);
}

describe('parseRateLimitHeaders', () => {
    it('converts 0-1 fractions to 0-100 percentages and epoch-seconds resets to ISO', () => {
        const result = parseRateLimitHeaders(headers({
            'anthropic-ratelimit-unified-5h-utilization': '0.03',
            'anthropic-ratelimit-unified-5h-reset': '1781182800',
            'anthropic-ratelimit-unified-7d-utilization': '0.35',
            'anthropic-ratelimit-unified-7d-reset': '1781496000',
        }), NOW);

        expect(result).toEqual({
            fiveHour: { utilization: 3, resetsAt: new Date(1781182800_000).toISOString() },
            sevenDay: { utilization: 35, resetsAt: new Date(1781496000_000).toISOString() },
            updatedAt: NOW,
        });
    });

    it('keeps one decimal of precision past float noise', () => {
        const result = parseRateLimitHeaders(headers({
            'anthropic-ratelimit-unified-5h-utilization': '0.426',
            'anthropic-ratelimit-unified-5h-reset': '1781182800',
        }), NOW);
        expect(result?.fiveHour?.utilization).toBe(42.6);
    });

    it('includes a window with utilization but no reset (resetsAt null)', () => {
        const result = parseRateLimitHeaders(headers({
            'anthropic-ratelimit-unified-5h-utilization': '0.1',
        }), NOW);
        expect(result?.fiveHour).toEqual({ utilization: 10, resetsAt: null });
        expect(result?.sevenDay).toBeNull();
    });

    it('returns null when neither window carries a utilization header', () => {
        expect(parseRateLimitHeaders(headers({
            'anthropic-ratelimit-unified-5h-reset': '1781182800',
        }), NOW)).toBeNull();
        expect(parseRateLimitHeaders(headers({}), NOW)).toBeNull();
    });

    it('ignores a malformed utilization value', () => {
        expect(parseRateLimitHeaders(headers({
            'anthropic-ratelimit-unified-5h-utilization': 'nope',
        }), NOW)).toBeNull();
    });
});

describe('probeRateLimits', () => {
    it('posts a max_tokens:1 quota probe with OAuth headers and parses the response headers', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            headers: headers({
                'anthropic-ratelimit-unified-5h-utilization': '0.03',
                'anthropic-ratelimit-unified-5h-reset': '1781182800',
            }),
        } as Response);

        const result = await probeRateLimits({ token: 'sk-ant-oat-xxx' }, fetchImpl, NOW);

        expect(result?.fiveHour).toEqual({ utilization: 3, resetsAt: new Date(1781182800_000).toISOString() });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-ant-oat-xxx');
        expect((init.headers as Record<string, string>)['anthropic-beta']).toBe('oauth-2025-04-20');
        const body = JSON.parse(init.body as string);
        expect(body.max_tokens).toBe(1);
        expect(body.messages).toEqual([{ role: 'user', content: 'quota' }]);
        expect(body.system).toContain('Claude Code');
    });

    it('respects a custom base URL and strips a trailing slash', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ headers: headers({}) } as Response);
        await probeRateLimits({ token: 't', baseUrl: 'http://127.0.0.1:3456/' }, fetchImpl, NOW);
        expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:3456/v1/messages');
    });

    it('returns null when the fetch throws', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
        expect(await probeRateLimits({ token: 't' }, fetchImpl, NOW)).toBeNull();
    });
});
