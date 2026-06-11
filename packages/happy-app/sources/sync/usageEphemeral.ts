import type { ApiEphemeralUpdate } from './apiTypes';

export type ApiEphemeralUsageUpdate = Extract<ApiEphemeralUpdate, { type: 'usage' }>;

export interface SessionUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreation: number;
    cacheRead: number;
    contextSize: number;
    timestamp: number;
}

// Same context-size math as the message reducer: everything that occupies
// the window on the next request (fresh input + both cache buckets).
export function usageFromEphemeral(update: ApiEphemeralUsageUpdate): SessionUsage {
    return {
        inputTokens: update.tokens.input,
        outputTokens: update.tokens.output,
        cacheCreation: update.tokens.cache_creation,
        cacheRead: update.tokens.cache_read,
        contextSize: update.tokens.input + update.tokens.cache_creation + update.tokens.cache_read,
        timestamp: update.timestamp,
    };
}

// The reducer path (legacy messages, compaction resets) and the ephemeral
// path both feed the context indicator; whichever reported last wins.
export function newerUsage(a: SessionUsage | null | undefined, b: SessionUsage | null | undefined): SessionUsage | null {
    if (!a) return b ?? null;
    if (!b) return a;
    return b.timestamp > a.timestamp ? b : a;
}
