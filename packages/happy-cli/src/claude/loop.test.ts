import { describe, expect, it } from 'vitest';
import { isClaudeEffort } from './loop';

describe('isClaudeEffort', () => {
    it('accepts every Claude effort level', () => {
        for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
            expect(isClaudeEffort(effort)).toBe(true);
        }
    });

    it('rejects strings outside the effort union', () => {
        expect(isClaudeEffort('extreme')).toBe(false);
        expect(isClaudeEffort('MAX')).toBe(false);
        expect(isClaudeEffort('')).toBe(false);
        expect(isClaudeEffort(' low')).toBe(false);
    });

    it('rejects non-string values', () => {
        expect(isClaudeEffort(undefined)).toBe(false);
        expect(isClaudeEffort(null)).toBe(false);
        expect(isClaudeEffort(3)).toBe(false);
        expect(isClaudeEffort({ effort: 'low' })).toBe(false);
    });

    it('rejects Object.prototype keys that are not own properties', () => {
        expect(isClaudeEffort('toString')).toBe(false);
        expect(isClaudeEffort('hasOwnProperty')).toBe(false);
    });
});
