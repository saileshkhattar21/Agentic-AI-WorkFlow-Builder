// nhost/functions/_lib/hasura.ts
//
// Every function runs server-side and is trusted, so it talks to Hasura
// with the admin secret — this deliberately bypasses Layer 1 permissions.
// That's fine: Layer 1 exists to stop end-users querying GraphQL directly,
// not to stop our own backend code. Layer 2 is what replaces it here —
// we do the org/role check ourselves, in orgAuth.ts, before we let any
// of this code touch a row.

const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || process.env.HASURA_GRAPHQL_ENDPOINT!;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET!;

export class HasuraError extends Error {
  constructor(public errors: unknown) {
    super("Hasura GraphQL error: " + JSON.stringify(errors));
  }
}

export async function adminGraphQL<T = any>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) {
    throw new HasuraError(json.errors);
  }
  return json.data as T;
}