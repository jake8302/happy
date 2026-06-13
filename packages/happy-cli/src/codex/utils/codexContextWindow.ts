/**
 * Maps Codex's `thread/tokenUsage/updated` payload onto Claude Code's
 * statusline `context_window` facts, so the webapp's context ring renders for
 * Codex sessions exactly as it does for Claude (the CLI publishes facts, the
 * app owns all derived math/colour — see contextWindowFacts.ts for the Claude
 * side).
 *
 * Codex's token accounting differs from Claude's in two ways we normalise here:
 *   - `inputTokens` ALREADY includes the cached portion (`cachedInputTokens`),
 *     so the prompt size occupying the window is `inputTokens` itself — adding
 *     cache on top would double-count. We split it into the Claude-shaped
 *     current_usage buckets (fresh = input − cached, cache_read = cached) so
 *     they sum back to total_input_tokens.
 *   - `last` is the most-recent turn's usage (current occupancy); `total` is
 *     cumulative lifetime spend and would overflow the ring — we use `last`.
 */

import type { ContextWindowFacts } from '@/api/types';

export interface CodexTurnTokenUsage {
    totalTokens?: number;
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
}

export interface CodexTokenUsage {
    total?: CodexTurnTokenUsage;
    last?: CodexTurnTokenUsage;
    modelContextWindow?: number | null;
}

export function contextWindowFromCodexTokenUsage(
    usage: CodexTokenUsage | null | undefined,
): ContextWindowFacts | null {
    const last = usage?.last;
    if (!last) return null;

    const inputTokens = last.inputTokens ?? 0;
    const cachedInputTokens = last.cachedInputTokens ?? 0;
    const outputTokens = last.outputTokens ?? 0;

    const current_usage = {
        input_tokens: Math.max(0, inputTokens - cachedInputTokens),
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cachedInputTokens,
    };
    const total_input_tokens = current_usage.input_tokens
        + current_usage.cache_creation_input_tokens
        + current_usage.cache_read_input_tokens;

    const rawWindow = usage?.modelContextWindow;
    const context_window_size = typeof rawWindow === 'number' && rawWindow > 0 ? rawWindow : null;

    let used_percentage: number | null = null;
    let remaining_percentage: number | null = null;
    if (context_window_size !== null) {
        used_percentage = Math.min(100, Math.max(0, Math.round((total_input_tokens / context_window_size) * 100)));
        remaining_percentage = 100 - used_percentage;
    }

    return {
        total_input_tokens,
        total_output_tokens: outputTokens,
        context_window_size,
        current_usage,
        used_percentage,
        remaining_percentage,
    };
}
