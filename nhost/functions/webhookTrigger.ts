// nhost/functions/webhookTrigger.ts
//
// Inbound endpoint for external systems. No x-hasura-user-id here — this
// Action runs as role "public". Auth is a secret token living in the
// matching workflow_triggers row's config, not a session variable.

import type { Request, Response } from "express";
import { adminGraphQL } from "./_lib/hasura";
import { runSteps } from "./_lib/engine";

export default async (req: Request, res: Response) => {
  const { input } = req.body;
  const workflowId: string = input.workflow_id;
  const secret: string = input.secret;

  if (!workflowId || !secret) {
    return res.status(400).json({ message: "workflow_id and secret are required" });
  }

  // Look up the webhook trigger row + org/quota + created_by in one shot.
  const data = await adminGraphQL<{
    workflow_triggers: { config: any }[];
    workflows_by_pk: {
      created_by: string;
      organization: { id: string; quota_used: number; quota_limit: number };
    } | null;
  }>(
    `query WebhookLookup($workflowId: uuid!) {
      workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" } }) {
        config
      }
      workflows_by_pk(id: $workflowId) {
        created_by
        organization { id quota_used quota_limit }
      }
    }`,
    { workflowId }
  );

  const trigger = data.workflow_triggers[0];
  const workflow = data.workflows_by_pk;

  // Same response whether the workflow doesn't exist, has no webhook
  // trigger, the trigger is disabled, or the secret is wrong — don't
  // leak which one it is to someone probing.
  const secretOk = trigger && typeof trigger.config?.secret === "string" &&
    trigger.config.secret === secret;
  const enabled = trigger?.config?.enabled !== false; // default true if unset

  if (!workflow || !trigger || !secretOk || !enabled) {
    return res.status(404).json({ message: "Not found" });
  }

  const org = workflow.organization;
  if (org.quota_used >= org.quota_limit) {
    return res.status(429).json({ message: "Organization quota exhausted for this period" });
  }

  const created = await adminGraphQL<{ insert_workflow_runs_one: { id: string } }>(
    `mutation CreateRun($object: workflow_runs_insert_input!) {
      insert_workflow_runs_one(object: $object) { id }
    }`,
    {
      object: {
        workflow_id: workflowId,
        status: "running",
        triggered_by: workflow.created_by, // implicit identity — no real caller user
        started_at: new Date().toISOString(),
      },
    }
  );
  const workflowRunId = created.insert_workflow_runs_one.id;

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