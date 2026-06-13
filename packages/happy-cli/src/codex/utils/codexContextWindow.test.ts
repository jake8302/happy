import { describe, it, expect } from 'vitest';
import { contextWindowFromCodexTokenUsage } from './codexContextWindow';

describe('contextWindowFromCodexTokenUsage', () => {
    it('returns null without a `last` turn block', () => {
        expect(contextWindowFromCodexTokenUsage(null)).toBeNull();
        expect(contextWindowFromCodexTokenUsage({})).toBeNull();
        expect(contextWindowFromCodexTokenUsage({ total: { totalTokens: 100 } })).toBeNull();
    });

    it('builds Claude-shaped facts from the last turn + modelContextWindow', () => {
        // Real gpt-5.5 payload captured from a live session.
        const facts = contextWindowFromCodexTokenUsage({
            total: { totalTokens: 404528, inputTokens: 401125, cachedInputTokens: 293632, outputTokens: 3403, reasoningOutputTokens: 838 },
            last: { totalTokens: 43468, inputTokens: 42905, cachedInputTokens: 35200, outputTokens: 563, reasoningOutputTokens: 230 },
            modelContextWindow: 258400,
        });
        expect(facts).not.toBeNull();
        // Codex `inputTokens` already includes the cached portion, so the prompt
        // size in the window is inputTokens — NOT input + cache (that double-counts).
        expect(facts!.total_input_tokens).toBe(42905);
        expect(facts!.context_window_size).toBe(258400);
        // current_usage splits inputTokens into fresh + cache_read, summing back to it.
        expect(facts!.current_usage).toEqual({
            input_tokens: 42905 - 35200,
            output_tokens: 563,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 35200,
        });
        expect(
            facts!.current_usage!.input_tokens
            + facts!.current_usage!.cache_creation_input_tokens
            + facts!.current_usage!.cache_read_input_tokens,
        ).toBe(facts!.total_input_tokens);
        // 42905 / 258400 ≈ 16.6% → rounds to 17.
        expect(facts!.used_percentage).toBe(17);
        expect(facts!.remaining_percentage).toBe(83);
    });

    it('leaves percentages null when the window size is missing', () => {
        const facts = contextWindowFromCodexTokenUsage({
            last: { totalTokens: 1000, inputTokens: 900, cachedInputTokens: 0, outputTokens: 100 },
        });
        expect(facts!.context_window_size).toBeNull();
        expect(facts!.used_percentage).toBeNull();
        expect(facts!.remaining_percentage).toBeNull();
        expect(facts!.total_input_tokens).toBe(900);
    });

    it('clamps used_percentage to 100 when context overflows the window', () => {
        const facts = contextWindowFromCodexTokenUsage({
            last: { inputTokens: 300000, cachedInputTokens: 0, outputTokens: 0 },
            modelContextWindow: 258400,
        });
        expect(facts!.used_percentage).toBe(100);
        expect(facts!.remaining_percentage).toBe(0);
    });

    it('treats a zero/negative window size as missing', () => {
        const facts = contextWindowFromCodexTokenUsage({
            last: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 0 },
            modelContextWindow: 0,
        });
        expect(facts!.context_window_size).toBeNull();
    });
});
