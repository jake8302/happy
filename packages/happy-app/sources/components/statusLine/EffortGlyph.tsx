/**
 * Effort glyph for the AgentInput status row: the Mac statusline's unicode
 * glyphs (◈ max / ◆ xhigh / ● high / ◐ medium / ○ low) redrawn as fixed-size
 * SVG, because the characters' per-font metrics made the row's icons render
 * at visibly different sizes. Each shape replicates its glyph's geometry:
 * ◈ = white diamond containing a black diamond at half scale (U+25C8),
 * ◆ = black diamond, ● = black circle, ◐ = circle with left half black,
 * ○ = white circle. Diamonds get a small optical size bump so their visual
 * weight matches the circles', as fonts do.
 */
import * as React from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { EffortLevel } from './effortStatus';

const SIZE = 12;
const STROKE_WIDTH = 1.5;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - 2 - STROKE_WIDTH) / 2;
const DIAMOND_RADIUS = RADIUS * 1.15;

const diamond = (r: number) =>
    `${CENTER},${CENTER - r} ${CENTER + r},${CENTER} ${CENTER},${CENTER + r} ${CENTER - r},${CENTER}`;

export const EffortGlyph = React.memo(function EffortGlyph(props: {
    level: EffortLevel;
    color: string;
}) {
    const { level, color } = props;
    return (
        <Svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            accessibilityLabel={`effort ${level}`}
        >
            {level === 'max' && (
                <>
                    <Polygon points={diamond(DIAMOND_RADIUS)} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" fill="none" />
                    <Polygon points={diamond(DIAMOND_RADIUS / 2)} fill={color} />
                </>
            )}
            {level === 'xhigh' && (
                <Polygon points={diamond(DIAMOND_RADIUS)} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" fill={color} />
            )}
            {level === 'high' && (
                <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={color} strokeWidth={STROKE_WIDTH} fill={color} />
            )}
            {level === 'medium' && (
                <>
                    <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
                    <Path
                        d={`M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 0 0 ${CENTER} ${CENTER + RADIUS} Z`}
                        fill={color}
                    />
                </>
            )}
            {level === 'low' && (
                <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
            )}
        </Svg>
    );
});
