/**
 * Effort glyph for the AgentInput status row: fixed-size SVG shapes replacing
 * the unicode glyphs ◈◆●◐○, whose per-character metrics made the row's icons
 * render at visibly different sizes. Same ladder, drawn at a constant 12×12:
 * max = inset diamond, xhigh = filled diamond, high = filled circle,
 * medium = half-filled circle, low = open circle.
 */
import * as React from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { EffortLevel } from './effortStatus';

const SIZE = 12;
const STROKE_WIDTH = 1.5;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - 2 - STROKE_WIDTH) / 2;

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
                    <Polygon points={diamond(RADIUS)} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" fill="none" />
                    <Polygon points={diamond(RADIUS / 2.5)} fill={color} />
                </>
            )}
            {level === 'xhigh' && (
                <Polygon points={diamond(RADIUS)} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" fill={color} />
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
