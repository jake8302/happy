/**
 * Pure data model for stored Claude accounts (named setup tokens).
 * A "Claude account" is a display name + an OAuth token obtained via
 * `claude setup-token`, used to spawn sessions under a different
 * Anthropic account than the one the machine is logged into.
 *
 * Persistence and the reactive store live in claudeAccounts.ts; this
 * module is import-free so list operations stay unit-testable.
 */

export interface ClaudeAccount {
    id: string;
    name: string;
    token: string;
    createdAt: number;
}

export function parseClaudeAccounts(raw: string | null): ClaudeAccount[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry): entry is ClaudeAccount =>
            !!entry
            && typeof entry === 'object'
            && typeof entry.id === 'string'
            && typeof entry.name === 'string'
            && typeof entry.token === 'string'
            && typeof entry.createdAt === 'number',
        );
    } catch (e) {
        console.error('Failed to parse stored Claude accounts', e);
        return [];
    }
}

export function addClaudeAccount(
    accounts: ClaudeAccount[],
    account: { id: string; name: string; token: string; createdAt: number },
): ClaudeAccount[] {
    const name = account.name.trim();
    const token = account.token.trim();
    if (!name || !token) return accounts;
    return [...accounts, { ...account, name, token }];
}

export function renameClaudeAccount(accounts: ClaudeAccount[], id: string, name: string): ClaudeAccount[] {
    const trimmed = name.trim();
    if (!trimmed) return accounts;
    return accounts.map((a) => a.id === id ? { ...a, name: trimmed } : a);
}

export function removeClaudeAccount(accounts: ClaudeAccount[], id: string): ClaudeAccount[] {
    return accounts.filter((a) => a.id !== id);
}

export function findClaudeAccount(accounts: ClaudeAccount[], id: string | null): ClaudeAccount | null {
    if (!id) return null;
    return accounts.find((a) => a.id === id) ?? null;
}

/** Short non-sensitive preview of a token for list subtitles, e.g. "sk-ant-…f3ab". */
export function maskClaudeToken(token: string): string {
    if (token.length <= 12) return '…';
    return `${token.slice(0, 7)}…${token.slice(-4)}`;
}
