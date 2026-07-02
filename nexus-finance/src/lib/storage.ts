import { promises as fs } from "fs";
import path from "path";
import type { Portfolio, Budget, Goals, Settings } from "./types";

const DATA_DIR = path.join(process.cwd(), "src", "data");

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  const target = path.join(DATA_DIR, file);
  const tmp = target + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, target);
}

export const getPortfolio = () => readJson<Portfolio>("portfolio.json");
export const savePortfolio = (p: Portfolio) => writeJson("portfolio.json", p);

export const getBudget = () => readJson<Budget>("budget.json");
export const saveBudget = (b: Budget) => writeJson("budget.json", b);

export const getGoals = () => readJson<Goals>("goals.json");
export const saveGoals = (g: Goals) => writeJson("goals.json", g);

export const getSettings = () => readJson<Settings>("settings.json");
