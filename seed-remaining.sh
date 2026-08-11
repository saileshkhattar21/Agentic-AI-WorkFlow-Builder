#!/bin/bash
set -e

GQL="https://teclrxnympfptmrgiqfm.hasura.ap-south-1.nhost.run/v1/graphql"
ADMIN_SECRET="nhost-admin-secret"
AUTH="https://teclrxnympfptmrgiqfm.auth.ap-south-1.nhost.run/v1"

gql() {
  curl -s -X POST "$GQL" \
    -H "Content-Type: application/json" \
    -H "x-hasura-admin-secret: $ADMIN_SECRET" \
    --data-binary @/tmp/seed_req.json
}

create_member() {
  ORG_ID="$1"
  ROLE="$2"
  EMAIL="$3"
  PASSWORD="TestPassword123!"

  SIGNUP_RESULT=$(curl -s -X POST "$AUTH/signup/email-password" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

  USER_ID=$(echo "$SIGNUP_RESULT" | jq -r '.session.user.id // empty')

  if [ -z "$USER_ID" ]; then
    echo "  FAILED signup for $EMAIL: $SIGNUP_RESULT"
    return 1
  fi

  echo "  $ROLE: $EMAIL / $PASSWORD (id: $USER_ID)"

  MEMBER_QUERY='{"query": "mutation($userId: uuid!, $orgId: uuid!, $role: String!) { insert_org_members_one(object: { user_id: $userId, org_id: $orgId, role: $role }) { id } }", "variables": {"userId": "USER_ID_PLACEHOLDER", "orgId": "ORG_ID_PLACEHOLDER", "role": "ROLE_PLACEHOLDER"}}'
  echo "$MEMBER_QUERY" | sed "s/USER_ID_PLACEHOLDER/$USER_ID/;s/ORG_ID_PLACEHOLDER/$ORG_ID/;s/ROLE_PLACEHOLDER/$ROLE/" > /tmp/seed_req.json
  gql > /dev/null

  echo "$USER_ID"
}

echo "--- Filling Org 4 (Umbrella Labs) ---"
create_member "1c878f1d-7cfd-4e6b-b02f-1c644f0e8a1a" "editor" "org4-editor@testorg.com"
create_member "1c878f1d-7cfd-4e6b-b02f-1c644f0e8a1a" "viewer" "org4-viewer@testorg.com"

echo "--- Filling Org 5 (Stark Industries) ---"
OWNER5=$(create_member "7120c044-f35e-4f6c-99db-10977f717a3b" "owner" "org5-owner@testorg.com" | tail -1)
create_member "7120c044-f35e-4f6c-99db-10977f717a3b" "editor" "org5-editor@testorg.com"
create_member "7120c044-f35e-4f6c-99db-10977f717a3b" "viewer" "org5-viewer@testorg.com"

echo "--- Creating Org 5's workflow ---"
WF_QUERY='{"query": "mutation($orgId: uuid!, $userId: uuid!) { insert_workflows_one(object: { org_id: $orgId, name: \"Sample Workflow\", created_by: $userId }) { id } }", "variables": {"orgId": "7120c044-f35e-4f6c-99db-10977f717a3b", "userId": "OWNER_PLACEHOLDER"}}'
echo "$WF_QUERY" | sed "s/OWNER_PLACEHOLDER/$OWNER5/" > /tmp/seed_req.json
WORKFLOW_ID=$(gql | jq -r '.data.insert_workflows_one.id // empty')
echo "  workflow_id: $WORKFLOW_ID"

STEP_QUERY='{"query": "mutation($wfId: uuid!) { insert_workflow_steps_one(object: { workflow_id: $wfId, step_order: 1, type: \"llm_call\", config: { prompt: \"Say hello in exactly 5 words.\" } }) { id } }", "variables": {"wfId": "WF_ID_PLACEHOLDER"}}'
echo "$STEP_QUERY" | sed "s/WF_ID_PLACEHOLDER/$WORKFLOW_ID/" > /tmp/seed_req.json
gql > /dev/null

TRIGGER_QUERY='{"query": "mutation($wfId: uuid!) { insert_workflow_triggers_one(object: { workflow_id: $wfId, type: \"manual\", config: {} }) { id } }", "variables": {"wfId": "WF_ID_PLACEHOLDER"}}'
echo "$TRIGGER_QUERY" | sed "s/WF_ID_PLACEHOLDER/$WORKFLOW_ID/" > /tmp/seed_req.json
gql > /dev/null

echo ""
echo "Done."
