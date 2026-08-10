import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  split,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getMainDefinition } from "@apollo/client/utilities";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { nhost } from "./nhost";

const GRAPHQL_HTTP_URL =
  process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL ??
  "https://local.hasura.local.nhost.run/v1/graphql";

const GRAPHQL_WS_URL = GRAPHQL_HTTP_URL.replace(/^http/, "ws");

const httpLink = new HttpLink({ uri: GRAPHQL_HTTP_URL });

// Attach the current nhost access token (if any) to every request. nhost
// keeps this token refreshed in the background, so we just read it fresh
// on each outgoing operation rather than caching it ourselves.
const authLink = setContext((_, { headers }) => {
  const token = nhost.auth.getAccessToken();
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

function makeWsLink() {
  if (typeof window === "undefined") return null;

  const wsClient = createClient({
    url: GRAPHQL_WS_URL,
    connectionParams: async () => {
      const token = nhost.auth.getAccessToken();
      return {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      };
    },
    // Reconnect so a refreshed access token gets picked up on new
    // subscriptions rather than sticking with a stale/expired one.
    shouldRetry: () => true,
  });

  return new GraphQLWsLink(wsClient);
}

export function createApolloClient() {
  const wsLink = makeWsLink();

  const httpChain = from([authLink, httpLink]);

  const link = wsLink
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === "OperationDefinition" &&
            definition.operation === "subscription"
          );
        },
        wsLink,
        httpChain
      )
    : httpChain;

  return new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: "cache-and-network" },
    },
  });
}
