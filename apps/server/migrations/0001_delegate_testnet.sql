create table if not exists accounts (
  account_id text primary key,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists delegate_key_cache (
  account_id text not null references accounts(account_id) on delete cascade,
  delegate_address text not null,
  delegate_public_key text not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (account_id, delegate_address)
);

create table if not exists repos (
  repo_id text primary key,
  owner text not null,
  name text not null,
  owner_wallet text not null,
  account_id text references accounts(account_id),
  repo_object_id text,
  visibility text not null check (visibility in ('public', 'private')),
  default_branch text not null default 'refs/heads/main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manifests (
  manifest_id text primary key,
  repo_id text not null references repos(repo_id) on delete cascade,
  ref_name text not null,
  old_commit text,
  new_commit text not null,
  walrus_blob_id text not null,
  walrus_blob_object_id text,
  artifact_digest text not null,
  stored_artifact_digest text,
  artifact_size_bytes bigint not null,
  seq bigint not null,
  visibility text not null check (visibility in ('public', 'private')),
  encrypted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (repo_id, seq)
);

create table if not exists artifacts (
  artifact_digest text primary key,
  walrus_blob_id text not null,
  walrus_blob_object_id text,
  storage_mode text not null,
  size_bytes bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists push_attempts (
  id bigserial primary key,
  repo_id text not null,
  actor_wallet text,
  status text not null check (status in ('completed', 'failed')),
  manifest_ids text[] not null default '{}',
  error text,
  created_at timestamptz not null default now()
);
