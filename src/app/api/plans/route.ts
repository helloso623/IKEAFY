import { NextResponse } from "next/server";

import { listPlans } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ plans: listPlans() });
}
