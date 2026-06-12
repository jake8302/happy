import { describe, it, expect } from 'vitest';
import { getContextStatus, resolveContextBudget } from './contextStatus';

const BUDGET = 190000;

function contextWindow(size: number | null) {
    return {
        total_input_tokens: 0,
        total_output_tokens: 0,
        context_window_size: size,
        current_usage: null,
        used_percentage: null,
        remaining_percentage: null,
    };
}

describe('resolveContextBudget', () => {
    it('falls back to 190K when the CLI published no facts (old CLIs)', () => {
        expect(resolveContextBudget(null)).toBe(190000);
        expect(resolveContextBudget(undefined)).toBe(190000);
        expect(resolveContextBudget({ updated_at: 1 })).toBe(190000);
        expect(resolveContextBudget({ context_window: contextWindow(null), updated_at: 1 })).toBe(190000);
    });

    it('uses the model window size when no auto-compact budget is configured', () => {
        expect(resolveContextBudget({ context_window: contextWindow(1000000), updated_at: 1 })).toBe(1000000);
    });

    it('uses the auto-compact budget, clamped to the model window', () => {
        expect(resolveContextBudget({ context_window: contextWindow(200000), auto_compact_tokens: 150000, updated_at: 1 })).toBe(150000);
        expect(resolveContextBudget({ context_window: contextWindow(200000), auto_compact_tokens: 999999999, updated_at: 1 })).toBe(200000);
        expect(resolveContextBudget({ auto_compact_tokens: 150000, updated_at: 1 })).toBe(150000);
    });
});

describe('getContextStatus', () => {
    it('reports the exact fill fraction toward the auto-compact budget', () => {
        expect(getContextStatus(0, BUDGET, true)?.fillFraction).toBe(0);
        expect(getContextStatus(BUDGET * 0.25, BUDGET, true)?.fillFraction).toBe(0.25);
        expect(getContextStatus(BUDGET, BUDGET, true)?.fillFraction).toBe(1);
        expect(getContextStatus(BUDGET * 2, BUDGET, true)?.fillFraction).toBe(1);
    });

    it('colours by severity: green when empty, red at the budget', () => {
        expect(getContextStatus(0, BUDGET, true)?.color).toBe('#2d963c');
        expect(getContextStatus(BUDGET, BUDGET, true)?.color).toBe('#de3c34');
    });

    it('reports percent remaining for accessibility', () => {
        expect(getContextStatus(BUDGET * 0.6, BUDGET, true)?.percentRemaining).toBe(40);
        expect(getContextStatus(BUDGET * 2, BUDGET, true)?.percentRemaining).toBe(0);
    });

    it('hides unless always-show is on or remaining drops to the warning band', () => {
        expect(getContextStatus(BUDGET * 0.5, BUDGET, false)).toBeNull();
        expect(getContextStatus(BUDGET * 0.92, BUDGET, false)).not.toBeNull();
    });
});
