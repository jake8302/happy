import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Modal } from '@/modal';
import { useClaudeAccounts } from '@/accounts/claudeAccounts';
import { maskClaudeToken } from '@/accounts/claudeAccountsData';
import { t } from '@/text';

export default function ClaudeAccountsSettingsScreen() {
    const { accounts, addAccount, renameAccount, removeAccount } = useClaudeAccounts();

    const handleAdd = React.useCallback(async () => {
        const name = await Modal.prompt(
            'Account Name',
            'A label for this account, e.g. "Personal" or "Work"',
            { placeholder: 'Personal' },
        );
        if (!name?.trim()) return;

        const token = await Modal.prompt(
            'Setup Token',
            'Run `claude setup-token` on any machine and paste the result',
            { placeholder: 'sk-ant-oat01-...', inputType: 'secure-text' },
        );
        if (!token?.trim()) return;

        await addAccount(name, token);
    }, [addAccount]);

    const handleAccountPress = React.useCallback((id: string, currentName: string) => {
        Modal.alert(currentName, undefined, [
            {
                text: 'Rename',
                onPress: async () => {
                    const name = await Modal.prompt('Rename Account', undefined, { defaultValue: currentName });
                    if (name?.trim()) {
                        await renameAccount(id, name);
                    }
                },
            },
            {
                text: t('common.delete'),
                style: 'destructive',
                onPress: async () => {
                    const confirmed = await Modal.confirm(
                        'Delete Account?',
                        `The stored setup token for "${currentName}" will be removed.`,
                        { destructive: true },
                    );
                    if (confirmed) {
                        await removeAccount(id);
                    }
                },
            },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    }, [renameAccount, removeAccount]);

    return (
        <ItemList style={{ paddingTop: 0 }}>
            <ItemGroup
                title="Claude Accounts"
                footer="Stored setup tokens let you start a session under a different Anthropic account than the one the machine is logged into. Generate one with `claude setup-token`. Tokens are kept in the device keychain and only sent to your machine over the encrypted channel when spawning."
            >
                {accounts.map((account) => (
                    <Item
                        key={account.id}
                        title={account.name}
                        subtitle={maskClaudeToken(account.token)}
                        icon={<Ionicons name="key-outline" size={29} color="#5856D6" />}
                        onPress={() => handleAccountPress(account.id, account.name)}
                        showChevron={false}
                    />
                ))}
                <Item
                    title="Add Account"
                    icon={<Ionicons name="add-circle-outline" size={29} color="#34C759" />}
                    onPress={handleAdd}
                    showChevron={false}
                />
            </ItemGroup>
        </ItemList>
    );
}
