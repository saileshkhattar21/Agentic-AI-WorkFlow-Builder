"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { WORKFLOWS_FOR_ORG } from "@/lib/graphql/queries";
import { TRIGGER_WORKFLOW_RUN } from "@/lib/graphql/mutations";
import { NewWorkflowForm } from "@/components/NewWorkflowForm";
import { StatusBadge } from "@/components/StatusBadge";
import { OrgRole, Workflow } from "@/types";

export function WorkflowBuilder({
  orgId,
  userId,
  userRole,
  selectedWorkflowId,
  onSelectWorkflow,
  onRunTriggered,
}: {
  orgId: string;
  userId: string;
  userRole: OrgRole | undefined;
  selectedWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onRunTriggered: (runId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { data, loading, error } = useQuery<{ workflows: Workflow[] }>(
    WORKFLOWS_FOR_ORG,
    { variables: { orgId } }
  );

  const [triggerRun, { loading: triggering }] = useMutation(TRIGGER_WORKFLOW_RUN);

  const workflows = data?.workflows ?? [];
  const selected = workflows.find((w) => w.id === selectedWorkflowId) ?? null;
  const canRun = userRole === "owner" || userRole === "editor";

  async function handleRun(workflowId: string) {
    setRunError(null);
    try {
      const { data } = await triggerRun({ variables: { workflowId } });
      const runId = data?.triggerWorkflowRun?.workflow_run_id;
      if (runId) onRunTriggered(runId);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to trigger run.");
    }
  }

  if (creating) {
    return (
      <div className="rounded-lg border border-border bg-panel p-5">
        <NewWorkflowForm
          orgId={orgId}
          userId={userId}
          onCreated={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Workflows</h2>
        {canRun && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs rounded-md bg-accent hover:bg-accent/90 text-white px-3 py-1.5 font-medium transition"
          >
            + New workflow
          </button>
        )}
      </div>

      {loading && <div className="text-sm text-muted">Loading workflows...</div>}
      {error && (
        <div className="text-sm text-red-300">Couldn&apos;t load workflows ({error.message})</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <div className="flex flex-col gap-2">
          {workflows.map((wf) => {
            const latestRun = wf.runs[0];
            return (
              <button
                key={wf.id}
                onClick={() => onSelectWorkflow(wf.id)}
                className={`text-left rounded-md border p-3 transition ${
                  wf.id === selectedWorkflowId
                    ? "border-accent bg-panel2"
                    : "border-border bg-panel hover:bg-panel2"
                }`}
              >
                <div className="text-sm font-medium">{wf.name}</div>
                <div className="text-xs text-muted mt-1">
                  {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
                </div>
                {latestRun && (
                  <div className="mt-2">
                    <StatusBadge status={latestRun.status} />
                  </div>
                )}
              </button>
            );
          })}
          {!loading && workflows.length === 0 && (
            <div className="text-sm text-muted rounded-md border border-dashed border-border p-4 text-center">
              No workflows yet.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-panel p-4">
          {!selected && (
            <div className="text-sm text-muted h-full flex items-center justify-center py-10">
              Select a workflow to view its steps and triggers.
            </div>
          )}

          {selected && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">{selected.name}</h3>
                  <p className="text-xs text-muted">
                    Created {new Date(selected.created_at).toLocaleString()}
                  </p>
                </div>
                {canRun ? (
                  <button
                    onClick={() => handleRun(selected.id)}
                    disabled={triggering}
                    className="rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    {triggering ? "Starting..." : "Run"}
                  </button>
                ) : (
                  <span className="text-xs text-muted">Viewers can&apos;t trigger runs</span>
                )}
              </div>

              {runError && (
                <div className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
                  {runError}
                </div>
              )}

              <div>
                <div className="text-xs text-muted mb-2">Steps</div>
                <div className="flex flex-col gap-2">
                  {selected.steps.map((step) => (
                    <div
                      key={step.id}
                      className="rounded-md border border-border bg-panel2 p-2.5 text-sm flex items-center justify-between"
                    >
                      <span>
                        <span className="text-muted">#{step.step_order}</span>{" "}
                        {step.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted mb-2">Triggers</div>
                <div className="flex flex-wrap gap-2">
                  {selected.triggers.map((trig) => (
                    <span
                      key={trig.id}
                      className="text-xs rounded-full border border-border bg-panel2 px-2.5 py-1"
                    >
                      {trig.type}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
