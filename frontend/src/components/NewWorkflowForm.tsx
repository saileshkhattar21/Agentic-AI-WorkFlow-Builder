"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
import { CREATE_WORKFLOW } from "@/lib/graphql/mutations";
import { WORKFLOWS_FOR_ORG } from "@/lib/graphql/queries";
import { StepType, TriggerType } from "@/types";

const STEP_TYPES: StepType[] = [
  "llm_call",
  "http_request",
  "db_write",
  "conditional_branch",
  "approval_gate",
];

const TRIGGER_TYPES: TriggerType[] = ["manual", "webhook", "scheduled", "database_event"];

const CONFIG_PLACEHOLDER: Record<StepType, string> = {
  llm_call: '{ "prompt": "Summarize: {{input}}" }',
  http_request: '{ "method": "GET", "url": "https://api.example.com/data" }',
  db_write: '{ "table": "workflows", "values": {} }',
  conditional_branch: '{ "if": "output.contains(\'yes\')", "then_skip_to": 4 }',
  approval_gate: "{}",
};

interface DraftStep {
  key: string;
  type: StepType;
  config: string;
}

interface DraftTrigger {
  key: string;
  type: TriggerType;
  config: string;
}

function newKey() {
  return Math.random().toString(36).slice(2);
}

export function NewWorkflowForm({
  orgId,
  userId,
  onCreated,
  onCancel,
}: {
  orgId: string;
  userId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([
    { key: newKey(), type: "llm_call", config: CONFIG_PLACEHOLDER.llm_call },
  ]);
  const [triggers, setTriggers] = useState<DraftTrigger[]>([
    { key: newKey(), type: "manual", config: "{}" },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  const [createWorkflow, { loading }] = useMutation(CREATE_WORKFLOW, {
    refetchQueries: [{ query: WORKFLOWS_FOR_ORG, variables: { orgId } }],
  });

  function addStep() {
    setSteps((s) => [
      ...s,
      { key: newKey(), type: "llm_call", config: CONFIG_PLACEHOLDER.llm_call },
    ]);
  }

  function removeStep(key: string) {
    setSteps((s) => s.filter((step) => step.key !== key));
  }

  function updateStep(key: string, patch: Partial<DraftStep>) {
    setSteps((s) => s.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((s) => {
      const next = [...s];
      const target = index + dir;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addTrigger() {
    setTriggers((t) => [...t, { key: newKey(), type: "manual", config: "{}" }]);
  }

  function removeTrigger(key: string) {
    setTriggers((t) => t.filter((trig) => trig.key !== key));
  }

  function updateTrigger(key: string, patch: Partial<DraftTrigger>) {
    setTriggers((t) => t.map((trig) => (trig.key === key ? { ...trig, ...patch } : trig)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Give the workflow a name.");
      return;
    }
    if (steps.length === 0) {
      setFormError("Add at least one step.");
      return;
    }

    let parsedSteps;
    let parsedTriggers;
    try {
      parsedSteps = steps.map((s, i) => ({
        step_order: i + 1,
        type: s.type,
        config: s.config.trim() ? JSON.parse(s.config) : {},
      }));
      parsedTriggers = triggers.map((t) => ({
        type: t.type,
        config: t.config.trim() ? JSON.parse(t.config) : {},
      }));
    } catch {
      setFormError("One of the config fields isn't valid JSON.");
      return;
    }

    try {
      await createWorkflow({
        variables: {
          object: {
            org_id: orgId,
            name: name.trim(),
            created_by: userId,
            steps: { data: parsedSteps },
            triggers: { data: parsedTriggers },
          },
        },
      });
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create workflow.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="block text-xs text-muted mb-1">Workflow name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lead qualification"
          className="w-full rounded-md bg-panel2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">Steps (in order)</span>
          <button
            type="button"
            onClick={addStep}
            className="text-xs text-accent hover:underline"
          >
            + Add step
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <div key={step.key} className="rounded-md border border-border bg-panel2 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted w-5">#{i + 1}</span>
                <select
                  value={step.type}
                  onChange={(e) =>
                    updateStep(step.key, {
                      type: e.target.value as StepType,
                      config: CONFIG_PLACEHOLDER[e.target.value as StepType],
                    })
                  }
                  className="flex-1 rounded-md bg-panel border border-border px-2 py-1.5 text-sm outline-none"
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-muted disabled:opacity-30 px-1"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  className="text-xs text-muted disabled:opacity-30 px-1"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(step.key)}
                  className="text-xs text-red-400 hover:underline px-1"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={step.config}
                onChange={(e) => updateStep(step.key, { config: e.target.value })}
                rows={2}
                placeholder="config JSON"
                className="w-full rounded-md bg-panel border border-border px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">Triggers</span>
          <button
            type="button"
            onClick={addTrigger}
            className="text-xs text-accent hover:underline"
          >
            + Add trigger
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {triggers.map((trig) => (
            <div key={trig.key} className="rounded-md border border-border bg-panel2 p-3">
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={trig.type}
                  onChange={(e) =>
                    updateTrigger(trig.key, { type: e.target.value as TriggerType })
                  }
                  className="flex-1 rounded-md bg-panel border border-border px-2 py-1.5 text-sm outline-none"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeTrigger(trig.key)}
                  className="text-xs text-red-400 hover:underline px-1"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={trig.config}
                onChange={(e) => updateTrigger(trig.key, { config: e.target.value })}
                rows={1}
                placeholder="config JSON"
                className="w-full rounded-md bg-panel border border-border px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>
      </div>

      {formError && (
        <div className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
          {formError}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
        >
          {loading ? "Creating..." : "Create workflow"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border text-sm px-4 py-2 hover:bg-panel2 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
