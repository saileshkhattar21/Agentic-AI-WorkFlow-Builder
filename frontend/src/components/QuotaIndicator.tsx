"use client";

import { useQuery } from "@apollo/client";
import { ORG_USAGE_SUMMARY } from "@/lib/graphql/queries";
import { OrgUsageSummary } from "@/types";

export function QuotaIndicator({ orgId }: { orgId: string }) {
  const { data, loading, error } = useQuery<{
    org_usage_summary: OrgUsageSummary[];
  }>(ORG_USAGE_SUMMARY, {
    variables: { orgId },
    pollInterval: 15000,
  });

  const summary = data?.org_usage_summary?.[0];

  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="text-xs text-muted mb-2">Usage this period</div>
      {loading && !summary && <div className="text-sm text-muted">Loading...</div>}
      {error && (
        <div className="text-xs text-red-300">
          Couldn&apos;t load usage ({error.message})
        </div>
      )}
      {summary && (
        <>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-lg font-semibold">
              {summary.quota_used}
              <span className="text-muted text-sm"> / {summary.quota_limit}</span>
            </span>
            <span className="text-xs text-muted">
              {Math.round(summary.usage_percent)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-panel2 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                summary.usage_percent >= 90
                  ? "bg-red-500"
                  : summary.usage_percent >= 70
                  ? "bg-yellow-500"
                  : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, summary.usage_percent)}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
