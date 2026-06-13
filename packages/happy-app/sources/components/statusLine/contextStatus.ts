/**
 * Context gauge for the AgentInput status row, mirroring the Mac statusline's
 * scheme: a ring that fills as context climbs toward the auto-compact budget,
 * tinted by the shared green→amber→orange→red severity gradient (0..200,
 * 200 = compaction imminent). The exact percentage stays available for a11y.
 *
 * The budget comes from the CLI's Claude Code-shaped statusLine facts
 * (context_window.context_window_size + the machine-local auto_compact_tokens
 * extension) — the CLI publishes facts, this module owns the math.
 */
import type { Metadata } from '@/sync/storageTypes';
import { gradientColor } from './gradient';

/** Pre-statusLine CLIs never say how big the window is; assume the classic 200K model minus the compact reserve. */
const LEGACY_DEFAULT_BUDGET = 190000;

/**
 * Resolve the token budget the gauge fills toward, the way the statusline's
 * clamp_budget_k does: auto-compact budget when configured (clamped to the
 * model window), else the model window, else the legacy 190K guess.
 */
export function resolveContextBudget(statusLine: Metadata['statusLine']): number {
    const windowSize = statusLine?.context_window?.context_window_size ?? null;
    const autoCompact = statusLine?.auto_compact_tokens ?? null;
    if (autoCompact !== null) {
        return windowSize !== null ? Math.min(autoCompact, windowSize) : autoCompact;
    }
    return windowSize ?? LEGACY_DEFAULT_BUDGET;
}

/**
 * The numerator the ring fills with: the live usage ephemeral when present
 * (Claude streams it per request), else the CLI's published context_window
 * facts (Codex publishes only these — no usage ephemeral). Null when neither
 * reports occupancy, so the ring stays hidden.
 */
export function resolveContextSize(
    usageContextSize: number | null | undefined,
    statusLine: Metadata['statusLine'],
): number | null {
    if (typeof usageContextSize === 'number' && usageContextSize > 0) {
        return usageContextSize;
    }
    const fromStatusLine = statusLine?.context_window?.total_input_tokens;
    return typeof fromStatusLine === 'number' && fromStatusLine > 0 ? fromStatusLine : null;
}

export type ContextStatus = { fillFraction: number; color: string; percentRemaining: number };

export function getContextStatus(
    contextSize: number,
    budgetTokens: number,
    alwaysShow: boolean,
): ContextStatus | null {
    const fillFraction = Math.max(0, Math.min(1, contextSize / Math.max(1, budgetTokens)));
    const percentRemaining = Math.round((1 - fillFraction) * 100);
    if (!alwaysShow && percentRemaining > 10) {
        return null;
    }
    return {
        fillFraction,
        color: gradientColor(Math.round(fillFraction * 200)),
        percentRemaining,
    };
}
