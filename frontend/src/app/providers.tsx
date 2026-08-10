"use client";

import { useMemo } from "react";
import { NhostProvider } from "@nhost/react";
import { ApolloProvider } from "@apollo/client";
import { nhost } from "@/lib/nhost";
import { createApolloClient } from "@/lib/apollo";

export function Providers({ children }: { children: React.ReactNode }) {
  const apolloClient = useMemo(() => createApolloClient(), []);

  return (
    <NhostProvider nhost={nhost}>
      <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
    </NhostProvider>
  );
}
