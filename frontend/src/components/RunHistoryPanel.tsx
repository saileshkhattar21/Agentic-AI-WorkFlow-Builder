"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useSubscription } from "@apollo/client";
import { WORKFLOW_RUNS_FOR_WORKFLOW } from "@/lib/graphql/queries";
import { STEP_RUNS_FOR_WORKFLOW_RUN, WORKFLOW_RUN_STATUS } from "@/lib/graphql/subscriptions";
import { APPROVE_STEP } from "@/lib/graphql/mutations";
import { StatusBadge } from "@/components/StatusBadge";
import { OrgRole, StepRun, WorkflowRunSummary } from "@/types";

export function RunHistoryPanel({
  workflowId,
  activeRunId,
  userRole,
}: {
  workflowId: string;
  activeRunId: string | null;
  userRole: OrgRole | undefined;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(activeRunId);

  const { data: runsData, refetch: refetchRuns } = useQuery<{
    workflow_runs: WorkflowRunSummary[];
  }>(WORKFLOW_RUNS_FOR_WORKFLOW, {
    variables: { workflowId },
    pollInterval: 10000,
  });

  // When a new run gets triggered from the workflow builder, follow it.
  useEffect(() => {
    if (activeRunId) {
      setSelectedRunId(activeRunId);
      refetchRuns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId]);

  const runs = runsData?.workflow_runs ?? [];
  const effectiveRunId = selectedRunId ?? runs[0]?.id ?? null;

  const { data: runStatusData } = useSubscription<{
    workflow_runs_by_pk: WorkflowRunSummary | null;
  }>(WORKFLOW_RUN_STATUS, {
    variables: { workflowRunId: effectiveRunId },
    skip: !effectiveRunId,
  });

  const { data: stepRunsData, loading: stepsLoading } = useSubscription<{
    step_runs: StepRun[];
  }>(STEP_RUNS_FOR_WORKFLOW_RUN, {
    variables: { workflowRunId: effectiveRunId },
    skip: !effectiveRunId,
  });

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  const canApprove = userRole === "owner" || userRole === "editor";
  const runStatus = runStatusData?.workflow_runs_by_pk?.status;
  const stepRuns = stepRunsData?.step_runs ?? [];

  async function handleDecision(stepRunId: string, decision: "approved" | "rejected") {
    try {
      await approveStep({ variables: { stepRunId, decision } });
    } catch {
      // surfaced inline below via mutation error state pattern would need
      // per-row state; keep it simple with a window alert for now.
      alert("Couldn't record that decision. Check your role and try again.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">Run history</div>
        {runs.length > 0 && (
          <select
            value={effectiveRunId ?? ""}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="text-xs bg-panel2 border border-border rounded px-2 py-1 outline-none"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.started_at).toLocaleString()}
              </option>
            ))}
          </select>
        )}
      </div>

      {!effectiveRunId && (
        <div className="text-sm text-muted">No runs yet. Trigger a run to see live status here.</div>
      )}

      {effectiveRunId && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Overall status</span>
            {runStatus && <StatusBadge status={runStatus} />}
          </div>

          <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
            {stepsLoading && stepRuns.length === 0 && (
              <div className="text-sm text-muted">Loading steps...</div>
            )}
            {stepRuns.map((sr) => (
              <div
                key={sr.id}
                className="rounded-md border border-border bg-panel2 p-2.5 text-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    #{sr.workflow_step.step_order} · {sr.workflow_step.type}
                  </span>
                  <StatusBadge status={sr.status} />
                </div>

                {sr.error && (
                  <div className="text-xs text-red-300 mt-1 break-words">
                    {sr.error}
                  </div>
                )}

                {sr.attempt_count > 1 && (
                  <div className="text-xs text-muted mt-1">
                    Attempts: {sr.attempt_count}
                  </div>
                )}

                {sr.status === "awaiting_approval" && (
                  <div className="mt-2 flex gap-2">
                    {canApprove ? (
                      <>
                        <button
                          disabled={approving}
                          onClick={() => handleDecision(sr.id, "approved")}
                          className="flex-1 rounded-md bg-green-700/80 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 transition"
                        >
                          Approve
                        </button>
                        <button
                          disabled={approving}
                          onClick={() => handleDecision(sr.id, "rejected")}
                          className="flex-1 rounded-md bg-red-800/80 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-medium py-1.5 transition"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-muted">
                        Waiting for an owner or editor to approve.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
