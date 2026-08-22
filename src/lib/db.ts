import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ikeafy.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      items_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export type Order = {
  id: number;
  customerName: string;
  total: number;
  items: OrderItem[];
  createdAt: string;
};

export function createOrder(customerName: string, items: OrderItem[]): Order {
  const database = getDb();
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalCents = Math.round(total * 100);

  const stmt = database.prepare(
    `INSERT INTO orders (customer_name, total_cents, items_json)
     VALUES (?, ?, ?)`
  );
  const result = stmt.run(customerName, totalCents, JSON.stringify(items));
  const id = Number(result.lastInsertRowid);

  return {
    id,
    customerName,
    total,
    items,
    createdAt: new Date().toISOString(),
  };
}

type OrderRow = {
  id: number;
  customer_name: string;
  total_cents: number;
  items_json: string;
  created_at: string;
};

export function listOrders(): Order[] {
  const database = getDb();
  const rows = database
    .prepare(`SELECT * FROM orders ORDER BY id DESC`)
    .all() as OrderRow[];

  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    total: row.total_cents / 100,
    items: JSON.parse(row.items_json) as OrderItem[],
    createdAt: row.created_at,
  }));
}
