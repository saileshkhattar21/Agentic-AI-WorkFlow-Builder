export type OrgRole = "owner" | "editor" | "viewer";

export type StepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "conditional_branch"
  | "approval_gate";
// "notify" is intentionally omitted - its backend table (notifications)
// doesn't exist yet, so it isn't offered as a creatable step type here.

export type TriggerType = "manual" | "webhook" | "scheduled" | "database_event";

export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed";

export type StepRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "awaiting_approval";

export interface Organization {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
}

export interface OrgMembership {
  id: string;
  role: OrgRole;
  org_id: string;
  organization: Organization;
}

export interface OrgUsageSummary {
  org_id: string;
  org_name: string;
  quota_limit: number;
  quota_used: number;
  usage_percent: number;
  quota_period_start: string;
}

export interface WorkflowStep {
  id: string;
  step_order: number;
  type: StepType;
  config: Record<string, unknown>;
}

export interface WorkflowTrigger {
  id: string;
  type: TriggerType;
  config: Record<string, unknown>;
}

export interface WorkflowRunSummary {
  id: string;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  created_at: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  runs: WorkflowRunSummary[];
}

export interface StepRun {
  id: string;
  status: StepRunStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  workflow_step: {
    id: string;
    step_order: number;
    type: StepType;
  };
}
