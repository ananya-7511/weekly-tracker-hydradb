import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weekly GTM Analytics Tracker — HydraDB",
  description: "Weekly GTM reporting: outcome/channel/signal metrics, intervention triggers, decision log",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-tremor-background-muted">
        <header className="border-b border-tremor-border bg-tremor-background">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <span className="text-tremor-default font-semibold text-tremor-content-strong">
                Weekly GTM Analytics Tracker
              </span>
              <nav className="flex gap-4 text-tremor-default text-tremor-content">
                <Link href="/" className="hover:text-tremor-content-strong">
                  This Week
                </Link>
                <Link href="/trends" className="hover:text-tremor-content-strong">
                  Trends
                </Link>
                <Link href="/mentions/upload" className="hover:text-tremor-content-strong">
                  Upload Mentions CSV
                </Link>
                <Link href="/settings" className="hover:text-tremor-content-strong">
                  Settings
                </Link>
              </nav>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
