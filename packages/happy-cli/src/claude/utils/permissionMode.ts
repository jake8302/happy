import type { QueryOptions } from '@/claude/sdk';
import type { PermissionMode } from '@/api/types';

/** Derived from SDK's QueryOptions - the modes Claude actually supports */
export type ClaudeSdkPermissionMode = NonNullable<QueryOptions['permissionMode']>;

/**
 * Map any PermissionMode (9 modes) to a Claude-compatible mode (6 modes)
 * This is the ONLY place where Codex modes are mapped to Claude equivalents.
 *
 * Mapping:
 * - yolo → bypassPermissions (both skip all permissions)
 * - safe-yolo → default (ask for permissions)
 * - read-only → default (Claude doesn't support read-only)
 *
 * Claude modes pass through unchanged:
 * - default, acceptEdits, bypassPermissions, plan, dontAsk, auto
 */
export function mapToClaudeMode(mode: PermissionMode): ClaudeSdkPermissionMode {
    switch (mode) {
        case 'yolo':
            return 'bypassPermissions';
        case 'safe-yolo':
        case 'read-only':
            return 'default';
        case 'default':
        case 'acceptEdits':
        case 'bypassPermissions':
        case 'plan':
        case 'dontAsk':
        case 'auto':
            return mode;
    }
}

/**
 * Exhaustive membership record — `satisfies Record<PermissionMode, true>`
 * makes the compiler reject both missing and extra keys, so this stays in
 * lockstep with the PermissionMode union without any casting.
 */
const VALID_PERMISSION_MODES = {
    'default': true,
    'acceptEdits': true,
    'bypassPermissions': true,
    'plan': true,
    'dontAsk': true,
    'auto': true,
    'read-only': true,
    'safe-yolo': true,
    'yolo': true,
} satisfies Record<PermissionMode, true>;

function isPermissionMode(value: string | undefined): value is PermissionMode {
    return !!value && Object.hasOwn(VALID_PERMISSION_MODES, value);
}

/**
 * Extract permission mode override from Claude CLI args.
 * Supports both:
 * - --permission-mode VALUE
 * - --permission-mode=VALUE
 */
export function extractPermissionModeFromClaudeArgs(claudeArgs?: string[]): PermissionMode | undefined {
    if (!claudeArgs || claudeArgs.length === 0) {
        return undefined;
    }

    let found: PermissionMode | undefined = undefined;
    for (let i = 0; i < claudeArgs.length; i++) {
        const arg = claudeArgs[i];
        if (arg === '--permission-mode') {
            const next = claudeArgs[i + 1];
            if (isPermissionMode(next)) {
                found = next;
            }
            i += 1;
            continue;
        }

        if (arg.startsWith('--permission-mode=')) {
            const value = arg.slice('--permission-mode='.length);
            if (isPermissionMode(value)) {
                found = value;
            }
        }
    }

    return found;
}

/**
 * Resolve the initial permission mode for remote Claude execution.
 * `--dangerously-skip-permissions` takes precedence over all other modes.
 */
export function resolveInitialClaudePermissionMode(
    optionMode: PermissionMode | undefined,
    claudeArgs?: string[],
): PermissionMode | undefined {
    if (claudeArgs?.includes('--dangerously-skip-permissions')) {
        return 'bypassPermissions';
    }
    return extractPermissionModeFromClaudeArgs(claudeArgs) ?? optionMode;
}

/**
 * Enforce sandbox permission policy for Claude.
 * When sandbox is enabled, we always force bypass permissions.
 */
export function applySandboxPermissionPolicy(
    mode: PermissionMode | undefined,
    sandboxEnabled: boolean,
): PermissionMode | undefined {
    if (!sandboxEnabled) {
        return mode;
    }
    return 'bypassPermissions';
}

function isClaudeBypassEquivalent(mode: PermissionMode | undefined): boolean {
    return mode === 'bypassPermissions' || mode === 'yolo';
}

/**
 * Resolve permission mode overrides from remote app messages.
 *
 * Happy app versions can send `permissionMode: "default"` with every message
 * even when the CLI process was started in yolo/bypass mode. Since Claude maps
 * both `yolo` and `bypassPermissions` to bypass at the SDK boundary, do not let
 * that ambient default downgrade either mode, but still allow explicit modes
 * such as plan to take effect.
 */
export function resolveRemoteClaudePermissionMode(
    currentMode: PermissionMode | undefined,
    incomingMode: PermissionMode | undefined,
    sandboxEnabled: boolean,
): PermissionMode | undefined {
    if (!incomingMode) {
        return currentMode;
    }

    const nextMode = applySandboxPermissionPolicy(incomingMode, sandboxEnabled);
    if (isClaudeBypassEquivalent(currentMode) && nextMode === 'default') {
        return currentMode;
    }

    return nextMode;
}
