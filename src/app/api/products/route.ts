import { NextResponse } from "next/server";
import { PRODUCTS } from "@/lib/products";

export function GET() {
  return NextResponse.json({ products: PRODUCTS });
}
