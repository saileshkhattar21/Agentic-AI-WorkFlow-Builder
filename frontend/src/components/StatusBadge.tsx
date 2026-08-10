const COLORS: Record<string, string> = {
  pending: "bg-zinc-700/40 text-zinc-300 border-zinc-600/50",
  running: "bg-blue-900/30 text-blue-300 border-blue-700/50",
  paused: "bg-yellow-900/30 text-yellow-300 border-yellow-700/50",
  awaiting_approval: "bg-yellow-900/30 text-yellow-300 border-yellow-700/50",
  completed: "bg-green-900/30 text-green-300 border-green-700/50",
  success: "bg-green-900/30 text-green-300 border-green-700/50",
  failed: "bg-red-900/30 text-red-300 border-red-700/50",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "bg-zinc-700/40 text-zinc-300 border-zinc-600/50";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
