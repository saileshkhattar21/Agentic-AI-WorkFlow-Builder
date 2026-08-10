-- Enable UUID generation
create extension if not exists pgcrypto;

-- ORGANIZATIONS: the top-level tenant. Everything else belongs to one of these.
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_limit int not null default 100,
  quota_used int not null default 0,
  quota_period_start timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ORG_MEMBERS: links a user (from auth.users, nhost's built-in table) to an org, with a role.
-- This table is the backbone of your Layer-1 permissions later.
create table org_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

-- WORKFLOWS: belongs to one org.
create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WORKFLOW_STEPS: ordered steps belonging to a workflow.
create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  step_order int not null,
  type text not null check (type in ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, step_order)
);

-- WORKFLOW_TRIGGERS: how a workflow can be started.
create table workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  type text not null check (type in ('manual', 'webhook', 'scheduled', 'database_event')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WORKFLOW_RUNS: one row per execution of a workflow.
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'paused', 'completed', 'failed')),
  triggered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- STEP_RUNS: one row per step, per run. This is what your live subscription will watch.
create table step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references workflow_steps(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'success', 'failed', 'awaiting_approval')),
  input jsonb,
  output jsonb,
  error text,
  attempt_count int not null default 0,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes to speed up the joins Hasura will do constantly for permission checks
create index idx_org_members_user_org on org_members(user_id, org_id);
create index idx_workflows_org on workflows(org_id);
create index idx_workflow_steps_workflow on workflow_steps(workflow_id);
create index idx_workflow_triggers_workflow on workflow_triggers(workflow_id);
create index idx_workflow_runs_workflow on workflow_runs(workflow_id);
create index idx_step_runs_run on step_runs(workflow_run_id);
create index idx_step_runs_step on step_runs(workflow_step_id);

-- AGGREGATION: a view summarizing org usage — this satisfies the "one aggregation" requirement
create view org_usage_summary as
select
  o.id as org_id,
  o.name as org_name,
  o.quota_limit,
  o.quota_used,
  round((o.quota_used::numeric / nullif(o.quota_limit, 0)) * 100, 2) as usage_percent,
  o.quota_period_start
from organizations o;


