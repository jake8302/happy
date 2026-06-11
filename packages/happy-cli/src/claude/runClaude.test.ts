import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Credentials } from '@/persistence';
import type { AgentState, Metadata } from '@/api/types';

const {
    mockApiClientCreate,
    mockCreateSessionScanner,
    mockLoop,
    mockNotifyDaemonSessionStarted,
    mockReadSettings,
    mockStartHappyServer,
    mockStartHookServer,
    mockRegisterKillSessionHandler,
} = vi.hoisted(() => ({
    mockApiClientCreate: vi.fn(),
    mockCreateSessionScanner: vi.fn(),
    mockLoop: vi.fn(),
    mockNotifyDaemonSessionStarted: vi.fn(),
    mockReadSettings: vi.fn(),
    mockStartHappyServer: vi.fn(),
    mockStartHookServer: vi.fn(),
    mockRegisterKillSessionHandler: vi.fn(),
}));

vi.mock('@/api/api', () => ({
    ApiClient: {
        create: mockApiClientCreate,
    },
}));

vi.mock('@/persistence', () => ({
    readSettings: mockReadSettings,
}));

vi.mock('@/claude/utils/sessionScanner', () => ({
    createSessionScanner: mockCreateSessionScanner,
}));

vi.mock('@/claude/loop', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/claude/loop')>();
    return {
        ...original,
        loop: mockLoop,
    };
});

vi.mock('@/daemon/controlClient', () => ({
    notifyDaemonSessionStarted: mockNotifyDaemonSessionStarted,
}));

vi.mock('@/daemon/run', () => ({
    initialMachineMetadata: {},
}));

vi.mock('@/claude/utils/startHappyServer', () => ({
    startHappyServer: mockStartHappyServer,
}));

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: mockStartHookServer,
}));

vi.mock('@/claude/utils/generateHookSettings', () => ({
    generateHookSettingsFile: vi.fn(() => '/tmp/happy-hook-settings.json'),
    cleanupHookSettingsFile: vi.fn(),
}));

vi.mock('./registerKillSessionHandler', () => ({
    registerKillSessionHandler: mockRegisterKillSessionHandler,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
        infoDeveloper: vi.fn(),
    },
}));

vi.mock('@/ui/doctor', () => ({
    getEnvironmentInfo: vi.fn(() => ({})),
}));

vi.mock('@/utils/serverConnectionErrors', () => ({
    connectionState: {
        setBackend: vi.fn(),
        notifyOffline: vi.fn(),
        fail: vi.fn(),
    },
    startOfflineReconnection: vi.fn(),
}));

vi.mock('@/claude/claudeLocal', () => ({
    claudeLocal: vi.fn(),
}));

import { runClaude, StartOptions } from './runClaude';

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const credentials: Credentials = {
    token: 'token',
    encryption: { type: 'legacy', secret: new Uint8Array(32) },
};

function createSessionClient() {
    return {
        sessionId: 'happy-session-1',
        suppressNextArchiveSignal: vi.fn(),
        skipExistingMessages: vi.fn(),
        updateMetadata: vi.fn(),
        sendClaudeSessionMessage: vi.fn(),
        onUserMessage: vi.fn(),
        onFileEvent: vi.fn(),
        on: vi.fn(),
        trackAttachmentDownload: vi.fn(),
        drainAttachmentsForUserMessage: vi.fn(async () => []),
        downloadAndDecryptAttachment: vi.fn(),
        getMetadata: vi.fn(() => ({})),
        sendSessionEvent: vi.fn(),
        updateAgentState: vi.fn(),
        rpcHandlerManager: {
            registerHandler: vi.fn(),
        },
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    };
}

function createApi(sessionClient: ReturnType<typeof createSessionClient>) {
    return {
        getOrCreateMachine: vi.fn(async () => ({})),
        getOrCreateSession: vi.fn(async (_opts: { tag: string; metadata: Metadata; state: AgentState }) => ({
            id: 'happy-session-1',
            seq: 0,
            metadata: {},
            metadataVersion: 0,
            agentState: {},
            agentStateVersion: 0,
            encryptionKey: new Uint8Array(32),
            encryptionVariant: 'legacy' as const,
        })),
        sessionSyncClient: vi.fn(() => sessionClient),
        deactivateSession: vi.fn(async () => {}),
    };
}

function startRun(options: StartOptions) {
    const sessionClient = createSessionClient();
    const api = createApi(sessionClient);
    mockApiClientCreate.mockResolvedValue(api);

    const loopDeferred = createDeferred<number>();
    mockLoop.mockReturnValue(loopDeferred.promise);

    const runPromise = runClaude(credentials, options);
    return { sessionClient, api, loopDeferred, runPromise };
}

async function finishRun(runPromise: Promise<void>, loopDeferred: { resolve: (value: number) => void }) {
    loopDeferred.resolve(0);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
    }) as never);
    await expect(runPromise).rejects.toThrow('process.exit');
    exitSpy.mockRestore();
}

const processEvents = ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'] as const;
const originalListeners = new Map<string, Array<(...args: any[]) => void>>();

beforeEach(() => {
    vi.clearAllMocks();
    for (const event of processEvents) {
        originalListeners.set(event, process.listeners(event as any) as Array<(...args: any[]) => void>);
    }

    delete process.env.HAPPY_RECONNECT_SESSION_ID;
    delete process.env.HAPPY_RECONNECT_ENCRYPTION_KEY;
    delete process.env.HAPPY_RECONNECT_ENCRYPTION_VARIANT;
    delete process.env.HAPPY_RECONNECT_SEQ;
    delete process.env.HAPPY_RECONNECT_METADATA_VERSION;
    delete process.env.HAPPY_RECONNECT_AGENT_STATE_VERSION;
    delete process.env.HAPPY_FORKED_FROM_SESSION_ID;
    delete process.env.HAPPY_FORKED_FROM_MESSAGE_ID;
    delete process.env.HAPPY_FORK_CLAUDE_SESSION_ID;

    mockReadSettings.mockResolvedValue({
        machineId: 'machine-1',
        sandboxConfig: undefined,
    });
    mockNotifyDaemonSessionStarted.mockResolvedValue({});
    mockStartHappyServer.mockResolvedValue({
        url: 'http://127.0.0.1:12345',
        toolNames: ['change_title'],
        stop: vi.fn(),
    });
    mockStartHookServer.mockResolvedValue({
        port: 23456,
        stop: vi.fn(),
    });
    mockCreateSessionScanner.mockResolvedValue({
        onNewSession: vi.fn(),
        cleanup: vi.fn(),
    });
});

afterEach(() => {
    for (const [event, listeners] of originalListeners) {
        process.removeAllListeners(event as any);
        for (const listener of listeners) {
            process.on(event as any, listener);
        }
    }
    originalListeners.clear();
});

describe('runClaude remote JSONL scanner', () => {
    it('does not forward terminal JSONL messages while local mode owns the transcript', async () => {
        const { sessionClient, loopDeferred, runPromise } = startRun({
            startingMode: 'local',
            shouldStartDaemon: false,
        });

        await vi.waitFor(() => {
            expect(mockLoop).toHaveBeenCalled();
            expect(mockCreateSessionScanner).toHaveBeenCalled();
        });

        const scannerOptions = mockCreateSessionScanner.mock.calls[0][0];
        scannerOptions.onMessage({
            type: 'user',
            uuid: 'local-owned-user',
            parentUuid: null,
            isSidechain: false,
            sessionId: 'claude-session-1',
            timestamp: new Date().toISOString(),
            message: {
                role: 'user',
                content: 'typed in local terminal',
            },
        });

        expect(sessionClient.sendClaudeSessionMessage).not.toHaveBeenCalled();

        const loopOptions = mockLoop.mock.calls[0][0];
        loopOptions.onModeChange('remote');
        scannerOptions.onMessage({
            type: 'user',
            uuid: 'remote-terminal-user',
            parentUuid: null,
            isSidechain: false,
            sessionId: 'claude-session-1',
            timestamp: new Date().toISOString(),
            message: {
                role: 'user',
                content: 'typed in parallel remote terminal',
            },
        });

        expect(sessionClient.sendClaudeSessionMessage).toHaveBeenCalledTimes(1);
        expect(sessionClient.sendClaudeSessionMessage).toHaveBeenCalledWith(
            expect.objectContaining({ uuid: 'remote-terminal-user' }),
        );

        await finishRun(runPromise, loopDeferred);
    });
});

describe('runClaude mode metadata', () => {
    it('publishes the launch model/effort/permission mode in the initial session metadata', async () => {
        const { api, loopDeferred, runPromise } = startRun({
            startingMode: 'local',
            shouldStartDaemon: false,
            model: 'fable',
            effort: 'xhigh',
            permissionMode: 'plan',
        });

        await vi.waitFor(() => {
            expect(api.getOrCreateSession).toHaveBeenCalled();
        });

        const { metadata } = api.getOrCreateSession.mock.calls[0][0];
        expect(metadata).toEqual(expect.objectContaining({
            currentModelCode: 'fable',
            currentThoughtLevelCode: 'xhigh',
            currentOperatingModeCode: 'plan',
        }));

        await finishRun(runPromise, loopDeferred);
    });

    it('publishes app-picker-compatible defaults when launched bare', async () => {
        const { api, loopDeferred, runPromise } = startRun({
            startingMode: 'local',
            shouldStartDaemon: false,
        });

        await vi.waitFor(() => {
            expect(api.getOrCreateSession).toHaveBeenCalled();
        });

        // The CLI-internal default mode is 'yolo', which is not a key the
        // app's Claude permission picker knows — it must publish as the
        // SDK-mapped 'bypassPermissions' instead.
        const { metadata } = api.getOrCreateSession.mock.calls[0][0];
        expect(metadata).toEqual(expect.objectContaining({
            currentModelCode: 'opus',
            currentThoughtLevelCode: 'medium',
            currentOperatingModeCode: 'bypassPermissions',
        }));

        await finishRun(runPromise, loopDeferred);
    });

    it('republishes metadata on user-message overrides and skips unchanged values', async () => {
        const { sessionClient, loopDeferred, runPromise } = startRun({
            startingMode: 'local',
            shouldStartDaemon: false,
        });

        await vi.waitFor(() => {
            expect(sessionClient.onUserMessage).toHaveBeenCalled();
        });
        const handleUserMessage = sessionClient.onUserMessage.mock.calls[0][0];

        await handleUserMessage({
            content: { type: 'text', text: 'hello' },
            meta: { permissionMode: 'acceptEdits', model: 'sonnet', effort: 'low' },
        });
        expect(sessionClient.updateMetadata).toHaveBeenCalledTimes(1);
        const firstUpdate = sessionClient.updateMetadata.mock.calls[0][0];
        expect(firstUpdate({ path: '/work' })).toEqual(expect.objectContaining({
            path: '/work',
            currentModelCode: 'sonnet',
            currentThoughtLevelCode: 'low',
            currentOperatingModeCode: 'acceptEdits',
        }));

        await handleUserMessage({
            content: { type: 'text', text: 'same settings again' },
            meta: { permissionMode: 'acceptEdits', model: 'sonnet', effort: 'low' },
        });
        expect(sessionClient.updateMetadata).toHaveBeenCalledTimes(1);

        await handleUserMessage({
            content: { type: 'text', text: 'reset the model' },
            meta: { model: null },
        });
        expect(sessionClient.updateMetadata).toHaveBeenCalledTimes(2);
        const secondUpdate = sessionClient.updateMetadata.mock.calls[1][0];
        expect(secondUpdate({})).toEqual(expect.objectContaining({
            currentModelCode: 'opus',
            currentThoughtLevelCode: 'low',
            currentOperatingModeCode: 'acceptEdits',
        }));

        await finishRun(runPromise, loopDeferred);
    });

    it('keeps user picks across abort instead of resetting to launch defaults', async () => {
        const { sessionClient, loopDeferred, runPromise } = startRun({
            startingMode: 'local',
            shouldStartDaemon: false,
        });

        await vi.waitFor(() => {
            expect(sessionClient.onUserMessage).toHaveBeenCalled();
            expect(mockLoop).toHaveBeenCalled();
        });
        const handleUserMessage = sessionClient.onUserMessage.mock.calls[0][0];

        await handleUserMessage({
            content: { type: 'text', text: 'hello' },
            meta: { permissionMode: 'acceptEdits', model: 'fable', effort: 'xhigh' },
        });
        expect(sessionClient.updateMetadata).toHaveBeenCalledTimes(1);

        mockLoop.mock.calls[0][0].onAbort();

        // No reset republish: the picked mode trio survives the abort, so
        // the change-gated publisher has nothing new to say.
        expect(sessionClient.updateMetadata).toHaveBeenCalledTimes(1);

        // And a follow-up message without overrides still runs on the picks.
        await handleUserMessage({
            content: { type: 'text', text: 'continue' },
            meta: {},
        });
        expect(sessionClient.updateMetadata).toHaveBeenCalledTimes(1);

        await finishRun(runPromise, loopDeferred);
    });
});
