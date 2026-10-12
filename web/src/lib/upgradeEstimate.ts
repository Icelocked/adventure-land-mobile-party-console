// Console 1.4: runtime/upgrade-estimate.ts, copied unchanged. The server runs the same batch
// estimate on every buy order, so the PWA shows what the server will accept.
/** Catalog subset; unobservable server/player-wide grace is deliberately omitted. */
export interface UpgradeChoice {
  id: string;
  cost: number;
  upgradeable?: boolean;
  upgradeGrade?: number;
  upgradeChances?: number[];
  grades?: number[];
  scrollCosts?: number[];
}
export type UpgradeEstimate =
  | {
      status: "available";
      attempts: number;
      gold: number;
      scrolls: number[];
      completed: number;
      rolls: number;
    }
  | { status: "unavailable"; completed: number; rolls: number };
const defaults = [
  [1, 0.9999999, 0.98, 0.95, 0.7, 0.6, 0.4, 0.25, 0.15, 0.07, 0.024, 0.14, 0.11],
  [1, 0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018, 0.13, 0.1],
  [1, 0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015, 0.12, 0.09],
];
export function highestUpgradeLevel(choice: UpgradeChoice) {
  if (!choice.upgradeable) return 0;
  const chances =
    choice.upgradeChances ||
    defaults[Math.max(0, Math.min(2, Math.floor(choice.upgradeGrade || 0)))]!;
  let level = 0;
  while (level + 1 < chances.length && Number(chances[level + 1]) > 0) level++;
  return level;
}
export function upgradeEstimateKey(choice: UpgradeChoice, quantity: number, target: number) {
  return JSON.stringify([
    choice.id,
    choice.cost,
    choice.upgradeable,
    choice.upgradeGrade,
    choice.upgradeChances,
    choice.grades,
    choice.scrollCosts,
    quantity,
    target,
  ]);
}
export interface EstimateLine {
  choice: UpgradeChoice;
  quantity: number;
  target: number;
}
const cache = new Map<string, UpgradeEstimate[]>();
let scheduler: Promise<unknown> = Promise.resolve();
/** Canonical ordering makes dashboard/server estimates independent of cart order.
 * Cache only complete batches; cancelled edits cannot poison later estimates. */
export function estimateUpgradeBatch(
  lines: EstimateLine[],
  signal?: AbortSignal,
): Promise<UpgradeEstimate[]> {
  const sorted = lines
    .map((line, index) => ({
      line,
      index,
      key: upgradeEstimateKey(line.choice, line.quantity, line.target),
    }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const key = JSON.stringify(sorted.map((entry) => entry.key));
  const task = scheduler.then(async () => {
    signal?.throwIfAborted();
    let results = cache.get(key);
    if (!results) {
      const budget = { remaining: 60_000_000, signal };
      results = [];
      for (const entry of sorted) {
        signal?.throwIfAborted();
        results.push(
          await simulate(entry.line.choice, entry.line.quantity, entry.line.target, budget),
        );
      }
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(key, results);
    }
    const output: UpgradeEstimate[] = [];
    sorted.forEach((entry, index) => {
      output[entry.index] = results![index]!;
    });
    return output;
  });
  scheduler = task.catch(() => {});
  return task;
}
export function estimateUpgrade(
  choice: UpgradeChoice,
  quantity: number,
  target: number,
): Promise<UpgradeEstimate> {
  return estimateUpgradeBatch([{ choice, quantity, target }]).then((results) => results[0]!);
}
/** One deterministic 3000-run batch with a total budget of 60M random rolls.
 * Cut-off runs are discarded; fewer than 30 completions yield no estimate.
 * Cooperative yields keep both browser rendering and coordinator I/O alive. */
async function simulate(
  choice: UpgradeChoice,
  quantity: number,
  target: number,
  budget: { remaining: number; signal?: AbortSignal },
): Promise<UpgradeEstimate> {
  if (!target || !choice.upgradeable)
    return {
      status: "available",
      attempts: quantity,
      gold: choice.cost * quantity,
      scrolls: [],
      completed: 3000,
      rolls: 0,
    };
  if (target > highestUpgradeLevel(choice))
    return { status: "unavailable", completed: 0, rolls: 0 };
  const policy = simulationPolicy(choice, target);
  let seed = 2166136261;
  for (const char of `${choice.id}:${quantity}:${target}`)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  function random() {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  const runs: { attempts: number; gold: number; scrolls: number[] }[] = [];
  const startBudget = budget.remaining;
  simulation: for (let run = 0; run < 3000; run++) {
    const grace = Array<number>(20).fill(0),
      scrolls = [0, 0, 0, 0];
    let attempts = 0,
      successes = 0;
    while (successes < quantity) {
      attempts++;
      const survived = await upgradeOne(policy, grace, scrolls, random, budget);
      if (survived === null) break simulation;
      if (survived) successes++;
    }
    runs.push({
      attempts,
      gold:
        attempts * choice.cost +
        scrolls.reduce((sum, count, grade) => sum + count * (policy.costs[grade] || 0), 0),
      scrolls,
    });
  }
  const rolls = startBudget - budget.remaining;
  if (runs.length < 30) return { status: "unavailable", completed: runs.length, rolls };
  runs.sort((a, b) => a.gold - b.gold);
  return {
    status: "available",
    ...runs[Math.ceil(runs.length * 0.9) - 1]!,
    completed: runs.length,
    rolls,
  };
}
function simulationPolicy(choice: UpgradeChoice, target: number) {
  const grade = Math.max(0, Math.min(2, Math.floor(choice.upgradeGrade || 0)));
  return {
    target,
    igrace: [1, -1, -2][grade]!,
    chances: choice.upgradeChances || defaults[grade]!,
    grades: choice.grades || [9, 10, 11, 12],
    costs: choice.scrollCosts || [1000, 40000, 1600000, 64000000],
  };
}
function scrollGrade(level: number, grades: number[]) {
  if (level >= (grades[2] ?? 11)) return 3;
  if (level >= (grades[1] ?? 10)) return 2;
  return level >= (grades[0] ?? 9) ? 1 : 0;
}
function rollChance(base: number, level: number, grace: number[], igrace: number) {
  const count = Math.max(0, Math.min(level + 1, Math.min(3, grace[level]! / 4.5) + igrace));
  let bonus = (base * count) / level + count / 1000;
  bonus = Math.max(0, bonus / 4.8 - 0.4 / (level - 0.999) ** 2);
  return Math.min(base + bonus, Math.min(base + 0.24, base * 2));
}
function failedGrace(grace: number[], level: number) {
  grace[level - 1]!++;
  grace[level]!++;
  if (level >= 8 && level <= 15) {
    grace[level - 1]!++;
    grace[level - 2]! += 2;
    grace[level - 3]! += 2;
  }
}
async function upgradeOne(
  policy: ReturnType<typeof simulationPolicy>,
  grace: number[],
  scrolls: number[],
  random: () => number,
  budget: { remaining: number; signal?: AbortSignal },
): Promise<boolean | null> {
  for (let level = 1; level <= policy.target; level++) {
    if (!budget.remaining) return null;
    if (budget.remaining % 32768 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      budget.signal?.throwIfAborted();
    }
    budget.remaining--;
    scrolls[scrollGrade(level - 1, policy.grades)]!++;
    if (random() <= rollChance(policy.chances[level] || 0, level, grace, policy.igrace))
      grace[level] = 0;
    else {
      failedGrace(grace, level);
      return false;
    }
  }
  return true;
}
