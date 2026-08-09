
export type OrgRole = "owner" | "editor" | "viewer" | null;

import { adminGraphQL } from "./hasura";


export async function getRoleForWorkflow(
  workflowId: string,
  userId: string
): Promise<OrgRole> {
  const data = await adminGraphQL<{
    workflows: { organization: { members: { role: string }[] } }[];
  }>(
    `
    query GetRole($workflowId: uuid!, $userId: uuid!) {
      workflows(where: { id: { _eq: $workflowId } }) {
        organization {
          members(where: { user_id: { _eq: $userId } }) {
            role
          }
        }
      }
    }
    `,
    { workflowId, userId }
  );

  const role = data.workflows[0]?.organization?.members[0]?.role;
  return (role as OrgRole) ?? null;
}

/**
 * Role of `userId` in the org that owns the workflow a given step_run
 * belongs to. Walks step_run -> workflow_run -> workflow -> organization,
 * same as the Layer 1 select filter on step_runs does — needed for
 * approveStep, which is handed a step_run_id, not a workflow_id.
 */
export async function getRoleForStepRun(
  stepRunId: string,
  userId: string
): Promise<{ role: OrgRole; workflowId: string | null; workflowRunId: string | null }> {
  const data = await adminGraphQL<{
    step_runs_by_pk: {
      workflow_run: {
        id: string;
        workflow: {
          id: string;
          organization: { members: { role: string }[] };
        };
      };
    } | null;
  }>(
    `
    query GetRoleForStepRun($stepRunId: uuid!, $userId: uuid!) {
      step_runs_by_pk(id: $stepRunId) {
        workflow_run {
          id
          workflow {
            id
            organization {
              members(where: { user_id: { _eq: $userId } }) {
                role
              }
            }
          }
        }
      }
    }
    `,
    { stepRunId, userId }
  );

  const sr = data.step_runs_by_pk;
  if (!sr) return { role: null, workflowId: null, workflowRunId: null };

  const role = sr.workflow_run.workflow.organization.members[0]?.role ?? null;
  return {
    role: role as OrgRole,
    workflowId: sr.workflow_run.workflow.id,
    workflowRunId: sr.workflow_run.id,
  };
}

export function canTrigger(role: OrgRole): boolean {
  return role === "owner" || role === "editor";
}

export function canApprove(role: OrgRole): boolean {
  return role === "owner" || role === "editor";
}