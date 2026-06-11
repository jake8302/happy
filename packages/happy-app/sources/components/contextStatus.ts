/**
 * Context gauge for the AgentInput status row, ported from the Mac
 * statusline's scheme: a pie glyph that fills as context climbs toward the
 * auto-compact budget, tinted by the same green→amber→orange→red severity
 * gradient (0..200 scale, 200 = compaction imminent). The pie replaces the
 * old "x% left" text; the exact percentage stays available for a11y.
 */

export const CONTEXT_PIE_GLYPHS = ['○', '◔', '◑', '◕', '●'] as const;

type Rgb = [number, number, number];

const GRADIENT_STOPS: Array<[number, Rgb]> = [
    [0, [45, 150, 60]],
    [100, [150, 120, 28]],
    [150, [193, 100, 40]],
    [200, [222, 60, 52]],
];

const toHex = ([r, g, b]: Rgb): string =>
    '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');

export function gradientColor(pos: number): string {
    const clamped = Math.max(0, Math.min(200, pos));
    let prev = GRADIENT_STOPS[0];
    for (const stop of GRADIENT_STOPS) {
        if (clamped <= stop[0]) {
            const [p0, c0] = prev;
            const [p1, c1] = stop;
            if (p1 === p0) return toHex(c1);
            const t = (clamped - p0) / (p1 - p0);
            return toHex([
                Math.round(c0[0] + (c1[0] - c0[0]) * t),
                Math.round(c0[1] + (c1[1] - c0[1]) * t),
                Math.round(c0[2] + (c1[2] - c0[2]) * t),
            ] as Rgb);
        }
        prev = stop;
    }
    return toHex(GRADIENT_STOPS[GRADIENT_STOPS.length - 1][1]);
}

export type ContextStatus = { glyph: string; color: string; percentRemaining: number };

export function getContextStatus(
    contextSize: number,
    maxContextSize: number,
    alwaysShow: boolean,
): ContextStatus | null {
    const usedFraction = Math.max(0, Math.min(1, contextSize / Math.max(1, maxContextSize)));
    const percentRemaining = Math.round((1 - usedFraction) * 100);
    if (!alwaysShow && percentRemaining > 10) {
        return null;
    }
    const bucket = usedFraction < 0.125 ? 0
        : usedFraction < 0.375 ? 1
            : usedFraction < 0.625 ? 2
                : usedFraction < 0.875 ? 3
                    : 4;
    return {
        glyph: CONTEXT_PIE_GLYPHS[bucket],
        color: gradientColor(Math.round(usedFraction * 200)),
        percentRemaining,
    };
}
