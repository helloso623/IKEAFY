import { NextResponse } from "next/server";
import { createOrder, listOrders, type OrderItem } from "@/lib/db";
import { getProduct } from "@/lib/products";

export function GET() {
  return NextResponse.json({ orders: listOrders() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { customerName, items } = (body ?? {}) as {
    customerName?: unknown;
    items?: unknown;
  };

  if (typeof customerName !== "string" || customerName.trim().length === 0) {
    return NextResponse.json(
      { error: "customerName is required." },
      { status: 400 }
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "At least one cart item is required." },
      { status: 400 }
    );
  }

  const validated: OrderItem[] = [];
  for (const raw of items) {
    const { id, quantity } = (raw ?? {}) as {
      id?: unknown;
      quantity?: unknown;
    };
    if (typeof id !== "string") {
      return NextResponse.json(
        { error: "Each item needs a product id." },
        { status: 400 }
      );
    }
    const product = getProduct(id);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${id}` },
        { status: 400 }
      );
    }
    const qty =
      typeof quantity === "number" && Number.isFinite(quantity)
        ? Math.max(1, Math.floor(quantity))
        : 1;
    validated.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: qty,
    });
  }

  const order = createOrder(customerName.trim(), validated);
  return NextResponse.json({ order }, { status: 201 });
}
