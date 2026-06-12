/**
 * Effort indicator for the AgentInput status row, ported from the Mac
 * statusline's scheme: one shape per effort level (drawn by EffortGlyph as
 * fixed-size SVG — the unicode glyphs ◈◆●◐○ render at different sizes per
 * character), tinted by model family (fable pink, opus rust, sonnet purple,
 * haiku teal). Unknown families get a null colour so the caller can fall back
 * to the theme's secondary text — a hardcoded grey here would fight one of
 * the two app themes.
 */

export const EFFORT_LEVELS = ['max', 'xhigh', 'high', 'medium', 'low'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const MODEL_FAMILY_COLORS: Record<string, string> = {
    fable: '#C75F8D',
    opus: '#BE6248',
    sonnet: '#8C6AD6',
    haiku: '#369298',
};

export type EffortStatus = { level: EffortLevel; color: string | null };

function isEffortLevel(key: string): key is EffortLevel {
    return (EFFORT_LEVELS as readonly string[]).includes(key);
}

/**
 * modelKey accepts both picker keys ('opus') and full model ids from CLI
 * metadata ('claude-opus-4-8') — family matching is by substring, like the
 * statusline's.
 */
export function getEffortStatus(
    effortKey: string | null | undefined,
    modelKey: string | null | undefined,
): EffortStatus | null {
    if (!effortKey) return null;
    const level: EffortLevel = isEffortLevel(effortKey) ? effortKey : 'max';
    let color: string | null = null;
    if (modelKey) {
        for (const [family, familyColor] of Object.entries(MODEL_FAMILY_COLORS)) {
            if (modelKey.includes(family)) {
                color = familyColor;
                break;
            }
        }
    }
    return { level, color };
}
