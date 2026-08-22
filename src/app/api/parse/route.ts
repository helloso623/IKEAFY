import { NextResponse } from "next/server";

import { savePlan } from "@/lib/db";
import { parseGuide } from "@/lib/parse";
import { findProductPlan, generateGenericPlan } from "@/lib/samplePlans";
import type { BuildPlan } from "@/lib/types";

type ParseRequestBody = {
  sourceType?: "guide" | "product";
  text?: string;
  productName?: string;
  instructions?: string;
  title?: string;
};

export async function POST(request: Request) {
  let body: ParseRequestBody;
  try {
    body = (await request.json()) as ParseRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sourceType, text, productName, instructions, title } = body;

  let plan: BuildPlan;

  if (sourceType === "guide") {
    if (typeof text !== "string" || text.trim() === "") {
      return NextResponse.json(
        { error: "text is required for guide sources" },
        { status: 400 },
      );
    }
    plan = parseGuide(text, { title, instructions });
  } else if (sourceType === "product") {
    if (typeof productName !== "string" || productName.trim() === "") {
      return NextResponse.json(
        { error: "productName is required for product sources" },
        { status: 400 },
      );
    }
    const sample = findProductPlan(productName);
    if (sample) {
      plan = sample;
      if (typeof instructions === "string" && instructions.trim() !== "") {
        plan.instructions = instructions;
      }
    } else {
      plan = generateGenericPlan(productName, { instructions });
    }
  } else {
    return NextResponse.json(
      { error: "sourceType must be 'guide' or 'product'" },
      { status: 400 },
    );
  }

  const saved = savePlan(plan);
  return NextResponse.json({ plan: saved }, { status: 201 });
}
