import { gql } from "@apollo/client";

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflows_one(object: $object) {
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
    }
  }
`;

// Hasura Action: verifies role + quota server-side, creates the run, and
// starts executing steps. Handler is triggerWorkflowRun.ts (already built
// and tested). Do not add extra client-side permission logic here - the
// server is the source of truth per the assignment's Layer 2 requirement.
export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      workflow_run_id
      status
    }
  }
`;

// Hasura Action: verifies approver's role server-side before resuming.
// Handler is approveStep.ts (already built and tested).
export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!, $decision: String!) {
    approveStep(step_run_id: $stepRunId, decision: $decision) {
      workflow_run_id
      status
    }
  }
`;
