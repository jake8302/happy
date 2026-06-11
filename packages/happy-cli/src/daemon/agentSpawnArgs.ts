/**
 * Single source of truth for the CLI argv of daemon-spawned sessions.
 * Both daemon spawn paths (tmux window and plain child process) previously
 * built these args inline and drifted; they must stay identical because a
 * tmux failure falls back to the plain path mid-spawn.
 */

export type AgentCommand = 'claude' | 'codex' | 'gemini' | 'openclaw';

export interface AgentSpawnArgOptions {
    /** Attach the new Happy session to a forked Claude conversation file. */
    resumeClaudeSessionId?: string;
    /** Attach the new Happy session to a forked Codex app-server thread. */
    resumeCodexThreadId?: string;
    /**
     * Permission mode the app's new-session picker selected. Forwarded as
     * `--permission-mode` so the spawned CLI starts in the mode the user
     * sees instead of falling back to its own default.
     */
    permissionMode?: string;
}

export function buildAgentSpawnArgs(agent: AgentCommand, options: AgentSpawnArgOptions): string[] {
    const args = [
        agent,
        '--happy-starting-mode', 'remote',
        '--started-by', 'daemon',
    ];

    if (options.resumeClaudeSessionId && agent === 'claude') {
        args.push('--resume', options.resumeClaudeSessionId);
    }
    if (options.resumeCodexThreadId && agent === 'codex') {
        args.push('--resume', options.resumeCodexThreadId);
    }
    if (options.permissionMode) {
        args.push('--permission-mode', options.permissionMode);
    }

    return args;
}
