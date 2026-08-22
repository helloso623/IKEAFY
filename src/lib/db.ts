import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { BuildPlan, PlanSummary, PlanSourceType, PlanOrigin } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ikeafy.db");

let db: Database.Database | undefined;

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

type Row = {
  id: number;
  title: string;
  source_type: string;
  origin: string;
  step_count: number;
  plan_json: string;
  created_at: string;
};

type StoredPlan = Omit<BuildPlan, "id" | "createdAt">;

export function savePlan(plan: BuildPlan): BuildPlan {
  const database = getDb();

  const { id: _id, createdAt: _createdAt, ...planBody } = plan;
  void _id;
  void _createdAt;

  const stepCount = plan.steps.length;

  const info = database
    .prepare(
      `INSERT INTO plans (title, source_type, origin, step_count, plan_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(plan.title, plan.sourceType, plan.origin, stepCount, JSON.stringify(planBody));

  const id = Number(info.lastInsertRowid);

  const row = database
    .prepare(`SELECT created_at FROM plans WHERE id = ?`)
    .get(id) as Pick<Row, "created_at"> | undefined;

  return {
    ...planBody,
    id,
    createdAt: row?.created_at ?? new Date().toISOString(),
  };
}

export function getPlan(id: number): BuildPlan | undefined {
  const database = getDb();

  const row = database.prepare(`SELECT * FROM plans WHERE id = ?`).get(id) as Row | undefined;
  if (!row) return undefined;

  const parsed = JSON.parse(row.plan_json) as StoredPlan;

  return {
    ...parsed,
    id: row.id,
    createdAt: row.created_at,
  };
}

export function listPlans(): PlanSummary[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT id, title, source_type, origin, step_count, created_at
       FROM plans
       ORDER BY id DESC`
    )
    .all() as Array<Omit<Row, "plan_json">>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceType: row.source_type as PlanSourceType,
    origin: row.origin as PlanOrigin,
    stepCount: row.step_count,
    createdAt: row.created_at,
  }));
}
