import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IKEAFY — Flat-pack furniture, delivered",
  description: "A tiny IKEA-style furniture store demo app.",
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
          <Link href="/" className="flex items-center gap-2">
            <span
              className="rounded-md px-3 py-1 text-xl font-black tracking-tight"
              style={{ background: "var(--ikeafy-yellow)", color: "var(--ikeafy-blue)" }}
            >
              IKEAFY
            </span>
          </Link>
          <nav className="flex gap-6 text-sm font-semibold text-white">
            <Link href="/" className="hover:underline">
              Shop
            </Link>
            <Link href="/orders" className="hover:underline">
              Orders
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
