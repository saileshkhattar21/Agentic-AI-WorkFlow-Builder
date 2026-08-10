"use client";

import { useState } from "react";
import { useSignInEmailPassword } from "@nhost/react";
import Link from "next/link";

export function LoginForm() {
  const [email, setEmail] = useState("owner@testorg.com");
  const [password, setPassword] = useState("");
  const { signInEmailPassword, isLoading, isError, error, needsEmailVerification } =
    useSignInEmailPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signInEmailPassword(email, password);
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold mb-1">Sign in</h1>
      <p className="text-muted text-sm mb-6">AI Agent Workflow Builder</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-muted mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md bg-panel2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-panel2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {needsEmailVerification && (
          <div className="rounded-md border border-yellow-700/50 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-300">
            This account needs email verification before it can sign in. Check{" "}
            <a
              href="https://local.mailhog.local.nhost.run"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Mailhog
            </a>{" "}
            for the verification email, or set{" "}
            <code className="text-xs">emailVerificationRequired = false</code> under{" "}
            <code className="text-xs">[auth.method.emailPassword]</code> in{" "}
            <code className="text-xs">nhost.toml</code> for local dev and restart nhost.
          </div>
        )}

        {isError && !needsEmailVerification && (
          <div className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
            {error?.message ?? "Sign in failed."}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium py-2 transition"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="text-sm text-muted mt-6">
        No account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
