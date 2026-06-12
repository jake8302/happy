/**
 * Raw context-window facts the CLI can observe but the app cannot.
 *
 * Mirrors Claude Code's statusline contract: the CLI publishes facts
 * (model window size, machine-local auto-compact budget) and the webapp
 * owns every derived number, colour, and glyph.
 */

import type { ContextWindowFacts, ContextWindowUsage } from '@/api/types';
import { readClaudeSettings, type ClaudeSettings } from './utils/claudeSettings';

/** Subset of the SDK's per-model usage entries we read window sizes from. */
type ModelUsageLike = Record<string, { contextWindow?: number | null }>;

/** Subset of the SDK result message's usage block we read token counts from. */
type UsageLike = Partial<ContextWindowUsage>;

/**
 * The model context window size in tokens, taken as the max across the
 * turn's model entries (subagents may run smaller models). Null when the
 * SDK didn't report one.
 */
export function windowSizeFromModelUsage(modelUsage: ModelUsageLike | undefined): number | null {
    let max = 0;
    for (const entry of Object.values(modelUsage ?? {})) {
        if (typeof entry.contextWindow === 'number' && entry.contextWindow > max) {
            max = entry.contextWindow;
        }
    }
    return max > 0 ? max : null;
}

/**
 * Build Claude Code's statusline `context_window` block from a result
 * message's usage + modelUsage. Mirrors the binary's logic: total input
 * counts fresh + cache-creation + cache-read tokens, used_percentage is
 * rounded and clamped to 0-100, and percentages are null without a window
 * size. Returns null when the result carries no usage at all.
 */
export function contextWindowFromResult(
    usage: UsageLike | undefined,
    modelUsage: ModelUsageLike | undefined,
): ContextWindowFacts | null {
    if (usage == null) return null;
    const current_usage: ContextWindowUsage = {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    };
    const total_input_tokens = current_usage.input_tokens
        + current_usage.cache_creation_input_tokens
        + current_usage.cache_read_input_tokens;
    const context_window_size = windowSizeFromModelUsage(modelUsage);

    let used_percentage: number | null = null;
    let remaining_percentage: number | null = null;
    if (context_window_size !== null) {
        used_percentage = Math.min(100, Math.max(0, Math.round((total_input_tokens / context_window_size) * 100)));
        remaining_percentage = 100 - used_percentage;
    }

    return {
        total_input_tokens,
        total_output_tokens: current_usage.output_tokens,
        context_window_size,
        current_usage,
        used_percentage,
        remaining_percentage,
    };
}

interface AutoCompactDeps {
    env: Record<string, string | undefined>;
    readSettings: () => Pick<ClaudeSettings, 'autoCompactEnabled' | 'autoCompactWindow'> | null;
}

function parsePositiveInt(value: string | undefined): number | null {
    if (value === undefined || !/^\d+$/.test(value)) return null;
    const parsed = parseInt(value, 10);
    return parsed > 0 ? parsed : null;
}

/**
 * The machine-local auto-compact budget in tokens, resolved the same way
 * Claude Code does: CLAUDE_CODE_AUTO_COMPACT_WINDOW env var, then
 * ~/.claude/settings.json autoCompactWindow (respecting autoCompactEnabled,
 * default true). Null when nothing configures a budget — the app then
 * falls back to the model window size.
 */
export function readAutoCompactTokens(deps: AutoCompactDeps = defaultDeps()): number | null {
    const fromEnv = parsePositiveInt(deps.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
    if (fromEnv !== null) return fromEnv;

    const settings = deps.readSettings();
    if (!settings || settings.autoCompactEnabled === false) return null;
    const window = settings.autoCompactWindow;
    return typeof window === 'number' && window > 0 ? Math.floor(window) : null;
}

function defaultDeps(): AutoCompactDeps {
    return {
        env: process.env,
        readSettings: readClaudeSettings,
    };
}
