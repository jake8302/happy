import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeRemote } from './claudeRemote';
import { query } from '@/claude/sdk';
import type { EnhancedMode } from './loop';

vi.mock('@/claude/sdk', () => ({
    query: vi.fn(),
    AbortError: class AbortError extends Error {},
}));

const mode: EnhancedMode = {
    permissionMode: 'default',
};

type RemoteOpts = Parameters<typeof claudeRemote>[0];

function baseOpts(overrides: Partial<RemoteOpts> = {}): RemoteOpts {
    return {
        sessionId: null,
        path: process.cwd(),
        allowedTools: [],
        hookSettingsPath: '/tmp/happy-test-settings.json',
        nextMessage: async () => null,
        onReady: vi.fn(),
        canCallTool: async () => ({ behavior: 'allow' }) as any,
        isAborted: () => false,
        onSessionFound: vi.fn(),
        onThinkingChange: vi.fn(),
        onMessage: vi.fn(),
        onCompletionEvent: vi.fn(),
        onSessionReset: vi.fn(),
        ...overrides,
    };
}

/** A nextMessage that yields a single user message, then ends the loop. */
function oneMessage(message: string): RemoteOpts['nextMessage'] {
    let delivered = false;
    return async () => {
        if (delivered) return null;
        delivered = true;
        return { message, mode };
    };
}

describe('claudeRemote', () => {
    beforeEach(() => {
        vi.mocked(query).mockReset();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('marks /clear as a completed reset turn', async () => {
        const callbackOrder: string[] = [];
        const onCompletionEvent = vi.fn((message: string) => {
            callbackOrder.push(`event:${message}`);
        });
        const onSessionReset = vi.fn(() => {
            callbackOrder.push('reset');
        });
        const onReady = vi.fn(() => {
            callbackOrder.push('ready');
        });

        await claudeRemote(baseOpts({
            nextMessage: async () => ({ message: '/clear', mode }),
            onReady,
            onCompletionEvent,
            onSessionReset,
        }));

        expect(onCompletionEvent).toHaveBeenCalledWith('Context was reset');
        expect(onSessionReset).toHaveBeenCalledOnce();
        expect(onReady).toHaveBeenCalledOnce();
        expect(callbackOrder).toEqual(['event:Context was reset', 'reset', 'ready']);
    });

    it('marks assistant messages from /compact as compact summaries', async () => {
        vi.mocked(query).mockReturnValue({
            setPermissionMode: vi.fn(),
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'assistant',
                    message: {
                        role: 'assistant',
                        content: [{ type: 'text', text: 'Long compaction summary' }],
                    },
                };
                yield {
                    type: 'result',
                    subtype: 'success',
                };
            },
        } as any);

        const onMessage = vi.fn();

        await claudeRemote(baseOpts({
            nextMessage: oneMessage('/compact'),
            onMessage,
        }));

        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'assistant',
            isCompactSummary: true,
        }));
    });

    it('pushes rate-limit snapshots from rate_limit_event stream messages even when get_usage fails', async () => {
        vi.mocked(query).mockReturnValue({
            setPermissionMode: vi.fn(),
            // Simulates setup-token auth: the profile-scoped usage request rejects
            usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi.fn().mockRejectedValue(new Error('missing profile scope')),
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'rate_limit_event',
                    rate_limit_info: {
                        status: 'allowed',
                        rateLimitType: 'five_hour',
                        utilization: 42,
                        resetsAt: 1_770_007_200,
                    },
                };
                yield {
                    type: 'result',
                    subtype: 'success',
                };
            },
        } as any);

        const onRateLimits = vi.fn();

        await claudeRemote(baseOpts({
            nextMessage: oneMessage('hello'),
            onRateLimits,
        }));

        expect(onRateLimits).toHaveBeenCalledWith({
            five_hour: { used_percentage: 42, resets_at: 1_770_007_200, status: 'allowed' },
            seven_day: null,
            updated_at: expect.any(Number),
        });
    });

    it('reports Claude Code-shaped context-window facts from result messages', async () => {
        vi.mocked(query).mockReturnValue({
            setPermissionMode: vi.fn(),
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'result',
                    subtype: 'success',
                    usage: {
                        input_tokens: 5_000,
                        output_tokens: 1_200,
                        cache_creation_input_tokens: 20_000,
                        cache_read_input_tokens: 75_000,
                    },
                    modelUsage: {
                        'claude-haiku-4-5': { contextWindow: 200000 },
                        'claude-opus-4-8': { contextWindow: 1000000 },
                    },
                };
            },
        } as any);

        const onContextWindow = vi.fn();

        await claudeRemote(baseOpts({
            nextMessage: oneMessage('hello'),
            onContextWindow,
        }));

        expect(onContextWindow).toHaveBeenCalledWith({
            total_input_tokens: 100_000,
            total_output_tokens: 1_200,
            context_window_size: 1_000_000,
            current_usage: {
                input_tokens: 5_000,
                output_tokens: 1_200,
                cache_creation_input_tokens: 20_000,
                cache_read_input_tokens: 75_000,
            },
            used_percentage: 10,
            remaining_percentage: 90,
        });
    });

    it('polls rate limits as soon as the session initializes, before any turn completes', async () => {
        vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'sk-ant-oat01-test');
        const probeHeaders = new Headers({
            'anthropic-ratelimit-unified-5h-utilization': '0.15',
            'anthropic-ratelimit-unified-5h-reset': '1770007200',
            'anthropic-ratelimit-unified-7d-utilization': '0.54',
            'anthropic-ratelimit-unified-7d-reset': '1770400000',
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ headers: probeHeaders }));

        vi.mocked(query).mockReturnValue({
            setPermissionMode: vi.fn(),
            // Setup-token auth: the profile-scoped usage request rejects
            usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi.fn().mockRejectedValue(new Error('missing profile scope')),
            // The stream ends without a result message: only an init-time
            // poll can produce a rate-limit push here.
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'system',
                    subtype: 'init',
                    tools: [],
                    slash_commands: [],
                };
            },
        } as any);

        const onRateLimits = vi.fn();

        await claudeRemote(baseOpts({
            nextMessage: oneMessage('hello'),
            onRateLimits,
        }));

        await vi.waitFor(() => {
            expect(onRateLimits).toHaveBeenCalledWith({
                five_hour: { used_percentage: 15, resets_at: 1_770_007_200 },
                seven_day: { used_percentage: 54, resets_at: 1_770_400_000 },
                updated_at: expect.any(Number),
            });
        });
    });
});
