import { NextResponse } from "next/server";

import { answerQuestion } from "@/lib/chat";
import { getPlan } from "@/lib/db";

export const dynamic = "force-dynamic";

type ChatRequestBody = {
  planId?: number;
  question?: string;
};

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { planId, question } = body;

  if (typeof planId !== "number" || !Number.isFinite(planId)) {
    return NextResponse.json(
      { error: "planId must be a finite number." },
      { status: 400 },
    );
  }

  if (typeof question !== "string" || question.trim() === "") {
    return NextResponse.json(
      { error: "question is required." },
      { status: 400 },
    );
  }

  const plan = getPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const result = answerQuestion(plan, question);
  return NextResponse.json(result);
}
