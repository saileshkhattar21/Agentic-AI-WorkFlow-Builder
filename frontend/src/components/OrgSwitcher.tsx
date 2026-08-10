import { OrgMembership } from "@/types";

export function OrgSwitcher({
  memberships,
  selectedOrgId,
  onChange,
}: {
  memberships: OrgMembership[];
  selectedOrgId: string | null;
  onChange: (orgId: string) => void;
}) {
  if (memberships.length === 0) {
    return (
      <div className="text-sm text-muted">
        You&apos;re not a member of any organization yet.
      </div>
    );
  }

  const current = memberships.find((m) => m.org_id === selectedOrgId);

  return (
    <div>
      <label className="block text-xs text-muted mb-1">Organization</label>
      <select
        value={selectedOrgId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-panel2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
      >
        {memberships.map((m) => (
          <option key={m.org_id} value={m.org_id}>
            {m.organization.name} ({m.role})
          </option>
        ))}
      </select>
      {current && (
        <p className="text-xs text-muted mt-1">
          Your role: <span className="text-text">{current.role}</span>
        </p>
      )}
    </div>
  );
}
