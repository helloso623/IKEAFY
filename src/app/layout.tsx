import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IKEAFY — Build anything, step by step",
  description:
    "A flat-pack, step-by-step builder app. Assemble anything with clear IKEA-style instructions.",
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
          className="flex items-center justify-between px-6 py-4"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          <Link href="/" className="flex items-center gap-3">
            <span className="ikeafy-wordmark text-xl">IKEAFY</span>
            <span className="hidden text-sm font-medium text-white/90 sm:inline">
              Build anything, step by step
            </span>
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/" className="ikeafy-link">
              Home
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
