import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IKEAFY — Build it right, step by step",
  description:
    "Turn any furniture or DIY build guide into a guided, video-assisted plan with the exact materials you need.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header
          className="sticky top-0 z-50 border-b border-black/10 shadow-sm"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-3">
              <span
                className="rounded-lg px-3 py-1 text-xl font-black tracking-tight"
                style={{
                  background: "var(--ikeafy-yellow)",
                  color: "var(--ikeafy-blue)",
                }}
              >
                IKEAFY
              </span>
              <span className="text-xs font-medium uppercase tracking-widest text-white/70">
                assembly copilot
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-semibold text-white">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/10"
              >
                New build
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-black/50">
          IKEAFY · MVP — video (Veed), parsing/chat (Pioneer Gliner 2) and parts
          search (Tavily) are stubbed with integration hooks.
        </footer>
      </body>
    </html>
  );
}
