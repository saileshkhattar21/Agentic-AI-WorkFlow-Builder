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

echo "=== Seeding 5 organizations, 3 members each, 1 workflow each ==="

ORG_NAMES=("Acme Corp" "Globex Inc" "Initech" "Umbrella Labs" "Stark Industries")
ROLES=("owner" "editor" "viewer")

SUMMARY_FILE="/tmp/seed_summary.txt"
> "$SUMMARY_FILE"

for i in 0 1 2 3 4; do
  ORG_NAME="${ORG_NAMES[$i]}"
  echo ""
  echo "--- Org $((i+1)): $ORG_NAME ---"

  ORG_QUERY='{"query": "mutation($name: String!) { insert_organizations_one(object: { name: $name, quota_limit: 200, quota_used: 0 }) { id } }", "variables": {"name": "ORG_NAME_PLACEHOLDER"}}'
  echo "$ORG_QUERY" | sed "s/ORG_NAME_PLACEHOLDER/$ORG_NAME/" > /tmp/seed_req.json
  ORG_RESULT=$(gql)
  ORG_ID=$(echo "$ORG_RESULT" | jq -r '.data.insert_organizations_one.id // empty')

  if [ -z "$ORG_ID" ]; then
    echo "  ERROR creating org: $ORG_RESULT"
    continue
  fi
  echo "  org_id: $ORG_ID"
  echo "ORG: $ORG_NAME | id: $ORG_ID" >> "$SUMMARY_FILE"

  OWNER_ID=""

  for j in 0 1 2; do
    ROLE="${ROLES[$j]}"
    EMAIL="org$((i+1))-${ROLE}@testorg.com"
    PASSWORD="TestPassword123!"

    SIGNUP_RESULT=$(curl -s -X POST "$AUTH/signup/email-password" \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

    USER_ID=$(echo "$SIGNUP_RESULT" | jq -r '.session.user.id // empty')

    if [ -z "$USER_ID" ]; then
      USER_QUERY='{"query": "query($email: citext!) { users(where: { email: { _eq: $email } }) { id } }", "variables": {"email": "EMAIL_PLACEHOLDER"}}'
      echo "$USER_QUERY" | sed "s/EMAIL_PLACEHOLDER/$EMAIL/" > /tmp/seed_req.json
      USER_ID=$(gql | jq -r '.data.users[0].id // empty')
    fi

    if [ -z "$USER_ID" ]; then
      echo "  ERROR: could not create or find user $EMAIL"
      continue
    fi

    echo "  $ROLE: $EMAIL / $PASSWORD (id: $USER_ID)"
    echo "  USER: $EMAIL | password: $PASSWORD | role: $ROLE | id: $USER_ID" >> "$SUMMARY_FILE"

    MEMBER_QUERY='{"query": "mutation($userId: uuid!, $orgId: uuid!, $role: String!) { insert_org_members_one(object: { user_id: $userId, org_id: $orgId, role: $role }) { id } }", "variables": {"userId": "USER_ID_PLACEHOLDER", "orgId": "ORG_ID_PLACEHOLDER", "role": "ROLE_PLACEHOLDER"}}'
    echo "$MEMBER_QUERY" | sed "s/USER_ID_PLACEHOLDER/$USER_ID/;s/ORG_ID_PLACEHOLDER/$ORG_ID/;s/ROLE_PLACEHOLDER/$ROLE/" > /tmp/seed_req.json
    gql > /dev/null

    if [ "$ROLE" == "owner" ]; then
      OWNER_ID="$USER_ID"
    fi
  done

  if [ -z "$OWNER_ID" ]; then
    echo "  ERROR: no owner id, skipping workflow creation for this org"
    continue
  fi

  WF_QUERY='{"query": "mutation($orgId: uuid!, $userId: uuid!) { insert_workflows_one(object: { org_id: $orgId, name: \"Sample Workflow\", created_by: $userId }) { id } }", "variables": {"orgId": "ORG_ID_PLACEHOLDER", "userId": "USER_ID_PLACEHOLDER"}}'
  echo "$WF_QUERY" | sed "s/ORG_ID_PLACEHOLDER/$ORG_ID/;s/USER_ID_PLACEHOLDER/$OWNER_ID/" > /tmp/seed_req.json
  WORKFLOW_ID=$(gql | jq -r '.data.insert_workflows_one.id // empty')

  if [ -z "$WORKFLOW_ID" ]; then
    echo "  ERROR creating workflow"
    continue
  fi
  echo "  workflow_id: $WORKFLOW_ID"
  echo "  WORKFLOW: Sample Workflow | id: $WORKFLOW_ID" >> "$SUMMARY_FILE"

  STEP_QUERY='{"query": "mutation($wfId: uuid!) { insert_workflow_steps_one(object: { workflow_id: $wfId, step_order: 1, type: \"llm_call\", config: { prompt: \"Say hello in exactly 5 words.\" } }) { id } }", "variables": {"wfId": "WF_ID_PLACEHOLDER"}}'
  echo "$STEP_QUERY" | sed "s/WF_ID_PLACEHOLDER/$WORKFLOW_ID/" > /tmp/seed_req.json
  gql > /dev/null

  TRIGGER_QUERY='{"query": "mutation($wfId: uuid!) { insert_workflow_triggers_one(object: { workflow_id: $wfId, type: \"manual\", config: {} }) { id } }", "variables": {"wfId": "WF_ID_PLACEHOLDER"}}'
  echo "$TRIGGER_QUERY" | sed "s/WF_ID_PLACEHOLDER/$WORKFLOW_ID/" > /tmp/seed_req.json
  gql > /dev/null

done

echo ""
echo "=== Done. Full summary saved to $SUMMARY_FILE ==="
cat "$SUMMARY_FILE"
