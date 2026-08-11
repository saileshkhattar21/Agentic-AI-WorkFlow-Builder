# AI Agent Workflow Builder

A mini n8n-style workflow automation tool for chaining AI agent steps, built on **nhost** (Postgres + Hasura + Auth + Functions), **Next.js**, and **Groq** (LLM provider). Built as a take-home assignment.

---

## Live deployment

- **Frontend (Vercel):** `<PASTE YOUR VERCEL URL HERE>`
- **Backend (nhost Cloud):**
  - GraphQL API: `https://teclrxnympfptmrgiqfm.hasura.ap-south-1.nhost.run/v1/graphql`
  - Hasura Console: `https://teclrxnympfptmrgiqfm.hasura.ap-south-1.nhost.run/console`
  - Auth API: `https://teclrxnympfptmrgiqfm.auth.ap-south-1.nhost.run/v1`
  - Functions: `https://teclrxnympfptmrgiqfm.functions.ap-south-1.nhost.run/v1`
- **Region:** ap-south-1 (Mumbai)
- **Hasura admin secret:** `nhost-admin-secret`

---

## Tech stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL (via nhost) |
| API | Hasura GraphQL Engine (auto-generated CRUD + subscriptions, custom Actions for business logic) |
| Auth | Hasura Auth (nhost) — email/password |
| Backend logic | nhost Serverless Functions (Node/TypeScript, Express-style handlers) |
| LLM provider | Groq (`llama-3.3-70b-versatile`, OpenAI-compatible API) — see note below on provider choice |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| GraphQL client | Apollo Client (queries, mutations, subscriptions) |

**Note on LLM provider:** the assignment allows Groq, OpenRouter, or Gemini on any free tier. Gemini's free tier returned `RESOURCE_EXHAUSTED` with a `limit: 0` quota for this account/region even with a valid API key — Google's free tier is known to be restricted in some regions/account types. Switched to Groq, which worked immediately with no billing setup required.

---

## Seed data — 5 organizations, 3 members each, 1 workflow each

All seeded on the **live cloud deployment**. All passwords: `TestPassword123!`

| Organization | Org ID | Owner (email) | Editor (email) | Viewer (email) | Sample Workflow ID |
|---|---|---|---|---|---|
| Acme Corp | `8c2cc837-1621-4251-bb06-f2953ef9e288` | org1-owner@testorg.com | org1-editor@testorg.com | org1-viewer@testorg.com | `a962e376-f03b-4a32-8361-1b69c289ded3` |
| Globex Inc | `915e4b07-c6e6-4393-a894-77f99474e2d8` | org2-owner@testorg.com | org2-editor@testorg.com | org2-viewer@testorg.com | `7bb4aadf-48d7-411d-8daa-a7da216eac3b` |
| Initech | `f4a8658e-6242-46e7-9b44-b9cc23d195ca` | org3-owner@testorg.com | org3-editor@testorg.com | org3-viewer@testorg.com | `baffd1a3-a484-40a0-b528-684b9effbd3e` |
| Umbrella Labs | `1c878f1d-7cfd-4e6b-b02f-1c644f0e8a1a` | org4-owner@testorg.com | org4-editor@testorg.com | org4-viewer@testorg.com | `c9e88684-f7aa-4a99-afd1-1438911a1355` |
| Stark Industries | `7120c044-f35e-4f6c-99db-10977f717a3b` | org5-owner@testorg.com | org5-editor@testorg.com | org5-viewer@testorg.com | `d60f0695-10d3-4cdd-b21e-b242bc21a2a7` |

Each sample workflow has a single `llm_call` step (prompt: "Say hello in exactly 5 words") and a `manual` trigger, ready to run immediately from the UI or via curl.

**Recommended login to explore the app:** `org1-owner@testorg.com` / `TestPassword123!` (full owner permissions on Acme Corp — can create/edit workflows, add members, trigger runs, approve gates).

**For cross-org isolation testing:** log in as `org2-owner@testorg.com` and confirm you cannot see, trigger, or approve anything belonging to Acme Corp (Org 1) — including if you already know Org 1's real workflow ID (`a962e376-f03b-4a32-8361-1b69c289ded3`) from this table.

---

## Architecture overview

```
organizations ──< org_members >── auth.users
      │
      └──< workflows ──< workflow_steps
                    │
                    ├──< workflow_triggers
                    │
                    └──< workflow_runs ──< step_runs
```

- **Two permission layers**, enforced independently:
  1. **Org + role scoping (Hasura row-level permissions):** every table's permission filter traverses `organization.members.user_id = X-Hasura-User-Id`, checked fresh via SQL join on every request — never baked into the JWT. This means role changes take effect immediately without re-login, and cross-org access is impossible even with a known, valid ID from another org.
  2. **Step-level + mid-execution gating (Action handler code):** only an `owner` may create `db_write`/`notify` steps or `webhook` triggers (enforced both in Hasura permission conditions AND re-checked in the Action handler). Approving a paused `approval_gate` step is a dedicated Action (`approveStep`) that re-checks the approver's live role in code — this can't be a static database permission since it's a mid-execution decision with side effects (resuming the run, spending quota).

- **Single Hasura role (`user`)** for all authenticated users — `owner`/`editor`/`viewer` are *not* separate Hasura roles, since a person's role varies per-organization and Hasura roles are fixed per-JWT. Instead, role lives in `org_members.role` and is checked dynamically per request.

- **The workflow engine** (`nhost/functions/_lib/engine.ts`) is a single shared `runSteps()` function used by both `triggerWorkflowRun` (starts at step 1) and `approveStep` (resumes one step past an approved `approval_gate`) — this guarantees a resumed run behaves identically to a fresh one.

---

## Step types implemented

| Type | Behavior |
|---|---|
| `llm_call` | Real call to Groq's chat completions API, with retry on failure |
| `http_request` | Generic external HTTP call (tested against jsonplaceholder.typicode.com) |
| `db_write` | Inserts a row into a specified table using a `{table, mapping}` config, where mapping values can reference `prev` (the previous step's output) |
| `conditional_branch` | Evaluates a condition against the previous step's output; jumps to a specified `step_order` for true/false |
| `approval_gate` | Pauses the run (`workflow_runs.status = 'paused'`, `step_runs.status = 'awaiting_approval'`) until `approveStep` is called by an owner/editor |
| `notify` | **Not fully implemented** — the handler code exists but writes to a `notifications` table that was never created in this session; triggering a `notify` step will currently error. Documented here rather than silently left broken. |

## Trigger types implemented

| Type | Behavior |
|---|---|
| `manual` | Frontend "Run" button calls the `triggerWorkflowRun` Action directly, authenticated as the logged-in user |
| `webhook` | A separate Action, `triggerWorkflowWebhook(workflow_id, secret)`, `role: public` — no login required. The secret is stored in the trigger's `config` JSON and checked in the handler (not a session variable, since external callers have no user JWT). `triggered_by` on the resulting run uses the workflow's `created_by` as an implicit identity. |
| `scheduled` | **Not implemented** — schema allows the value but no cron/Scheduled Trigger is wired up |
| `database_event` | **Not implemented** — schema allows the value but no Hasura Event Trigger is wired up |

---

## Local development setup

```bash
git clone <this repo>
cd ai-workflow-builder

# Backend (requires Docker)
cd nhost
nhost up          # starts local Postgres + Hasura + Auth + Functions
# Hasura Console: https://local.hasura.local.nhost.run
# GraphQL: https://local.hasura.local.nhost.run/v1/graphql

# Frontend
cd ../frontend
npm install
cp .env.local.example .env.local   # then edit with local or cloud URLs
npm run dev
```

**Known local-only gotcha:** `*.local.nhost.run` domains sometimes intermittently fail to resolve (DNS `SERVFAIL`). If so, add these to `/etc/hosts`:
```
127.0.0.1 local.hasura.local.nhost.run
127.0.0.1 local.graphql.local.nhost.run
127.0.0.1 local.auth.local.nhost.run
127.0.0.1 local.storage.local.nhost.run
127.0.0.1 local.functions.local.nhost.run
127.0.0.1 local.dashboard.local.nhost.run
```

**Secrets:** local secrets live in `nhost/.secrets` (gitignored). You'll need your own Groq API key (free at console.groq.com/keys) set as `GROQ_API_KEY` there, and declared in `nhost/nhost/nhost.toml` under `[[global.environment]]`.

---

## Testing via curl — full reference

All examples below target the **live cloud deployment**. Substitute IDs from the seed data table above as needed.

### Setup (once per terminal session)

```bash
export GQL="https://teclrxnympfptmrgiqfm.hasura.ap-south-1.nhost.run/v1/graphql"
export AUTH="https://teclrxnympfptmrgiqfm.auth.ap-south-1.nhost.run/v1"
export ADMIN_SECRET="nhost-admin-secret"
```

### 1. Log in as a seeded user (get a real JWT)

```bash
cat > /tmp/req.json << 'EOF'
{"email": "org1-owner@testorg.com", "password": "TestPassword123!"}
EOF

curl -s -X POST "$AUTH/signin/email-password" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/req.json | jq
```

Copy the `session.accessToken` value from the response — this is your JWT, valid for 15 minutes. Save it:
```bash
export TOKEN="<paste accessToken here>"
```

### 2. Create a new organization

There is no `createOrganization` mutation/Action — organizations are seeded directly (deliberate scope decision for this assignment; see write-up). To create one via admin access:

```bash
cat > /tmp/req.json << 'EOF'
{"query": "mutation($name: String!) { insert_organizations_one(object: { name: $name, quota_limit: 100, quota_used: 0 }) { id } }", "variables": {"name": "New Org"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "x-hasura-admin-secret: $ADMIN_SECRET" \
  --data-binary @/tmp/req.json | jq
```

### 3. Add a member to an organization

Requires **owner** role in that org. Using a real user JWT (not admin secret) to demonstrate real permission enforcement:

```bash
cat > /tmp/req.json << 'EOF'
{"query": "mutation($userId: uuid!, $orgId: uuid!, $role: String!) { insert_org_members_one(object: { user_id: $userId, org_id: $orgId, role: $role }) { id } }", "variables": {"userId": "<some auth.users id>", "orgId": "8c2cc837-1621-4251-bb06-f2953ef9e288", "role": "editor"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq
```

### 4. Create a workflow with steps and a trigger

```bash
# Create the workflow
cat > /tmp/req.json << 'EOF'
{"query": "mutation($orgId: uuid!, $userId: uuid!) { insert_workflows_one(object: { org_id: $orgId, name: \"My Workflow\", created_by: $userId }) { id } }", "variables": {"orgId": "8c2cc837-1621-4251-bb06-f2953ef9e288", "userId": "28ab3e12-bae4-405d-9cdc-0fdaf0c7df7c"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq
# copy the returned id as WORKFLOW_ID

# Add an llm_call step
cat > /tmp/req.json << 'EOF'
{"query": "mutation($wfId: uuid!) { insert_workflow_steps_one(object: { workflow_id: $wfId, step_order: 1, type: \"llm_call\", config: { prompt: \"Say hello in exactly 5 words.\" } }) { id } }", "variables": {"wfId": "<WORKFLOW_ID>"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq

# Add a manual trigger
cat > /tmp/req.json << 'EOF'
{"query": "mutation($wfId: uuid!) { insert_workflow_triggers_one(object: { workflow_id: $wfId, type: \"manual\", config: {} }) { id } }", "variables": {"wfId": "<WORKFLOW_ID>"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq
```

### 5. Trigger a workflow run (manual)

```bash
cat > /tmp/req.json << 'EOF'
{"query": "mutation($workflowId: uuid!) { triggerWorkflowRun(workflow_id: $workflowId) { workflow_run_id status } }", "variables": {"workflowId": "a962e376-f03b-4a32-8361-1b69c289ded3"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq
```

Returns `{"workflow_run_id": "...", "status": "completed" | "paused" | "failed"}`.

### 6. Check run/step status

```bash
cat > /tmp/req.json << 'EOF'
{"query": "query($runId: uuid!) { workflow_runs_by_pk(id: $runId) { status } step_runs(where: { workflow_run_id: { _eq: $runId } }) { status output error } }", "variables": {"runId": "<workflow_run_id from step 5>"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq
```

### 7. Approve a paused approval_gate step

First find the paused `step_run`'s id (from step 6's output, where `status: "awaiting_approval"`), then:

```bash
cat > /tmp/req.json << 'EOF'
{"query": "mutation($stepRunId: uuid!, $decision: String!) { approveStep(step_run_id: $stepRunId, decision: $decision) { workflow_run_id status } }", "variables": {"stepRunId": "<step_run id>", "decision": "approved"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @/tmp/req.json | jq
```

Only an `owner` or `editor` in that workflow's org can approve — attempting this as a `viewer`, or as a user from a different org, returns a 403/404 from the Action handler itself (not just a database permission), regardless of whether you know the correct `step_run_id`.

### 8. Trigger a workflow via webhook (no login required)

Applicable to any workflow with a `webhook` trigger configured. The secret is stored in that trigger's `config` JSON — retrieve it via an authenticated query first if needed, then:

```bash
cat > /tmp/req.json << 'EOF'
{"query": "mutation($workflowId: uuid!, $secret: String!) { triggerWorkflowWebhook(workflow_id: $workflowId, secret: $secret) { workflow_run_id status } }", "variables": {"workflowId": "<workflow id with a webhook trigger>", "secret": "<the trigger's stored secret>"}}
EOF

curl -s -X POST "$GQL" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/req.json | jq
```

Note: no `Authorization` header — this Action's role is `public`, since external systems calling a webhook have no user session. A wrong or missing secret returns a generic not-found response (doesn't leak whether the workflow/trigger exists).

### 9. Prove cross-org isolation

Log in as `org2-owner@testorg.com` (step 1, different email), then repeat step 6 using **Org 1's** real workflow_run id or step_run id. Expect `null`/empty results from direct queries, and a 403/404 from `triggerWorkflowRun`/`approveStep` even though the IDs are valid, real, and correctly formatted — proving isolation isn't just "hiding" IDs, it's enforced access control.

---

## Known limitations / not yet implemented

- `notify` step type: handler exists but references a `notifications` table that was never created — will error if triggered. Avoid seeding/triggering `notify` steps.
- `scheduled` and `database_event` trigger types: schema-valid but no backend wiring (no cron Scheduled Trigger, no Hasura Event Trigger) exists yet.
- No in-app organization creation or member-invite UI — orgs/members are seeded directly (see curl reference above for the equivalent operations).
- `step_runs.attempt_count` does not currently reflect real retry counts (hardcoded to 1 at creation; the retry logic itself works correctly, just isn't reflected in this field).
- Handlers do not validate UUID shape before querying — malformed input can produce a raw 500 rather than a clean 400.

---

## Repository structure

```
ai-workflow-builder/
├── frontend/              Next.js app (App Router, TypeScript, Tailwind, Apollo Client)
├── nhost/
│   ├── functions/         Serverless function handlers (Action backends)
│   │   ├── _lib/          Shared helpers: hasura.ts, orgAuth.ts, engine.ts, llm.ts
│   │   ├── triggerWorkflowRun.ts
│   │   ├── approveStep.ts
│   │   └── webhookTrigger.ts
│   └── nhost/              nhost project root: nhost.toml, migrations/, metadata/
├── seed-cloud-data.sh      Script used to generate the seed data in this README
└── README.md               This file
```
