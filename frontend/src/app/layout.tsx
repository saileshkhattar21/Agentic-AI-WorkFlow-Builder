import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AI Agent Workflow Builder",
  description: "Build and run chained AI agent workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg text-text min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
