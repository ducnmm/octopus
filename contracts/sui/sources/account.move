#[allow(lint(public_entry))]
module octopus::account {
    use std::string::String;
    use sui::event;
    use sui::table::{Self, Table};

    const VERSION: u64 = 1;
    const ED25519_PUBLIC_KEY_LENGTH: u64 = 32;
    const MAX_DELEGATE_KEYS: u64 = 20;

    const EAccountAlreadyExists: u64 = 100;
    const EDelegateKeyAlreadyExists: u64 = 101;
    const EDelegateKeyNotFound: u64 = 102;
    const EInvalidPublicKeyLength: u64 = 103;
    const ENotOwner: u64 = 104;
    const ETooManyDelegateKeys: u64 = 105;
    const EWrongVersion: u64 = 106;

    public struct AccountRegistry has key {
        id: UID,
        version: u64,
        accounts: Table<address, ID>,
        delegate_accounts: Table<address, ID>,
    }

    public struct OctopusAccount has key {
        id: UID,
        version: u64,
        owner: address,
        delegate_keys: vector<DelegateKey>,
        repo_count: u64,
        created_at_ms: u64,
    }

    public struct DelegateKey has store, copy, drop {
        public_key: vector<u8>,
        sui_address: address,
        label: String,
        created_at_epoch: u64,
    }

    public struct AccountCreated has copy, drop {
        account_id: ID,
        owner: address,
    }

    public struct DelegateKeyAdded has copy, drop {
        account_id: ID,
        owner: address,
        public_key: vector<u8>,
        sui_address: address,
        label: String,
    }

    public struct DelegateKeyRemoved has copy, drop {
        account_id: ID,
        owner: address,
        public_key: vector<u8>,
        sui_address: address,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(AccountRegistry {
            id: object::new(ctx),
            version: VERSION,
            accounts: table::new(ctx),
            delegate_accounts: table::new(ctx),
        });
    }

    public entry fun create_account(registry: &mut AccountRegistry, ctx: &mut TxContext) {
        assert!(registry.version == VERSION, EWrongVersion);
        let sender = ctx.sender();
        assert!(!table::contains(&registry.accounts, sender), EAccountAlreadyExists);

        let account = OctopusAccount {
            id: object::new(ctx),
            version: VERSION,
            owner: sender,
            delegate_keys: vector::empty(),
            repo_count: 0,
            created_at_ms: ctx.epoch_timestamp_ms(),
        };
        let account_id = object::id(&account);
        table::add(&mut registry.accounts, sender, account_id);

        event::emit(AccountCreated { account_id, owner: sender });
        transfer::share_object(account);
    }

    public entry fun add_delegate_key(
        account: &mut OctopusAccount,
        registry: &mut AccountRegistry,
        public_key: vector<u8>,
        sui_address: address,
        label: String,
        ctx: &TxContext,
    ) {
        assert_current_account_version(account);
        assert!(registry.version == VERSION, EWrongVersion);
        assert!(account.owner == ctx.sender(), ENotOwner);
        assert!(public_key.length() == ED25519_PUBLIC_KEY_LENGTH, EInvalidPublicKeyLength);
        assert!(account.delegate_keys.length() < MAX_DELEGATE_KEYS, ETooManyDelegateKeys);
        assert!(!is_registered_delegate(account, sui_address), EDelegateKeyAlreadyExists);

        let account_id = object::id(account);
        let key = DelegateKey {
            public_key,
            sui_address,
            label,
            created_at_epoch: ctx.epoch(),
        };
        account.delegate_keys.push_back(key);

        if (!table::contains(&registry.delegate_accounts, sui_address)) {
            table::add(&mut registry.delegate_accounts, sui_address, account_id);
        };

        event::emit(DelegateKeyAdded {
            account_id,
            owner: account.owner,
            public_key: key.public_key,
            sui_address: key.sui_address,
            label: key.label,
        });
    }

    public entry fun remove_delegate_key(
        account: &mut OctopusAccount,
        registry: &mut AccountRegistry,
        sui_address: address,
        ctx: &TxContext,
    ) {
        assert_current_account_version(account);
        assert!(registry.version == VERSION, EWrongVersion);
        assert!(account.owner == ctx.sender(), ENotOwner);

        let mut found = false;
        let mut removed_public_key = vector::empty<u8>();
        let mut i = 0;
        let len = account.delegate_keys.length();
        while (i < len) {
            if (account.delegate_keys[i].sui_address == sui_address) {
                removed_public_key = account.delegate_keys[i].public_key;
                account.delegate_keys.remove(i);
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, EDelegateKeyNotFound);

        if (table::contains(&registry.delegate_accounts, sui_address)) {
            let mapped = *table::borrow(&registry.delegate_accounts, sui_address);
            if (mapped == object::id(account)) {
                let _ = table::remove(&mut registry.delegate_accounts, sui_address);
            };
        };

        event::emit(DelegateKeyRemoved {
            account_id: object::id(account),
            owner: account.owner,
            public_key: removed_public_key,
            sui_address,
        });
    }

    fun assert_current_account_version(account: &OctopusAccount) {
        assert!(account.version == VERSION, EWrongVersion);
    }

    public fun can_manage_account(account: &OctopusAccount, caller: address): bool {
        caller == account.owner || is_registered_delegate(account, caller)
    }

    public fun is_registered_delegate(account: &OctopusAccount, sui_address: address): bool {
        let mut i = 0;
        let len = account.delegate_keys.length();
        while (i < len) {
            if (account.delegate_keys[i].sui_address == sui_address) {
                return true
            };
            i = i + 1;
        };
        false
    }

    public(package) fun increment_repo_count(account: &mut OctopusAccount) {
        assert_current_account_version(account);
        account.repo_count = account.repo_count + 1;
    }

    public fun owner(account: &OctopusAccount): address {
        account.owner
    }

    public fun repo_count(account: &OctopusAccount): u64 {
        account.repo_count
    }
}
