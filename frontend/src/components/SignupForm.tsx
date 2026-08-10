"use client";

import { useState } from "react";
import { useSignUpEmailPassword } from "@nhost/react";
import Link from "next/link";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const {
    signUpEmailPassword,
    isLoading,
    isSuccess,
    isError,
    error,
    needsEmailVerification,
  } = useSignUpEmailPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signUpEmailPassword(email, password);
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-2">You&apos;re in</h1>
        <p className="text-sm text-muted mb-4">
          Account created and signed in. If your org membership isn&apos;t set
          up yet, ask an org owner to add you via <code className="text-xs">org_members</code>.
        </p>
        <Link href="/" className="text-accent hover:underline text-sm">
          Go to the app &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold mb-1">Create an account</h1>
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-panel2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {needsEmailVerification && (
          <div className="rounded-md border border-yellow-700/50 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-300">
            Account created. Email verification is required before sign-in -
            check{" "}
            <a
              href="https://local.mailhog.local.nhost.run"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Mailhog
            </a>{" "}
            for the link, or disable{" "}
            <code className="text-xs">emailVerificationRequired</code> in{" "}
            <code className="text-xs">nhost.toml</code> for local dev.
          </div>
        )}

        {isError && (
          <div className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
            {error?.message ?? "Sign up failed."}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium py-2 transition"
        >
          {isLoading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <p className="text-sm text-muted mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
