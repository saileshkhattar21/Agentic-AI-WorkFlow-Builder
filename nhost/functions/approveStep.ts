// nhost/functions/approveStep.ts
//
// This is the "harder half" of Layer 2. A Hasura permission can't gate
// this action because approving isn't a row write — it's "check this
// person's org role right now, and if they pass, go run more of the
// workflow (more external calls, more quota, more side effects)." That
// decision has to happen in code, at the moment of approval, not baked
// into a static filter.

import type { Request, Response } from "express";
import { adminGraphQL } from "./_lib/hasura";
import { getRoleForStepRun, canApprove } from "./_lib/orgAuth";
import { runSteps } from "./_lib/engine";

export default async (req: Request, res: Response) => {
  const { input, session_variables } = req.body;
  const stepRunId: string = input.step_run_id;
  const decision: "approved" | "rejected" = input.decision;
  const userId: string = session_variables["x-hasura-user-id"];

  if (!stepRunId || !decision || !userId) {
    return res.status(400).json({ message: "step_run_id, decision, and an authenticated user are required" });
  }

  // Who is this step_run's org, and what's the caller's role in it?
  const { role, workflowId, workflowRunId } = await getRoleForStepRun(stepRunId, userId);
  if (!role || !workflowId || !workflowRunId) {
    return res.status(404).json({ message: "Step run not found" });
  }
  if (!canApprove(role)) {
    return res.status(403).json({ message: "Only owners and editors can approve this step" });
  }

  // Make sure it's actually sitting in awaiting_approval — approving an
  // already-resolved step (double-click, stale UI, race with another
  // approver) is a no-op, not a re-run.
  const sr = await adminGraphQL<{ step_runs_by_pk: { status: string; output: any } }>(
    `query SR($id: uuid!) { step_runs_by_pk(id: $id) { status output } }`,
    { id: stepRunId }
  );
  if (sr.step_runs_by_pk.status !== "awaiting_approval") {
    return res.status(409).json({ message: `Step is not awaiting approval (status: ${sr.step_runs_by_pk.status})` });
  }

  if (decision === "rejected") {
    await adminGraphQL(
      `mutation Reject($id: uuid!, $userId: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", approved_by: $userId, approved_at: "now()" }) { id }
      }`,
      { id: stepRunId, userId }
    );
    await adminGraphQL(
      `mutation FailRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", completed_at: "now()" }) { id }
      }`,
      { id: workflowRunId }
    );
    return res.status(200).json({ workflow_run_id: workflowRunId, status: "failed" });
  }

  // Approved: mark this step successful, mark the run running again,
  // then hand off to the SAME engine that triggerWorkflowRun uses,
  // starting one step past this one. This is what keeps "resumed" runs
  // behaving identically to "fresh" runs.
  const stepOrder = await adminGraphQL<{ step_runs_by_pk: { workflow_step: { step_order: number } } }>(
    `query Order($id: uuid!) { step_runs_by_pk(id: $id) { workflow_step { step_order } } }`,
    { id: stepRunId }
  );

  await adminGraphQL(
    `mutation Approve($id: uuid!, $userId: uuid!, $output: jsonb) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "success", approved_by: $userId, approved_at: "now()", output: $output }) { id }
    }`,
    { id: stepRunId, userId, output: sr.step_runs_by_pk.output }
  );
  await adminGraphQL(
    `mutation ResumeRun($id: uuid!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "running" }) { id }
    }`,
    { id: workflowRunId }
  );

  const wf = await adminGraphQL<{ workflows_by_pk: { organization: { id: string } } }>(
    `query OrgOf($id: uuid!) { workflows_by_pk(id: $id) { organization { id } } }`,
    { id: workflowId }
  );

  const result = await runSteps({
    workflowRunId,
    workflowId,
    orgId: wf.workflows_by_pk.organization.id,
    fromStepOrder: stepOrder.step_runs_by_pk.workflow_step.step_order + 1,
    previousOutput: sr.step_runs_by_pk.output,
  });

  return res.status(200).json({ workflow_run_id: workflowRunId, status: result.status });
};