import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type { BuildPlan, PlanSummary, PlanSourceType, PlanOrigin } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ikeafy.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      origin TEXT NOT NULL,
      step_count INTEGER NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

type PlanRow = {
  id: number;
  title: string;
  source_type: string;
  origin: string;
  step_count: number;
  plan_json: string;
  created_at: string;
};

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function rowToPlan(row: PlanRow): BuildPlan {
  const parsed = JSON.parse(row.plan_json) as BuildPlan;
  return {
    ...parsed,
    id: row.id,
    createdAt: row.created_at,
    steps: toArray(parsed.steps),
    materials: toArray(parsed.materials),
    tools: toArray(parsed.tools),
    difficulties: toArray(parsed.difficulties),
  };
}

export function savePlan(plan: BuildPlan): BuildPlan {
  const database = getDb();
  const stepCount = plan.steps.length;
  const planJson = JSON.stringify(plan);

  const stmt = database.prepare(
    `INSERT INTO plans (title, source_type, origin, step_count, plan_json)
     VALUES (?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    plan.title,
    plan.sourceType,
    plan.origin,
    stepCount,
    planJson
  );
  const id = Number(result.lastInsertRowid);

  const row = database
    .prepare(`SELECT created_at FROM plans WHERE id = ?`)
    .get(id) as Pick<PlanRow, "created_at">;

  return {
    ...plan,
    id,
    createdAt: row.created_at,
    steps: toArray(plan.steps),
    materials: toArray(plan.materials),
    tools: toArray(plan.tools),
    difficulties: toArray(plan.difficulties),
  };
}

export function getPlan(id: number): BuildPlan | undefined {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM plans WHERE id = ?`)
    .get(id) as PlanRow | undefined;

  if (!row) return undefined;
  return rowToPlan(row);
}

export function listPlans(): PlanSummary[] {
  const database = getDb();
  const rows = database
    .prepare(`SELECT * FROM plans ORDER BY id DESC`)
    .all() as PlanRow[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceType: row.source_type as PlanSourceType,
    origin: row.origin as PlanOrigin,
    stepCount: row.step_count,
    createdAt: row.created_at,
  }));
}
