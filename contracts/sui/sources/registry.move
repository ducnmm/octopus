module octopus::registry {
    use std::string::String;
    use sui::bcs;
    use sui::event;
    use sui::table::{Self, Table};
    use octopus::account::{Self, OctopusAccount};

    const VERSION: u64 = 1;
    const VISIBILITY_PUBLIC: u8 = 0;
    const VISIBILITY_PRIVATE: u8 = 1;

    const ERepoAlreadyExists: u64 = 200;
    const ERepoNotActive: u64 = 201;
    const EInvalidOldCommit: u64 = 202;
    const EInvalidVisibility: u64 = 203;
    const ENotWriter: u64 = 204;
    const EWrongVersion: u64 = 205;
    const ENotReader: u64 = 206;
    const EInvalidSealKey: u64 = 207;

    public struct RepoRegistry has key {
        id: UID,
        version: u64,
        repos: Table<String, ID>,
    }

    public struct Repo has key {
        id: UID,
        version: u64,
        repo_id: String,
        owner: address,
        name: String,
        visibility: u8,
        default_branch: String,
        refs: Table<String, RefState>,
        manifests: Table<u64, PackManifest>,
        readers: Table<address, bool>,
        writers: Table<address, bool>,
        next_seq: u64,
        active: bool,
        created_at_ms: u64,
    }

    public struct RefState has store, copy, drop {
        commit_digest: String,
        manifest_id: String,
        seq: u64,
        updated_at_ms: u64,
    }

    public struct PackManifest has store, copy, drop {
        manifest_id: String,
        repo_id: String,
        ref_name: String,
        old_commit: String,
        new_commit: String,
        walrus_blob_id: String,
        walrus_blob_object_id: String,
        artifact_digest: String,
        artifact_size_bytes: u64,
        base_manifest_id: String,
        parent_manifest_id: String,
        is_snapshot: bool,
        created_by: address,
        created_at_ms: u64,
        seq: u64,
    }

    public struct RepoCreated has copy, drop {
        repo_id: ID,
        repo_key: String,
        owner: address,
        name: String,
        visibility: u8,
    }

    public struct RefUpdated has copy, drop {
        repo_id: ID,
        repo_key: String,
        ref_name: String,
        old_commit: String,
        new_commit: String,
        manifest_id: String,
        walrus_blob_id: String,
        artifact_digest: String,
        seq: u64,
        updated_by: address,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(RepoRegistry {
            id: object::new(ctx),
            version: VERSION,
            repos: table::new(ctx),
        });
    }

    public fun create_repo(
        registry: &mut RepoRegistry,
        account: &mut OctopusAccount,
        repo_key: String,
        name: String,
        visibility: u8,
        default_branch: String,
        ctx: &mut TxContext,
    ) {
        assert!(registry.version == VERSION, EWrongVersion);
        assert!(visibility == VISIBILITY_PUBLIC || visibility == VISIBILITY_PRIVATE, EInvalidVisibility);
        assert!(account::can_manage_account(account, ctx.sender()), ENotWriter);
        assert!(!table::contains(&registry.repos, repo_key), ERepoAlreadyExists);

        let repo = Repo {
            id: object::new(ctx),
            version: VERSION,
            repo_id: repo_key,
            owner: account::owner(account),
            name,
            visibility,
            default_branch,
            refs: table::new(ctx),
            manifests: table::new(ctx),
            readers: table::new(ctx),
            writers: table::new(ctx),
            next_seq: 1,
            active: true,
            created_at_ms: ctx.epoch_timestamp_ms(),
        };
        let repo_id = object::id(&repo);
        table::add(&mut registry.repos, repo_key, repo_id);
        account::increment_repo_count(account);

        event::emit(RepoCreated {
            repo_id,
            repo_key,
            owner: account::owner(account),
            name,
            visibility,
        });
        transfer::share_object(repo);
    }

    public fun add_member(repo: &mut Repo, writer: address, ctx: &TxContext) {
        assert_current_repo(repo);
        assert!(repo.owner == ctx.sender(), ENotWriter);
        if (!table::contains(&repo.writers, writer)) {
            table::add(&mut repo.writers, writer, true);
        };
    }

    public fun remove_member(repo: &mut Repo, writer: address, ctx: &TxContext) {
        assert_current_repo(repo);
        assert!(repo.owner == ctx.sender(), ENotWriter);
        if (table::contains(&repo.writers, writer)) {
            let _ = table::remove(&mut repo.writers, writer);
        };
    }

    public fun add_reader(repo: &mut Repo, reader: address, ctx: &TxContext) {
        assert_current_repo(repo);
        assert!(repo.owner == ctx.sender(), ENotWriter);
        if (!table::contains(&repo.readers, reader)) {
            table::add(&mut repo.readers, reader, true);
        };
    }

    public fun remove_reader(repo: &mut Repo, reader: address, ctx: &TxContext) {
        assert_current_repo(repo);
        assert!(repo.owner == ctx.sender(), ENotWriter);
        if (table::contains(&repo.readers, reader)) {
            let _ = table::remove(&mut repo.readers, reader);
        };
    }

    public fun set_visibility(repo: &mut Repo, visibility: u8, ctx: &TxContext) {
        assert_current_repo(repo);
        assert!(repo.owner == ctx.sender(), ENotWriter);
        assert!(visibility == VISIBILITY_PUBLIC || visibility == VISIBILITY_PRIVATE, EInvalidVisibility);
        repo.visibility = visibility;
    }

    public fun set_default_branch(repo: &mut Repo, default_branch: String, ctx: &TxContext) {
        assert_current_repo(repo);
        assert!(repo.owner == ctx.sender(), ENotWriter);
        repo.default_branch = default_branch;
    }

    public fun push_ref(
        repo: &mut Repo,
        account: &OctopusAccount,
        ref_name: String,
        expected_old_commit: String,
        new_commit: String,
        walrus_blob_id: String,
        walrus_blob_object_id: String,
        artifact_digest: String,
        artifact_size_bytes: u64,
        base_manifest_id: String,
        parent_manifest_id: String,
        is_snapshot: bool,
        ctx: &mut TxContext,
    ) {
        assert_current_repo(repo);
        assert!(is_writer_for_account(repo, account, ctx.sender()), ENotWriter);
        assert_expected_old_commit(repo, ref_name, expected_old_commit);

        let seq = repo.next_seq;
        let manifest_id = derive_manifest_id(ref_name, seq, artifact_digest);
        let created_at_ms = ctx.epoch_timestamp_ms();
        let manifest = PackManifest {
            manifest_id,
            repo_id: repo.repo_id,
            ref_name,
            old_commit: expected_old_commit,
            new_commit,
            walrus_blob_id,
            walrus_blob_object_id,
            artifact_digest,
            artifact_size_bytes,
            base_manifest_id,
            parent_manifest_id,
            is_snapshot,
            created_by: ctx.sender(),
            created_at_ms,
            seq,
        };

        table::add(&mut repo.manifests, seq, manifest);
        upsert_ref(repo, ref_name, RefState {
            commit_digest: new_commit,
            manifest_id,
            seq,
            updated_at_ms: created_at_ms,
        });
        repo.next_seq = seq + 1;

        event::emit(RefUpdated {
            repo_id: object::id(repo),
            repo_key: repo.repo_id,
            ref_name,
            old_commit: expected_old_commit,
            new_commit,
            manifest_id,
            walrus_blob_id,
            artifact_digest,
            seq,
            updated_by: ctx.sender(),
        });
    }

    fun assert_current_repo(repo: &Repo) {
        assert!(repo.version == VERSION, EWrongVersion);
        assert!(repo.active, ERepoNotActive);
    }

    fun is_writer(repo: &Repo, caller: address): bool {
        caller == repo.owner || table::contains(&repo.writers, caller)
    }

    fun is_writer_for_account(repo: &Repo, account: &OctopusAccount, caller: address): bool {
        let account_owner = account::owner(account);
        assert!(account_owner == repo.owner, ENotWriter);
        account::can_manage_account(account, caller) || is_writer(repo, caller)
    }

    fun is_reader(repo: &Repo, caller: address): bool {
        repo.visibility == VISIBILITY_PUBLIC ||
            is_writer(repo, caller) ||
            table::contains(&repo.readers, caller)
    }

    public fun can_read(repo: &Repo, account: &OctopusAccount, caller: address): bool {
        let account_owner = account::owner(account);
        if (account_owner == repo.owner && account::can_manage_account(account, caller)) {
            true
        } else {
            is_reader(repo, caller)
        }
    }

    public fun seal_approve(
        id: vector<u8>,
        repo: &Repo,
        account: &OctopusAccount,
        ctx: &TxContext,
    ) {
        assert_current_repo(repo);
        assert!(id == seal_key_id(repo), EInvalidSealKey);
        assert!(can_read(repo, account, ctx.sender()), ENotReader);
    }

    public fun seal_key_id(repo: &Repo): vector<u8> {
        bcs::to_bytes(&object::id(repo))
    }

    fun assert_expected_old_commit(repo: &Repo, ref_name: String, expected_old_commit: String) {
        if (table::contains(&repo.refs, ref_name)) {
            let current = table::borrow(&repo.refs, ref_name);
            assert!(current.commit_digest == expected_old_commit, EInvalidOldCommit);
        } else {
            assert!(expected_old_commit == std::string::utf8(b""), EInvalidOldCommit);
        };
    }

    fun upsert_ref(repo: &mut Repo, ref_name: String, state: RefState) {
        if (table::contains(&repo.refs, ref_name)) {
            let _ = table::remove(&mut repo.refs, ref_name);
        };
        table::add(&mut repo.refs, ref_name, state);
    }

    fun derive_manifest_id(ref_name: String, seq: u64, artifact_digest: String): String {
        let mut id = std::string::utf8(b"");
        id.append(ref_name);
        id.append(std::string::utf8(b"#"));
        id.append(seq.to_string());
        id.append(std::string::utf8(b"#"));
        id.append(artifact_digest);
        id
    }

    public fun visibility_public(): u8 {
        VISIBILITY_PUBLIC
    }

    public fun visibility_private(): u8 {
        VISIBILITY_PRIVATE
    }

    public fun repo_owner(repo: &Repo): address {
        repo.owner
    }

    public fun repo_next_seq(repo: &Repo): u64 {
        repo.next_seq
    }

    #[test_only]
    fun new_registry_for_testing(ctx: &mut TxContext): RepoRegistry {
        RepoRegistry {
            id: object::new(ctx),
            version: VERSION,
            repos: table::new(ctx),
        }
    }

    #[test_only]
    fun new_repo_for_testing(owner: address, visibility: u8, ctx: &mut TxContext): Repo {
        Repo {
            id: object::new(ctx),
            version: VERSION,
            repo_id: std::string::utf8(b"owner/repo"),
            owner,
            name: std::string::utf8(b"repo"),
            visibility,
            default_branch: std::string::utf8(b"main"),
            refs: table::new(ctx),
            manifests: table::new(ctx),
            readers: table::new(ctx),
            writers: table::new(ctx),
            next_seq: 1,
            active: true,
            created_at_ms: ctx.epoch_timestamp_ms(),
        }
    }

    #[test_only]
    fun destroy_registry_for_testing(registry: RepoRegistry) {
        let RepoRegistry { id, version: _, repos } = registry;
        repos.destroy_empty();
        id.delete();
    }

    #[test_only]
    fun destroy_repo_for_testing(repo: Repo) {
        let Repo {
            id,
            version: _,
            repo_id: _,
            owner: _,
            name: _,
            visibility: _,
            default_branch: _,
            refs,
            manifests,
            readers,
            writers,
            next_seq: _,
            active: _,
            created_at_ms: _,
        } = repo;
        refs.destroy_empty();
        manifests.destroy_empty();
        readers.destroy_empty();
        writers.destroy_empty();
        id.delete();
    }

    #[test_only]
    fun push_main_ref(
        repo: &mut Repo,
        account: &OctopusAccount,
        expected_old_commit: String,
        new_commit: String,
        artifact_digest: String,
        ctx: &mut TxContext,
    ) {
        push_ref(
            repo,
            account,
            std::string::utf8(b"refs/heads/main"),
            expected_old_commit,
            new_commit,
            std::string::utf8(b"walrus-blob"),
            std::string::utf8(b"walrus-object"),
            artifact_digest,
            42,
            std::string::utf8(b"base-manifest"),
            std::string::utf8(b"parent-manifest"),
            true,
            ctx,
        );
    }

    #[test]
    fun create_repo_registers_repo_and_increments_account() {
        let mut ctx = tx_context::dummy();
        let owner = ctx.sender();
        let mut registry = new_registry_for_testing(&mut ctx);
        let mut account = account::new_account_for_testing(owner, &mut ctx);

        create_repo(
            &mut registry,
            &mut account,
            std::string::utf8(b"owner/repo"),
            std::string::utf8(b"repo"),
            VISIBILITY_PRIVATE,
            std::string::utf8(b"main"),
            &mut ctx,
        );

        assert!(table::contains(&registry.repos, std::string::utf8(b"owner/repo")), 0);
        assert!(account::repo_count(&account) == 1, 0);

        transfer::share_object(registry);
        account::destroy_account_for_testing(account);
    }

    #[test]
    fun readers_and_writers_control_private_repo_access() {
        let mut ctx = tx_context::dummy();
        let owner = ctx.sender();
        let writer = @0xB0B;
        let reader = @0xC0D;
        let mut repo = new_repo_for_testing(owner, VISIBILITY_PRIVATE, &mut ctx);
        let account = account::new_account_for_testing(owner, &mut ctx);

        assert!(can_read(&repo, &account, owner), 0);
        assert!(!can_read(&repo, &account, writer), 0);
        assert!(!can_read(&repo, &account, reader), 0);

        add_member(&mut repo, writer, &ctx);
        assert!(can_read(&repo, &account, writer), 0);
        remove_member(&mut repo, writer, &ctx);
        assert!(!can_read(&repo, &account, writer), 0);

        add_reader(&mut repo, reader, &ctx);
        assert!(can_read(&repo, &account, reader), 0);
        remove_reader(&mut repo, reader, &ctx);
        assert!(!can_read(&repo, &account, reader), 0);

        destroy_repo_for_testing(repo);
        account::destroy_account_for_testing(account);
    }

    #[test]
    fun push_ref_updates_ref_and_manifest_sequence() {
        let mut ctx = tx_context::dummy();
        let owner = ctx.sender();
        let mut repo = new_repo_for_testing(owner, VISIBILITY_PRIVATE, &mut ctx);
        let account = account::new_account_for_testing(owner, &mut ctx);

        push_main_ref(
            &mut repo,
            &account,
            std::string::utf8(b""),
            std::string::utf8(b"commit-1"),
            std::string::utf8(b"artifact-1"),
            &mut ctx,
        );

        let ref_name = std::string::utf8(b"refs/heads/main");
        let ref_state = table::borrow(&repo.refs, ref_name);
        let manifest = table::borrow(&repo.manifests, 1);

        assert!(ref_state.commit_digest == std::string::utf8(b"commit-1"), 0);
        assert!(ref_state.seq == 1, 0);
        assert!(manifest.new_commit == std::string::utf8(b"commit-1"), 0);
        assert!(repo_next_seq(&repo) == 2, 0);

        let _ = table::remove(&mut repo.refs, ref_name);
        let _ = table::remove(&mut repo.manifests, 1);
        destroy_repo_for_testing(repo);
        account::destroy_account_for_testing(account);
    }

    #[test]
    fun seal_approval_requires_reader_access() {
        let mut ctx = tx_context::dummy();
        let owner = ctx.sender();
        let reader = @0xC0D;
        let mut repo = new_repo_for_testing(owner, VISIBILITY_PRIVATE, &mut ctx);
        let account = account::new_account_for_testing(owner, &mut ctx);
        let key_id = seal_key_id(&repo);

        add_reader(&mut repo, reader, &ctx);
        assert!(can_read(&repo, &account, reader), 0);
        seal_approve(key_id, &repo, &account, &ctx);

        remove_reader(&mut repo, reader, &ctx);
        destroy_repo_for_testing(repo);
        account::destroy_account_for_testing(account);
    }

    #[test]
    fun repo_registry_test_helper_starts_empty() {
        let mut ctx = tx_context::dummy();
        let registry = new_registry_for_testing(&mut ctx);
        destroy_registry_for_testing(registry);
    }
}
