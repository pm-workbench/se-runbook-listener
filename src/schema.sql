-- SE Runbook progress backend — schema.
-- Run once against the target database (see README for how, via psql or a
-- one-shot container). Safe to re-run: everything is IF NOT EXISTS.

create table if not exists se_users (
  tenant_id   text not null,
  user_id     text not null,
  email       text,
  name        text,
  given_name  text,
  family_name text,
  last_seen   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists se_runbook_progress (
  tenant_id    text not null,
  user_id      text not null,
  item_id      text not null,
  completed_at timestamptz not null default now(),
  primary key (tenant_id, user_id, item_id),
  foreign key (tenant_id, user_id) references se_users (tenant_id, user_id) on delete cascade
);

-- Not used yet (managers currently just need to be on the MANAGER_EMAILS
-- allowlist to see everyone) — here so "a manager claims their own SEs"
-- is a plain INSERT/DELETE into an existing table later, not a migration.
-- One row = this manager can see this SE.
create table if not exists se_manager_claims (
  manager_email text not null,
  tenant_id     text not null,
  user_id       text not null,
  claimed_at    timestamptz not null default now(),
  primary key (manager_email, tenant_id, user_id),
  foreign key (tenant_id, user_id) references se_users (tenant_id, user_id) on delete cascade
);
