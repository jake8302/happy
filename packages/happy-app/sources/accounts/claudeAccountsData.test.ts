import { describe, it, expect } from 'vitest';
import {
    addClaudeAccount,
    findClaudeAccount,
    maskClaudeToken,
    parseClaudeAccounts,
    removeClaudeAccount,
    renameClaudeAccount,
    type ClaudeAccount,
} from './claudeAccountsData';

const account = (overrides: Partial<ClaudeAccount> = {}): ClaudeAccount => ({
    id: 'id-1',
    name: 'Personal',
    token: 'sk-ant-oat01-abcdefghijklmnop',
    createdAt: 1718000000000,
    ...overrides,
});

describe('parseClaudeAccounts', () => {
    it('returns empty list for null, garbage, and non-arrays', () => {
        expect(parseClaudeAccounts(null)).toEqual([]);
        expect(parseClaudeAccounts('not json')).toEqual([]);
        expect(parseClaudeAccounts('{"a":1}')).toEqual([]);
    });

    it('round-trips valid accounts and drops malformed entries', () => {
        const valid = account();
        const raw = JSON.stringify([valid, { id: 'x' }, null, 42]);
        expect(parseClaudeAccounts(raw)).toEqual([valid]);
    });
});

describe('addClaudeAccount', () => {
    it('appends and trims name/token', () => {
        const result = addClaudeAccount([], { id: 'a', name: '  Work  ', token: ' tok ', createdAt: 1 });
        expect(result).toEqual([{ id: 'a', name: 'Work', token: 'tok', createdAt: 1 }]);
    });

    it('rejects blank name or token', () => {
        expect(addClaudeAccount([], { id: 'a', name: '  ', token: 'tok', createdAt: 1 })).toEqual([]);
        expect(addClaudeAccount([], { id: 'a', name: 'Work', token: '', createdAt: 1 })).toEqual([]);
    });
});

describe('renameClaudeAccount', () => {
    it('renames only the matching account and trims', () => {
        const list = [account(), account({ id: 'id-2', name: 'Work' })];
        const result = renameClaudeAccount(list, 'id-2', ' Quorvo ');
        expect(result[0].name).toBe('Personal');
        expect(result[1].name).toBe('Quorvo');
    });

    it('ignores blank names', () => {
        const list = [account()];
        expect(renameClaudeAccount(list, 'id-1', '   ')).toEqual(list);
    });
});

describe('removeClaudeAccount', () => {
    it('removes by id', () => {
        const list = [account(), account({ id: 'id-2' })];
        expect(removeClaudeAccount(list, 'id-1')).toEqual([account({ id: 'id-2' })]);
    });
});

describe('findClaudeAccount', () => {
    it('finds by id and returns null for null or missing ids', () => {
        const list = [account()];
        expect(findClaudeAccount(list, 'id-1')).toEqual(account());
        expect(findClaudeAccount(list, null)).toBeNull();
        expect(findClaudeAccount(list, 'nope')).toBeNull();
    });
});

describe('maskClaudeToken', () => {
    it('keeps prefix and last 4 chars only', () => {
        expect(maskClaudeToken('sk-ant-oat01-abcdefghijklmnop')).toBe('sk-ant-…mnop');
    });

    it('fully masks short tokens', () => {
        expect(maskClaudeToken('short')).toBe('…');
    });
});
