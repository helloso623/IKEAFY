import { NextResponse } from "next/server";

import { getPlan } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (Number.isNaN(n)) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }

  const plan = getPlan(n);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json({ plan });
}
