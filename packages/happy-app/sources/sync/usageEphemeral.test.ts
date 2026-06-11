import { describe, it, expect } from 'vitest';
import { usageFromEphemeral, newerUsage, SessionUsage } from './usageEphemeral';

const ephemeral = {
    type: 'usage' as const,
    id: 'session-1',
    key: 'claude-session',
    timestamp: 2000,
    tokens: {
        total: 117,
        input: 100,
        output: 7,
        cache_creation: 4,
        cache_read: 6,
    },
    cost: { total: 0, input: 0, output: 0 },
};

describe('usageFromEphemeral', () => {
    it('maps the usage-report ephemeral into Session.latestUsage shape', () => {
        expect(usageFromEphemeral(ephemeral)).toEqual({
            inputTokens: 100,
            outputTokens: 7,
            cacheCreation: 4,
            cacheRead: 6,
            contextSize: 110, // input + cache_creation + cache_read
            timestamp: 2000,
        });
    });
});

describe('newerUsage', () => {
    const at = (timestamp: number): SessionUsage => ({
        inputTokens: 1,
        outputTokens: 1,
        cacheCreation: 0,
        cacheRead: 0,
        contextSize: 1,
        timestamp,
    });

    it('prefers the source with the newer timestamp', () => {
        expect(newerUsage(at(1000), at(2000))?.timestamp).toBe(2000);
        expect(newerUsage(at(3000), at(2000))?.timestamp).toBe(3000);
    });

    it('falls back to whichever side exists', () => {
        expect(newerUsage(null, at(2000))?.timestamp).toBe(2000);
        expect(newerUsage(at(1000), null)?.timestamp).toBe(1000);
        expect(newerUsage(null, undefined)).toBeNull();
    });
});
