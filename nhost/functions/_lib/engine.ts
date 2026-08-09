// nhost/functions/_lib/engine.ts
//
// One executor, two entry points. triggerWorkflowRun calls this starting
// at step_order 1. approveStep calls this starting at the step *after*
// the one that was just approved. Same code either way — a resumed run
// and a fresh run behave identically from this point forward, which is
// what stops the "paused" path from silently drifting out of sync with
// the "manual start" path.

import { adminGraphQL } from "./hasura";
import { callGemini } from "./llm";

type StepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "notify"
  | "conditional_branch"
  | "approval_gate";

interface WorkflowStep {
  id: string;
  step_order: number;
  type: StepType;
  config: any;
}

const MAX_ATTEMPTS = 2; // 1 initial try + 1 retry, per the spec's "at least one retry"

/**
 * Runs a workflow_run's steps starting at `fromStepOrder`, in order,
 * until it finishes, fails, or hits an approval_gate (in which case it
 * pauses and returns — a *return*, not a throw, since pausing is an
 * expected outcome, not an error).
 */
export async function runSteps(opts: {
  workflowRunId: string;
  workflowId: string;
  orgId: string;
  fromStepOrder: number;
  previousOutput?: any; // carried in when resuming after an approval_gate
}) {
  const { workflowRunId, workflowId, orgId } = opts;
  let previousOutput = opts.previousOutput ?? null;

  const steps = await getOrderedSteps(workflowId);
  let externalCallsThisSegment = 0;

  // step_order isn't necessarily a plain array index once conditional_branch
  // can jump around, so we look steps up by order rather than iterating an array index.
  let currentOrder: number | null = opts.fromStepOrder;

  while (currentOrder !== null) {
    const step = steps.find((s) => s.step_order === currentOrder);
    if (!step) break; // no step at that order = end of workflow

    const stepRunId = await createStepRun(workflowRunId, step.id, "running");

    try {
      switch (step.type) {
        case "llm_call": {
          const prompt = interpolate(step.config?.prompt ?? "", previousOutput);
          const output = await withRetry(() => callGemini(prompt));
          previousOutput = { text: output };
          externalCallsThisSegment++;
          await finishStepRun(stepRunId, "success", previousOutput, null);
          currentOrder = step.step_order + 1;
          break;
        }

        case "http_request": {
          const { url, method = "GET", headers, body } = step.config ?? {};
          const output = await withRetry(() => callHttp(url, method, headers, body));
          previousOutput = output;
          externalCallsThisSegment++;
          await finishStepRun(stepRunId, "success", previousOutput, null);
          currentOrder = step.step_order + 1;
          break;
        }

        case "db_write": {
          const output = await runDbWrite(step.config, previousOutput);
          previousOutput = output;
          await finishStepRun(stepRunId, "success", previousOutput, null);
          currentOrder = step.step_order + 1;
          break;
        }

        case "conditional_branch": {
          const branch = evaluateBranch(step.config, previousOutput);
          await finishStepRun(stepRunId, "success", { branch }, null);
          currentOrder = branch ? step.config?.onTrue : step.config?.onFalse;
          break;
        }

        case "approval_gate": {
          // The pause. Mark this step awaiting approval, mark the whole
          // run paused, and STOP — do not advance currentOrder. Nothing
          // past this point runs until approveStep explicitly resumes
          // execution at step_order + 1, and only after re-checking the
          // approver's role (see approveStep.ts). This is Layer 2: the
          // gate here is "don't proceed", enforced by simply not looping
          // again, not by a database permission.
          await updateStepRunStatus(stepRunId, "awaiting_approval");
          await updateWorkflowRunStatus(workflowRunId, "paused");
          if (externalCallsThisSegment > 0) {
            await incrementQuota(orgId, externalCallsThisSegment);
          }
          return { status: "paused", pausedAtStepRunId: stepRunId };
        }

        case "notify": {
          // TODO: implement as a Hasura Event Trigger. For now this
          // records the intent (into a `notifications` table + an event
          // trigger picks it up and calls Slack/email) rather than
          // calling out directly from here.
          await recordNotification(workflowRunId, step.config);
          await finishStepRun(stepRunId, "success", { queued: true }, null);
          currentOrder = step.step_order + 1;
          break;
        }

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
    } catch (err: any) {
      await finishStepRun(stepRunId, "failed", null, String(err?.message ?? err));
      await updateWorkflowRunStatus(workflowRunId, "failed");
      if (externalCallsThisSegment > 0) {
        await incrementQuota(orgId, externalCallsThisSegment);
      }
      return { status: "failed", failedAtStepRunId: stepRunId, error: String(err?.message ?? err) };
    }
  }

  // Ran off the end of the step list with nothing pausing/failing = done.
  await updateWorkflowRunStatus(workflowRunId, "completed", true);
  if (externalCallsThisSegment > 0) {
    await incrementQuota(orgId, externalCallsThisSegment);
  }
  return { status: "completed" };
}

// ---------- helpers ----------

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastErr;
}

function interpolate(template: string, previousOutput: any): string {
  if (!previousOutput) return template;
  return template.replace(/\{\{\s*prev(?:\.([\w.]+))?\s*\}\}/g, (_m, path) => {
    if (!path) return typeof previousOutput === "string" ? previousOutput : JSON.stringify(previousOutput);
    const val = path.split(".").reduce((o: any, k: string) => o?.[k], previousOutput);
    return val === undefined ? "" : String(val);
  });
}

async function callHttp(url: string, method: string, headers?: any, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(`http_request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return parsed;
}

function evaluateBranch(config: any, previousOutput: any): boolean {
  const { field, operator, value } = config ?? {};
  const actual = field ? field.split(".").reduce((o: any, k: string) => o?.[k], previousOutput) : previousOutput;
  switch (operator) {
    case "eq": return actual === value;
    case "neq": return actual !== value;
    case "contains": return typeof actual === "string" && actual.includes(value);
    case "gt": return Number(actual) > Number(value);
    case "lt": return Number(actual) < Number(value);
    default: return Boolean(actual);
  }
}

async function runDbWrite(config: any, previousOutput: any) {
  // config: { table: string, mapping: { columnName: "prev" | "prev.some.path" | literal } }
  const { table, mapping } = config ?? {};
  const object: Record<string, any> = {};
  for (const [col, spec] of Object.entries<any>(mapping ?? {})) {
    if (typeof spec === "string" && spec.startsWith("prev")) {
      const path = spec.slice(4).replace(/^\./, "");
      object[col] = path ? path.split(".").reduce((o: any, k: string) => o?.[k], previousOutput) : previousOutput;
    } else {
      object[col] = spec;
    }
  }
  const data = await adminGraphQL<any>(
    `mutation DbWrite($object: ${table}_insert_input!) {
      insert_${table}_one(object: $object) { id }
    }`,
    { object }
  );
  return data[`insert_${table}_one`];
}

async function recordNotification(workflowRunId: string, config: any) {
  // Assumes a `notifications` table exists (workflow_run_id, channel, message, status default 'pending').
  // An Event Trigger on notifications INSERT will call the actual Slack/email webhook.
  await adminGraphQL(
    `mutation Notify($object: notifications_insert_input!) {
      insert_notifications_one(object: $object) { id }
    }`,
    { object: { workflow_run_id: workflowRunId, channel: config?.channel, message: config?.message } }
  );
}

async function getOrderedSteps(workflowId: string): Promise<WorkflowStep[]> {
  const data = await adminGraphQL<{ workflow_steps: WorkflowStep[] }>(
    `query Steps($workflowId: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { step_order: asc }) {
        id step_order type config
      }
    }`,
    { workflowId }
  );
  return data.workflow_steps;
}

async function createStepRun(workflowRunId: string, workflowStepId: string, status: string): Promise<string> {
  const data = await adminGraphQL<{ insert_step_runs_one: { id: string } }>(
    `mutation CreateStepRun($object: step_runs_insert_input!) {
      insert_step_runs_one(object: $object) { id }
    }`,
    { object: { workflow_run_id: workflowRunId, workflow_step_id: workflowStepId, status, attempt_count: 1 } }
  );
  return data.insert_step_runs_one.id;
}

async function finishStepRun(stepRunId: string, status: string, output: any, error: string | null) {
  await adminGraphQL(
    `mutation FinishStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status, output: $output, error: $error }) { id }
    }`,
    { id: stepRunId, status, output, error }
  );
}

async function updateStepRunStatus(stepRunId: string, status: string) {
  await adminGraphQL(
    `mutation SetStepRunStatus($id: uuid!, $status: String!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status }) { id }
    }`,
    { id: stepRunId, status }
  );
}

async function updateWorkflowRunStatus(workflowRunId: string, status: string, setCompletedAt = false) {
  await adminGraphQL(
    `mutation SetRunStatus($id: uuid!, $status: String!, $completedAt: timestamptz) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status, completed_at: $completedAt }) { id }
    }`,
    { id: workflowRunId, status, completedAt: setCompletedAt ? new Date().toISOString() : null }
  );
}

async function incrementQuota(orgId: string, byCalls: number) {
  await adminGraphQL(
    `mutation BumpQuota($orgId: uuid!, $byCalls: Int!) {
      update_organizations_by_pk(pk_columns: { id: $orgId }, _inc: { quota_used: $byCalls }) { id }
    }`,
    { orgId, byCalls }
  );
}