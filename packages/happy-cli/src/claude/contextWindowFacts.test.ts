import { describe, expect, it } from 'vitest';
import { contextWindowFromResult, readAutoCompactTokens, windowSizeFromModelUsage } from './contextWindowFacts';

describe('contextWindowFromResult', () => {
    const usage = {
        input_tokens: 5_000,
        output_tokens: 1_200,
        cache_creation_input_tokens: 20_000,
        cache_read_input_tokens: 75_000,
    };

    it('builds Claude Code-shaped facts: total_input sums input + cache tokens', () => {
        const facts = contextWindowFromResult(usage, {
            'claude-opus-4-8': { contextWindow: 200_000 },
        });

        expect(facts).toEqual({
            total_input_tokens: 100_000,
            total_output_tokens: 1_200,
            context_window_size: 200_000,
            current_usage: usage,
            used_percentage: 50,
            remaining_percentage: 50,
        });
    });

    it('rounds used_percentage and clamps to 0-100', () => {
        const tiny = contextWindowFromResult(
            { input_tokens: 1, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            { m: { contextWindow: 200_000 } },
        );
        expect(tiny?.used_percentage).toBe(0);
        expect(tiny?.remaining_percentage).toBe(100);

        const over = contextWindowFromResult(
            { input_tokens: 300_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            { m: { contextWindow: 200_000 } },
        );
        expect(over?.used_percentage).toBe(100);
        expect(over?.remaining_percentage).toBe(0);
    });

    it('defaults missing usage fields to 0', () => {
        const facts = contextWindowFromResult(
            { input_tokens: 4_000, output_tokens: 500 },
            { m: { contextWindow: 200_000 } },
        );
        expect(facts?.total_input_tokens).toBe(4_000);
        expect(facts?.current_usage).toEqual({
            input_tokens: 4_000,
            output_tokens: 500,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
        });
    });

    it('nulls the percentages when no model reports a window size', () => {
        const facts = contextWindowFromResult(usage, {});
        expect(facts).toEqual({
            total_input_tokens: 100_000,
            total_output_tokens: 1_200,
            context_window_size: null,
            current_usage: usage,
            used_percentage: null,
            remaining_percentage: null,
        });
    });

    it('returns null when the result carries no usage at all', () => {
        expect(contextWindowFromResult(undefined, { m: { contextWindow: 200_000 } })).toBeNull();
    });
});

describe('windowSizeFromModelUsage', () => {
    it('returns the largest contextWindow across model entries', () => {
        expect(windowSizeFromModelUsage({
            'claude-haiku-4-5': { contextWindow: 200000 },
            'claude-opus-4-8': { contextWindow: 1000000 },
        })).toBe(1000000);
    });

    it('returns null when no entry carries a usable contextWindow', () => {
        expect(windowSizeFromModelUsage({})).toBeNull();
        expect(windowSizeFromModelUsage(undefined)).toBeNull();
        expect(windowSizeFromModelUsage({
            'claude-opus-4-8': { contextWindow: 0 },
        })).toBeNull();
    });
});

describe('readAutoCompactTokens', () => {
    it('prefers the CLAUDE_CODE_AUTO_COMPACT_WINDOW env var', () => {
        expect(readAutoCompactTokens({
            env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '150000' },
            readSettings: () => ({ autoCompactWindow: 90000 }),
        })).toBe(150000);
    });

    it('falls back to settings.json autoCompactWindow when env is unset', () => {
        expect(readAutoCompactTokens({
            env: {},
            readSettings: () => ({ autoCompactWindow: 90000 }),
        })).toBe(90000);
    });

    it('returns null when settings disable auto-compact', () => {
        expect(readAutoCompactTokens({
            env: {},
            readSettings: () => ({ autoCompactEnabled: false, autoCompactWindow: 90000 }),
        })).toBeNull();
    });

    it('returns null when nothing configures a budget', () => {
        expect(readAutoCompactTokens({
            env: {},
            readSettings: () => null,
        })).toBeNull();
        expect(readAutoCompactTokens({
            env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'not-a-number' },
            readSettings: () => null,
        })).toBeNull();
    });
});
