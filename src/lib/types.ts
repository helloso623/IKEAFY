export type MaterialBadge = "included" | "purchase";

export type RetailerLink = {
  name: string;
  url: string;
};

export type Material = {
  name: string;
  quantity: number;
  badge: MaterialBadge;
  note?: string;
  retailers: RetailerLink[];
};

export type BuildStep = {
  number: number;
  title: string;
  action: string;
  parts: string[];
  tools: string[];
  note?: string;
};

export type PlanSourceType = "guide" | "product";
export type PlanOrigin = "sample" | "parsed" | "generated";

export type BuildPlan = {
  id?: number;
  title: string;
  sourceType: PlanSourceType;
  sourceValue: string;
  instructions?: string;
  origin: PlanOrigin;
  steps: BuildStep[];
  materials: Material[];
  tools: string[];
  difficulties: string[];
  sparePartsHint: string;
  createdAt?: string;
};

export type PlanSummary = {
  id: number;
  title: string;
  sourceType: PlanSourceType;
  origin: PlanOrigin;
  stepCount: number;
  createdAt: string;
};
