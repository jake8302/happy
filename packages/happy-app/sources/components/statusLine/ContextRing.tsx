/**
 * Context gauge ring for the AgentInput status row: an SVG donut that fills
 * clockwise from 12 o'clock as context climbs toward the auto-compact budget,
 * replacing the old 5-step pie glyph with an exact arc. The track ring stays
 * faintly visible so an almost-empty gauge still reads as a gauge.
 */
import * as React from 'react';
import Svg, { Circle } from 'react-native-svg';

const SIZE = 12;
const STROKE_WIDTH = 2.5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const ContextRing = React.memo(function ContextRing(props: {
    fillFraction: number;
    color: string;
    accessibilityLabel: string;
}) {
    const fill = Math.max(0, Math.min(1, props.fillFraction));
    return (
        <Svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            accessibilityLabel={props.accessibilityLabel}
        >
            <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={props.color}
                strokeOpacity={0.25}
                strokeWidth={STROKE_WIDTH}
                fill="none"
            />
            <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={props.color}
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDasharray={`${CIRCUMFERENCE * fill} ${CIRCUMFERENCE}`}
                strokeLinecap={fill > 0 && fill < 1 ? 'round' : 'butt'}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
        </Svg>
    );
});
