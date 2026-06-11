import { describe, it, expect } from 'vitest';
import { getContextStatus, gradientColor, CONTEXT_PIE_GLYPHS } from './contextStatus';

const BUDGET = 190000;

describe('gradientColor', () => {
    it('interpolates the statusline severity gradient', () => {
        expect(gradientColor(0)).toBe('#2d963c');
        expect(gradientColor(100)).toBe('#96781c');
        expect(gradientColor(150)).toBe('#c16428');
        expect(gradientColor(200)).toBe('#de3c34');
    });

    it('clamps positions outside 0..200', () => {
        expect(gradientColor(-50)).toBe('#2d963c');
        expect(gradientColor(400)).toBe('#de3c34');
    });
});

describe('getContextStatus', () => {
    it('fills the pie as context climbs toward the auto-compact budget', () => {
        expect(getContextStatus(0, BUDGET, true)?.glyph).toBe('○');
        expect(getContextStatus(BUDGET * 0.25, BUDGET, true)?.glyph).toBe('◔');
        expect(getContextStatus(BUDGET * 0.5, BUDGET, true)?.glyph).toBe('◑');
        expect(getContextStatus(BUDGET * 0.75, BUDGET, true)?.glyph).toBe('◕');
        expect(getContextStatus(BUDGET, BUDGET, true)?.glyph).toBe('●');
        expect(getContextStatus(BUDGET * 2, BUDGET, true)?.glyph).toBe('●');
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

    it('exports the five pie glyphs in fill order', () => {
        expect(CONTEXT_PIE_GLYPHS).toEqual(['○', '◔', '◑', '◕', '●']);
    });
});
