"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client";
import { useSignOut, useUserId, useUserEmail } from "@nhost/react";
import { MY_ORG_MEMBERSHIPS } from "@/lib/graphql/queries";
import { OrgMembership } from "@/types";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { WorkflowBuilder } from "@/components/WorkflowBuilder";
import { RunHistoryPanel } from "@/components/RunHistoryPanel";

export function App() {
  const userId = useUserId();
  const email = useUserEmail();
  const { signOut } = useSignOut();

  const { data, loading, error } = useQuery<{ org_members: OrgMembership[] }>(
    MY_ORG_MEMBERSHIPS,
    { variables: { userId }, skip: !userId }
  );

  const memberships = data?.org_members ?? [];

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const firstOrgId = memberships[0]?.org_id;
  useEffect(() => {
    if (!selectedOrgId && firstOrgId) {
      setSelectedOrgId(firstOrgId);
    }
  }, [firstOrgId, selectedOrgId]);

  const currentMembership = memberships.find((m) => m.org_id === selectedOrgId);

  function handleOrgChange(orgId: string) {
    setSelectedOrgId(orgId);
    setSelectedWorkflowId(null);
    setActiveRunId(null);
  }

  function handleSelectWorkflow(id: string) {
    setSelectedWorkflowId(id);
    setActiveRunId(null);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">AI Agent Workflow Builder</h1>
          {email && <p className="text-xs text-muted">{email}</p>}
        </div>
        <button
          onClick={() => signOut()}
          className="text-xs text-muted hover:text-text border border-border rounded-md px-3 py-1.5 transition"
        >
          Sign out
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 p-6">
        <main>
          {loading && <div className="text-sm text-muted">Loading your organizations...</div>}
          {error && (
            <div className="text-sm text-red-300">
              Couldn&apos;t load organizations ({error.message})
            </div>
          )}
          {!loading && !error && selectedOrgId && userId && (
            <WorkflowBuilder
              orgId={selectedOrgId}
              userId={userId}
              userRole={currentMembership?.role}
              selectedWorkflowId={selectedWorkflowId}
              onSelectWorkflow={handleSelectWorkflow}
              onRunTriggered={(runId) => setActiveRunId(runId)}
            />
          )}
          {!loading && !error && memberships.length === 0 && (
            <div className="text-sm text-muted rounded-lg border border-dashed border-border p-8 text-center">
              You&apos;re not a member of any organization yet. Ask an org owner to
              add your user to <code className="text-xs">org_members</code>.
            </div>
          )}
        </main>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-panel p-3">
            <OrgSwitcher
              memberships={memberships}
              selectedOrgId={selectedOrgId}
              onChange={handleOrgChange}
            />
          </div>

          {selectedOrgId && <QuotaIndicator orgId={selectedOrgId} />}

          {selectedWorkflowId && (
            <RunHistoryPanel
              workflowId={selectedWorkflowId}
              activeRunId={activeRunId}
              userRole={currentMembership?.role}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
