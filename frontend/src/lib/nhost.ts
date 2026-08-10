import { NhostClient } from "@nhost/nhost-js";

// Explicit URLs rather than subdomain/region auto-derivation, because the
// local nhost CLI dev environment has a known DNS quirk documented in the
// project summary: local.hasura.local.nhost.run must be used for GraphQL,
// NOT local.graphql.local.nhost.run (that one double-appends /graphql).
export const nhost = new NhostClient({
  authUrl:
    process.env.NEXT_PUBLIC_NHOST_AUTH_URL ??
    "https://local.auth.local.nhost.run/v1",
  storageUrl:
    process.env.NEXT_PUBLIC_NHOST_STORAGE_URL ??
    "https://local.storage.local.nhost.run/v1",
  functionsUrl:
    process.env.NEXT_PUBLIC_NHOST_FUNCTIONS_URL ??
    "https://local.functions.local.nhost.run/v1",
  graphqlUrl:
    process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL ??
    "https://local.hasura.local.nhost.run/v1/graphql",
});
