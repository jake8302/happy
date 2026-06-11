import { describe, it, expect } from 'vitest';
import { buildAgentSpawnArgs } from './agentSpawnArgs';

describe('buildAgentSpawnArgs', () => {
    it('builds the base daemon spawn args for claude', () => {
        expect(buildAgentSpawnArgs('claude', {})).toEqual([
            'claude',
            '--happy-starting-mode', 'remote',
            '--started-by', 'daemon',
        ]);
    });

    it('appends --permission-mode when the app requests one', () => {
        expect(buildAgentSpawnArgs('claude', { permissionMode: 'auto' })).toEqual([
            'claude',
            '--happy-starting-mode', 'remote',
            '--started-by', 'daemon',
            '--permission-mode', 'auto',
        ]);
    });

    it('omits --permission-mode when none requested', () => {
        expect(buildAgentSpawnArgs('codex', {})).not.toContain('--permission-mode');
    });

    it('appends --resume only for the matching agent', () => {
        expect(buildAgentSpawnArgs('claude', {
            resumeClaudeSessionId: 'claude-id',
            resumeCodexThreadId: 'codex-id',
        })).toEqual([
            'claude',
            '--happy-starting-mode', 'remote',
            '--started-by', 'daemon',
            '--resume', 'claude-id',
        ]);

        expect(buildAgentSpawnArgs('codex', {
            resumeClaudeSessionId: 'claude-id',
            resumeCodexThreadId: 'codex-id',
        })).toEqual([
            'codex',
            '--happy-starting-mode', 'remote',
            '--started-by', 'daemon',
            '--resume', 'codex-id',
        ]);

        expect(buildAgentSpawnArgs('gemini', {
            resumeClaudeSessionId: 'claude-id',
            resumeCodexThreadId: 'codex-id',
        })).toEqual([
            'gemini',
            '--happy-starting-mode', 'remote',
            '--started-by', 'daemon',
        ]);
    });

    it('orders resume before permission mode', () => {
        expect(buildAgentSpawnArgs('claude', {
            resumeClaudeSessionId: 'claude-id',
            permissionMode: 'plan',
        })).toEqual([
            'claude',
            '--happy-starting-mode', 'remote',
            '--started-by', 'daemon',
            '--resume', 'claude-id',
            '--permission-mode', 'plan',
        ]);
    });
});
