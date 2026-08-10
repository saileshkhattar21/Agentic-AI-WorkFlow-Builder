// nhost/functions/triggerWorkflowRun.ts
//
// Handler for the triggerWorkflowRun Hasura Action. nhost functions use
// the Express req/res signature — Hasura POSTs the Action payload here.

import type { Request, Response } from "express";
import { adminGraphQL } from "./_lib/hasura";
import { getRoleForWorkflow, canTrigger } from "./_lib/orgAuth";
import { runSteps } from "./_lib/engine";

export default async (req: Request, res: Response) => {
  const { input, session_variables } = req.body;
  const workflowId: string = input.workflow_id;
  const userId: string = session_variables["x-hasura-user-id"];

  if (!workflowId || !userId) {
    return res.status(400).json({ message: "workflow_id and an authenticated user are required" });
  }

  // (a) Layer 2 check #1: is this caller owner/editor in the workflow's org?
  // Deliberately re-checked here even though Layer 1 select permissions
  // already scope workflows to org members — Layer 1 tells us the user
  // CAN SEE the workflow, not that they're allowed to spend the org's
  // quota running it. Those are different questions.
  const role = await getRoleForWorkflow(workflowId, userId);
  if (!role) {
    // Same response whether the workflow doesn't exist or the user just
    // isn't a member — don't leak which one it is to someone guessing IDs.
    return res.status(404).json({ message: "Workflow not found" });
  }
  if (!canTrigger(role)) {
    return res.status(403).json({ message: "Only owners and editors can trigger a workflow run" });
  }

  // (b) org + quota + workflow's org_id, in one query
  const wf = await adminGraphQL<{
    workflows_by_pk: { organization: { id: string; quota_used: number; quota_limit: number } };
  }>(
    `query WfOrg($id: uuid!) {
      workflows_by_pk(id: $id) {
        organization { id quota_used quota_limit }
      }
    }`,
    { id: workflowId }
  );
  const org = wf.workflows_by_pk.organization;
  if (org.quota_used >= org.quota_limit) {
    return res.status(429).json({ message: "Organization quota exhausted for this period" });
  }

  // (c) create the run
  const created = await adminGraphQL<{ insert_workflow_runs_one: { id: string } }>(
    `mutation CreateRun($object: workflow_runs_insert_input!) {
      insert_workflow_runs_one(object: $object) { id }
    }`,
    {
      object: {
        workflow_id: workflowId,
        status: "running",
        triggered_by: userId,
        started_at: new Date().toISOString(),
      },
    }
  );
  const workflowRunId = created.insert_workflow_runs_one.id;

  // (d)-(g) execute. Errors inside runSteps are caught internally and
  // turned into a failed step_run + failed run, not thrown here — a
  // 500 from this Action would look like "the trigger itself failed",
  // which isn't true; the trigger succeeded, a *step* failed.
  const result = await runSteps({
    workflowRunId,
    workflowId,
    orgId: org.id,
    fromStepOrder: 1,
  });

  return res.status(200).json({
    workflow_run_id: workflowRunId,
    status: result.status,
  });
};