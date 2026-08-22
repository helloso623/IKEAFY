import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IKEAFY — Build it right, step by step",
  description:
    "Turn any furniture build guide or IKEA product into a clear, step-by-step plan with videos, materials, and help.",
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
          className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 shadow-sm"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          <Link href="/" className="flex items-center gap-3">
            <span
              className="rounded-md px-3 py-1 text-xl font-black tracking-tight"
              style={{
                background: "var(--ikeafy-yellow)",
                color: "var(--ikeafy-blue)",
              }}
            >
              IKEAFY
            </span>
            <span className="hidden text-sm font-medium text-white/80 sm:inline">
              Build it right, step by step
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold text-white">
            <Link href="/" className="hover:underline">
              New plan
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
