/**
 * Severity gradient shared by every status-line segment, ported from the Mac
 * statusline: green -> amber(100) -> orange(150) -> red(200) over a 0..200
 * scale. Severity is carried by hue at near-constant mid luminance so every
 * interpolated point stays legible on both the light and dark themes.
 */

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
