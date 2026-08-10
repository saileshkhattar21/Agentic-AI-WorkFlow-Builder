"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { App } from "@/components/App";

export default function HomePage() {
  return (
    <AuthGuard>
      <App />
    </AuthGuard>
  );
}
