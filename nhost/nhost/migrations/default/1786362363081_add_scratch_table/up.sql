CREATE TABLE public.scratch_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid REFERENCES public.workflow_runs(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);