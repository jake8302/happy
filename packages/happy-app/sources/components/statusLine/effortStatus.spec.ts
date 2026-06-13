import { describe, it, expect } from 'vitest';
import { getEffortStatus, EFFORT_LEVELS, MODEL_FAMILY_COLORS } from './effortStatus';

describe('getEffortStatus', () => {
    it('passes each known effort level through for the SVG glyph to shape', () => {
        expect(getEffortStatus('max', 'opus')?.level).toBe('max');
        expect(getEffortStatus('xhigh', 'opus')?.level).toBe('xhigh');
        expect(getEffortStatus('high', 'opus')?.level).toBe('high');
        expect(getEffortStatus('medium', 'opus')?.level).toBe('medium');
        expect(getEffortStatus('low', 'opus')?.level).toBe('low');
    });

    it('falls back to max for an unknown effort key', () => {
        expect(getEffortStatus('turbo', 'opus')?.level).toBe('max');
    });

    it('colours the glyph by model family', () => {
        expect(getEffortStatus('xhigh', 'fable')?.color).toBe('#C75F8D');
        expect(getEffortStatus('xhigh', 'opus')?.color).toBe('#BE6248');
        expect(getEffortStatus('xhigh', 'sonnet')?.color).toBe('#8C6AD6');
        expect(getEffortStatus('xhigh', 'haiku')?.color).toBe('#369298');
    });

    it('matches the family as a substring of full model ids', () => {
        expect(getEffortStatus('high', 'claude-opus-4-8')?.color).toBe('#BE6248');
        expect(getEffortStatus('high', 'claude-fable-5')?.color).toBe('#C75F8D');
    });

    it('colours Codex / gpt models with the OpenAI family colour', () => {
        expect(getEffortStatus('xhigh', 'gpt-5.5')?.color).toBe('#10A37F');
        expect(getEffortStatus('xhigh', 'gpt-5.3-codex')?.color).toBe('#10A37F');
        expect(getEffortStatus('xhigh', 'gpt-5.1-codex-max')?.color).toBe('#10A37F');
    });

    it('returns a null colour for unknown or default models (caller themes it)', () => {
        expect(getEffortStatus('high', 'default')?.color).toBeNull();
        expect(getEffortStatus('high', null)?.color).toBeNull();
        expect(getEffortStatus('high', undefined)?.color).toBeNull();
    });

    it('returns null without an effort key', () => {
        expect(getEffortStatus(null, 'opus')).toBeNull();
        expect(getEffortStatus(undefined, 'opus')).toBeNull();
        expect(getEffortStatus('', 'opus')).toBeNull();
    });

    it('exports the level and colour tables the statusline scheme is ported from', () => {
        expect(EFFORT_LEVELS).toEqual(['max', 'xhigh', 'high', 'medium', 'low']);
        expect(Object.keys(MODEL_FAMILY_COLORS)).toEqual(['fable', 'opus', 'sonnet', 'haiku', 'gpt', 'codex']);
    });
});
