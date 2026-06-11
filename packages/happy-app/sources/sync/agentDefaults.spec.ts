import { describe, it, expect } from 'vitest';
import { getCodeAgentDefaults, resolveAgentDefaultConfig } from './agentDefaults';

describe('agentDefaults', () => {
    it('defaults claude sessions to the auto permission mode', () => {
        expect(getCodeAgentDefaults('claude').permissionMode).toBe('auto');
        expect(getCodeAgentDefaults(null).permissionMode).toBe('auto');
    });

    it('keeps user overrides above the code default', () => {
        const resolved = resolveAgentDefaultConfig(
            { claude: { permissionMode: 'plan' } },
            'claude',
        );
        expect(resolved.permissionMode).toBe('plan');
    });
});
