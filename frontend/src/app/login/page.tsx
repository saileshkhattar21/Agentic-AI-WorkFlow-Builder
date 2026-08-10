"use client";

import { useAuthenticationStatus } from "@nhost/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <LoginForm />
    </main>
  );
}
