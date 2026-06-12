import { describe, it, expect } from 'vitest';
import { gradientColor } from './gradient';

describe('gradientColor', () => {
    it('interpolates the statusline severity gradient', () => {
        expect(gradientColor(0)).toBe('#2d963c');
        expect(gradientColor(100)).toBe('#96781c');
        expect(gradientColor(150)).toBe('#c16428');
        expect(gradientColor(200)).toBe('#de3c34');
    });

    it('interpolates between stops', () => {
        expect(gradientColor(50)).toBe('#62872c');
    });

    it('clamps positions outside 0..200', () => {
        expect(gradientColor(-50)).toBe('#2d963c');
        expect(gradientColor(400)).toBe('#de3c34');
    });
});
