import { gql } from "@apollo/client";

/**
 * NOTE ON RELATIONSHIP NAMES
 * ---------------------------------------------------------------
 * These queries use the array/object relationship names exactly as
 * listed in the project summary ("workflows -> runs/steps/triggers",
 * "org_members -> organization", "organizations -> members", etc).
 * If Hasura returns an error like `field "steps" not found in type
 * "workflows"`, your actual metadata uses different relationship
 * names (e.g. "workflow_steps" instead of "steps") - check
 * nhost/nhost/metadata/databases/default/tables/*.yaml and rename
 * the field here to match. Everything else in the app reads from
 * the shapes returned by these queries, so a rename here is the
 * only change needed.
 */

export const MY_ORG_MEMBERSHIPS = gql`
  query MyOrgMemberships($userId: uuid!) {
    org_members(where: { user_id: { _eq: $userId } }) {
      id
      role
      org_id
      organization {
        id
        name
        quota_limit
        quota_used
      }
    }
  }
`;

export const ORG_USAGE_SUMMARY = gql`
  query OrgUsageSummary($orgId: uuid!) {
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      org_id
      org_name
      quota_limit
      quota_used
      usage_percent
      quota_period_start
    }
  }
`;

export const WORKFLOWS_FOR_ORG = gql`
  query WorkflowsForOrg($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      created_at
      steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
      }
      triggers {
        id
        type
        config
      }
      runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

export const WORKFLOW_RUNS_FOR_WORKFLOW = gql`
  query WorkflowRunsForWorkflow($workflowId: uuid!) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } }
      order_by: { started_at: desc }
      limit: 10
    ) {
      id
      status
      started_at
      completed_at
    }
  }
`;
