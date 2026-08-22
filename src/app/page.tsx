"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PRODUCTS, type Product } from "@/lib/products";

type Cart = Record<string, number>;

export default function ShopPage() {
  const [cart, setCart] = useState<Cart>({});
  const [customerName, setCustomerName] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" | "loading" } | { kind: "success"; orderId: number } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const cartItems = useMemo(
    () =>
      PRODUCTS.filter((p) => (cart[p.id] ?? 0) > 0).map((p) => ({
        product: p,
        quantity: cart[p.id],
      })),
    [cart]
  );

  const total = cartItems.reduce(
    (sum, { product, quantity }) => sum + product.price * quantity,
    0
  );

  function addToCart(product: Product) {
    setStatus({ kind: "idle" });
    setCart((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 0) + 1 }));
  }

  function removeFromCart(productId: string) {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[productId] ?? 0) - 1;
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }

  async function checkout() {
    if (customerName.trim().length === 0) {
      setStatus({ kind: "error", message: "Please enter your name." });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          items: cartItems.map(({ product, quantity }) => ({
            id: product.id,
            quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Checkout failed.");
      }
      setStatus({ kind: "success", orderId: data.order.id });
      setCart({});
      setCustomerName("");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Checkout failed.",
      });
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-1 text-2xl font-bold">Shop the range</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Affordable flat-pack furniture, assembled by you.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRODUCTS.map((product) => (
            <article
              key={product.id}
              className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-neutral-100 text-5xl">
                {product.emoji}
              </div>
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {product.category}
              </span>
              <h2 className="text-lg font-bold">{product.name}</h2>
              <p className="mb-4 flex-1 text-sm text-neutral-600">
                {product.blurb}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">${product.price}</span>
                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
                  style={{ background: "var(--ikeafy-yellow)" }}
                  data-testid={`add-${product.id}`}
                >
                  Add to cart
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">Your cart</h2>
        {cartItems.length === 0 ? (
          <p className="text-sm text-neutral-500">Your cart is empty.</p>
        ) : (
          <ul className="mb-4 space-y-3">
            {cartItems.map(({ product, quantity }) => (
              <li
                key={product.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {product.emoji} {product.name}{" "}
                  <span className="text-neutral-500">× {quantity}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span>${product.price * quantity}</span>
                  <button
                    type="button"
                    onClick={() => removeFromCart(product.id)}
                    className="rounded bg-neutral-100 px-2 text-neutral-600 hover:bg-neutral-200"
                    aria-label={`Remove one ${product.name}`}
                  >
                    −
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-4 flex justify-between border-t border-neutral-200 pt-3 font-semibold">
          <span>Total</span>
          <span data-testid="cart-total">${total}</span>
        </div>

        <label className="mb-1 block text-xs font-semibold text-neutral-600">
          Name
        </label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Ada Lovelace"
          className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          data-testid="customer-name"
        />

        <button
          type="button"
          onClick={checkout}
          disabled={cartItems.length === 0 || status.kind === "loading"}
          className="w-full rounded-full py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--ikeafy-blue)" }}
          data-testid="checkout"
        >
          {status.kind === "loading" ? "Placing order…" : "Checkout"}
        </button>

        {status.kind === "success" && (
          <p
            className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-700"
            data-testid="checkout-success"
          >
            Order #{status.orderId} placed! See it in{" "}
            <Link href="/orders" className="font-semibold underline">
              Orders
            </Link>
            .
          </p>
        )}
        {status.kind === "error" && (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
            {status.message}
          </p>
        )}
      </aside>
    </div>
  );
}
