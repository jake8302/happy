import { describe, it, expect } from 'vitest';
import { getEffortStatus, EFFORT_GLYPHS, MODEL_FAMILY_COLORS } from './effortStatus';

describe('getEffortStatus', () => {
    it('maps each effort level to its statusline glyph', () => {
        expect(getEffortStatus('max', 'opus')?.glyph).toBe('◈');
        expect(getEffortStatus('xhigh', 'opus')?.glyph).toBe('◆');
        expect(getEffortStatus('high', 'opus')?.glyph).toBe('●');
        expect(getEffortStatus('medium', 'opus')?.glyph).toBe('◐');
        expect(getEffortStatus('low', 'opus')?.glyph).toBe('○');
    });

    it('falls back to the max glyph for an unknown effort key', () => {
        expect(getEffortStatus('turbo', 'opus')?.glyph).toBe('◈');
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

    it('exports the glyph and colour tables the statusline scheme is ported from', () => {
        expect(Object.keys(EFFORT_GLYPHS)).toEqual(['max', 'xhigh', 'high', 'medium', 'low']);
        expect(Object.keys(MODEL_FAMILY_COLORS)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
    });
});
