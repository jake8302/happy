/**
 * Reactive store + secure persistence for Claude accounts (named setup tokens).
 * Tokens are secrets: stored in SecureStore on native (localStorage on web,
 * matching TokenStorage), never synced to the server. At spawn time the
 * selected account's token rides the E2E-encrypted RPC to the daemon, which
 * exposes it to the spawned claude process as CLAUDE_CODE_OAUTH_TOKEN.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import {
    addClaudeAccount,
    findClaudeAccount,
    parseClaudeAccounts,
    removeClaudeAccount,
    renameClaudeAccount,
    type ClaudeAccount,
} from './claudeAccountsData';
import { loadSessionAccountIds, saveSessionAccountIds } from '@/sync/persistence';

const ACCOUNTS_KEY = 'claude_setup_tokens_v1';

async function readStoredAccounts(): Promise<ClaudeAccount[]> {
    if (Platform.OS === 'web') {
        return parseClaudeAccounts(localStorage.getItem(ACCOUNTS_KEY));
    }
    try {
        return parseClaudeAccounts(await SecureStore.getItemAsync(ACCOUNTS_KEY));
    } catch (error) {
        console.error('Error reading Claude accounts:', error);
        return [];
    }
}

async function writeStoredAccounts(accounts: ClaudeAccount[]): Promise<void> {
    const json = JSON.stringify(accounts);
    if (Platform.OS === 'web') {
        localStorage.setItem(ACCOUNTS_KEY, json);
        return;
    }
    try {
        await SecureStore.setItemAsync(ACCOUNTS_KEY, json);
    } catch (error) {
        console.error('Error saving Claude accounts:', error);
    }
}

interface ClaudeAccountsState {
    accounts: ClaudeAccount[];
    loaded: boolean;
    addAccount: (name: string, token: string) => Promise<ClaudeAccount | null>;
    renameAccount: (id: string, name: string) => Promise<void>;
    removeAccount: (id: string) => Promise<void>;
}

export const useClaudeAccounts = create<ClaudeAccountsState>()((set, get) => ({
    accounts: [],
    loaded: false,

    addAccount: async (name, token) => {
        const account: ClaudeAccount = { id: randomUUID(), name: name.trim(), token: token.trim(), createdAt: Date.now() };
        const next = addClaudeAccount(get().accounts, account);
        if (next === get().accounts) return null;
        set({ accounts: next });
        await writeStoredAccounts(next);
        return account;
    },

    renameAccount: async (id, name) => {
        const next = renameClaudeAccount(get().accounts, id, name);
        set({ accounts: next });
        await writeStoredAccounts(next);
    },

    removeAccount: async (id) => {
        const next = removeClaudeAccount(get().accounts, id);
        set({ accounts: next });
        await writeStoredAccounts(next);
    },
}));

// Hydrate once at module load; consumers render the empty list until then.
readStoredAccounts().then((accounts) => {
    useClaudeAccounts.setState({ accounts, loaded: true });
});

/**
 * Per-session record of which stored account a session was spawned with,
 * so resume can re-apply the same token (resume reuses the session id).
 */
export function rememberSessionAccount(sessionId: string, accountId: string | null): void {
    const ids = loadSessionAccountIds();
    if (accountId) {
        ids[sessionId] = accountId;
    } else {
        delete ids[sessionId];
    }
    saveSessionAccountIds(ids);
}

/** Token for the account a session was spawned with, or null for machine login (or a since-deleted account). */
export function getSessionAccountToken(sessionId: string): string | null {
    const accountId = loadSessionAccountIds()[sessionId] ?? null;
    return findClaudeAccount(useClaudeAccounts.getState().accounts, accountId)?.token ?? null;
}
