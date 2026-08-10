import { gql } from "@apollo/client";

export const STEP_RUNS_FOR_WORKFLOW_RUN = gql`
  subscription StepRunsForWorkflowRun($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { workflow_step: { step_order: asc } }
    ) {
      id
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      workflow_step {
        id
        step_order
        type
      }
    }
  }
`;

// Also watch the parent run so we can reflect overall status
// (completed/failed/paused) even between step_runs updates.
export const WORKFLOW_RUN_STATUS = gql`
  subscription WorkflowRunStatus($workflowRunId: uuid!) {
    workflow_runs_by_pk(id: $workflowRunId) {
      id
      status
      started_at
      completed_at
    }
  }
`;
