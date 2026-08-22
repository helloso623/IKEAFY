import Link from "next/link";
import { listOrders } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  const orders = listOrders();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Orders</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Every checkout is persisted to the local SQLite database.
      </p>

      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No orders yet.{" "}
          <Link href="/" className="font-semibold underline">
            Place one from the shop
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
              data-testid={`order-${order.id}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">Order #{order.id}</span>
                <span className="text-lg font-semibold">${order.total}</span>
              </div>
              <p className="mb-2 text-sm text-neutral-600">
                Placed by {order.customerName}
              </p>
              <ul className="text-sm text-neutral-700">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.name} × {item.quantity} — ${item.price * item.quantity}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
