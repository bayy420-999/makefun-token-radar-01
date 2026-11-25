// Token radar: costed farm plans (farm.ts) — radar-6.
//
// Pure functions, deterministic: no clock, no randomness, no network.
// Self-contained on purpose — it duplicates the two tiny helpers it needs
// (shortUsd, holdDaysFor, the category action) instead of importing from
// model.ts, so the integration step can wire it in without merge conflicts.
//
// ── Gas table (November 2026) ────────────────────────────────────────────
// The per-chain deposit/claim figures below are TYPICAL-GAS OPERATIONAL
// ESTIMATES, NOT snapshot figures and NOT a quote for any moment: gas moves
// with congestion, and the reader can check any figure against a block
// explorer or a gas tracker before moving funds. They are one deposit
// transaction and one claim transaction on that chain, in USD, for a plain
// contract interaction at ordinary (not congested) gas. The figures come
// from farm-costs.md §2 (November 2026): Ethereum $2/$1, Tron $2/$1,
// Bitcoin $2/$1, Base and Arbitrum $0.50/$0.25, Optimism $0.75/$0.50,
// Polygon $0.25/$0.25, Binance $0.50/$0.25, Solana $0.10/$0.10, and the
// default $0.50/$0.25 for every other chain — November 2026 gas is cheap
// everywhere except Ethereum, Tron and Bitcoin, so the radar-5 table's
// per-chain detail (busy L1s, mid L1s, ZK) collapses to the default.
// Any chain not listed falls in the DEFAULT bucket ($0.50 deposit /
// $0.25 claim). Every chain on the current board is covered by the table
// or the default.
//
// ── The full-plan budget ─────────────────────────────────────────────────
// The radar-5 plan priced deposit gas + claim gas on the main chain only.
// A real farm pays more than that, so radar-6 prices the whole plan:
//   amortised on-ramp  $0.90 — on-ramp $1.00 + first bridge $3.50, spread
//                       over five farms ($4.50 / 5); charged on every row.
//   second chain       $1.00 bridge + the second chain's deposit gas, when
//                       the protocol runs on more than one chain. The
//                       deposit is SPLIT across the chains, never deployed
//                       in full on each — a second chain costs a bridge
//                       and gas, not a second deposit.
//   deposit gas        the main chain's deposit gas.
//   weekly check-in    $0.10 a week, ceil(hold_days / 7) weeks.
//   claim gas          the main chain's claim gas x min(nchains, 2).
//   withdraw gas       the main chain's deposit gas + the second chain's
//                       deposit gas when there is one.
//   swap cost          0.15% of the deposit (0.05% fee + 0.1% slippage)
//                       for swap categories (dex, swap, amm, stak, restak,
//                       perpetual, derivative, options), else $0.
//   opportunity        deposit x max(0, TBILL_RATE - position_yield)
//                       x hold_days / 365 — the deposit could otherwise
//                       earn the 3-month T-bill rate, 4.16% (19 Nov 2026);
//                       a position that yields more than the bill (an LP
//                       at 5%) costs no opportunity, and the model does not
//                       credit the gain above the bill either.
// Position yields: a DEX / LP position yields 5%, a vault / lending /
// staking / RWA / index position yields 4%, anything else yields 0%.
// gas_usd is the full-plan step-cost total (fixed + swap at the sized
// deposit); costs = gas_usd + opportunity.
//
// ── Deposit sizing (the 2x-cover rule) ───────────────────────────────────
// The deposit is sized per row so the EXPECTED gross covers the full-plan
// costs twice, with a $50 floor and a $10,000 cap:
//   gross_rate = (expected_value_usd / tvl_usd) x AIRDROP_SHARE x 3
//   required   = ceil(2 x costs($50) / gross_rate)
//   deposit    = clamp(required, $50, $10,000)
//   costs are then recomputed once at the chosen deposit.
// The x3 is the activity multiplier: a dedicated farmer earns about three
// times the capital-pro-rata share of an airdrop (the median airdrop
// payout is ~$1,000 against a $0.35 pro-rata share on a $5,000 deposit,
// so x3 is conservative). When the required deposit exceeds the $10,000
// cap, deposit_needed_usd records it and the row stays SKIP/THIN on the
// numbers — the plan never manufactures a FARM by shrinking the deposit.
// Top-by-value rows may stay SKIP with the deposit-needed reason shown.
//
// ── Net value ────────────────────────────────────────────────────────────
//   gross_p10_usd      = (deposit / tvl) x value_p10_usd x 0.10 x 3
//   gross_expected_usd = (deposit / tvl) x value_expected_usd x 0.10 x 3
//   AIRDROP_SHARE = 0.10 — an explicit assumption, surfaced on the page:
//   10% of the implied launch value is assumed to reach farmers (the rest
//   goes to the team, investors, the treasury and everyone else the launch
//   pays). It is a guess, stated as one, not a measurement.
//   net = gross - costs. Money outputs are whole dollars, except gas_usd
//   and the fixed-costs breakdown, which are exact to the cent so the
//   reader can check them; time outputs are whole minutes.
//
// ── Time model ───────────────────────────────────────────────────────────
//   setup: 5 min (fresh wallet) + 15 min (deposit) + 15 min (second-chain
//     step, when the protocol runs on more than one chain) or 10 min
//     (weekly action, single-chain) + 5 min (farm log) = 40 / 35 min.
//   claim: 10 min at the end. Verification (step 7): 10 min, one check.
//   weekly check-in: 10 min a week, ceil(hold_days / 7) weeks.
//   time_minutes = setup + claim + verification + weekly check-ins.
//   net_per_hour_usd = net / (time_minutes / 60), whole dollars.
// Hold length reuses the board's own rule (model.ts holdDaysFor): age
// unknown 45 days, under 180 days 60 days, under 365 days 45 days,
// 365 days or older 30 days.
//
// ── Verdicts (our rules, stated, not derived) ────────────────────────────
//   FARM  net > $50 AND net per hour > $5.
//   THIN  net > $0 (worth doing only if the hour is already spent).
//   SKIP  otherwise (net <= $0: the farm costs more than it pays).
// Two verdicts ship: `verdict` on the P10 net (the pessimistic case — a
// row that cannot clear $0 at P10 only pays in the good outcomes, and the
// board says so instead of selling the median outcome as the plan) and
// `verdict_expected` on the expected net. The board's headline stat counts
// FARM rows by the expected verdict.

/** Share of the implied launch value assumed to reach farmers. */
export const AIRDROP_SHARE = 0.1;

/** Risk-free rate used for the opportunity cost: the 3-month T-bill, 4.16% (19 Nov 2026). */
export const TBILL_RATE = 0.0416;

/** A dedicated farmer earns ~3x the capital-pro-rata share of an airdrop. */
export const ACTIVITY_MULTIPLIER = 3;

/** Deposit floor and cap for the participation minimum (the radar-5 gas rule). */
export const DEPOSIT_MIN_USD = 50;
export const DEPOSIT_MIN_CAP_USD = 250;
/** Gas must be at most this share of the participation-minimum deposit. */
export const MAX_GAS_SHARE = 0.1;
/** The sized deposit's cap, in USD: the 2x-cover sizing clamps to this range. */
export const SIZED_DEPOSIT_CAP_USD = 10000;

/** Verdict thresholds, in USD. */
export const FARM_MIN_NET_USD = 50;
export const FARM_MIN_PER_HOUR_USD = 5;

/** The dashboard controls' default plan capital: "does it pay at $1,000?" */
export const REFERENCE_CAPITAL_USD = 1000;

/** Weekly check-in time, in minutes, and the one-off verification time. */
export const WEEKLY_CHECK_MINUTES = 10;
export const VERIFY_MINUTES = 10;

/** Amortised on-ramp: $1.00 on-ramp + $3.50 first bridge, spread over 5 farms. */
export const AMORT_ONRAMP_USD = 0.9;
/** Flat bridge cost for the second chain. */
export const BRIDGE_USD = 1.0;
/** Weekly check-in gas, in USD. */
export const WEEKLY_GAS_USD = 0.1;
/** Swap cost for swap categories: 0.05% fee + 0.1% slippage, of the deposit. */
export const SWAP_RATE = 0.0015;

/** Categories whose position pays a swap cost (fee + slippage on entry). */
const SWAP_CATS = new Set(['dex', 'swap', 'amm', 'stak', 'restak', 'perpetual', 'derivative', 'options']);

/** Yield-bearing categories: vault, yield, lending, CDP, staking, RWA,
 * algo-stable, liquid staking, leveraged farm, allocator, curator, index,
 * stable — anything a farmer's deposit earns yield in. */
const YIELD_BEARING = ['vault', 'yield', 'lend', 'cdp', 'stak', 'restak', 'rwa', 'algo-stab', 'liquid staking', 'leveraged farm', 'allocator', 'curator', 'index', 'stable'];

/** One chain's gas: one deposit transaction and one claim transaction, USD. */
export interface ChainGas {
  deposit: number;
  claim: number;
}

/** Per-chain gas table (November 2026, farm-costs.md §2). */
export const GAS_TABLE: Record<string, ChainGas> = {
  Ethereum: { deposit: 2, claim: 1 },
  Tron: { deposit: 2, claim: 1 },
  Bitcoin: { deposit: 2, claim: 1 },
  Base: { deposit: 0.5, claim: 0.25 },
  Arbitrum: { deposit: 0.5, claim: 0.25 },
  Optimism: { deposit: 0.75, claim: 0.5 },
  Polygon: { deposit: 0.25, claim: 0.25 },
  Binance: { deposit: 0.5, claim: 0.25 },
  Solana: { deposit: 0.1, claim: 0.1 },
};

/** Gas for a chain the table does not list: the November 2026 default. */
export const DEFAULT_GAS: ChainGas = { deposit: 0.5, claim: 0.25 };

/** A row as costPlan needs it. */
export interface CostRow {
  tvl_usd: number;
  chains: string[];
  category: string | null;
  age_days: number | null;
  /** Carried for the dashboard; the arithmetic uses value_p10_usd, not this. */
  implied_value_usd: number;
  /** P10 of the implied launch value, supplied by the validation step. */
  value_p10_usd: number;
  /** Point-implied expected value (implied x odds), for the expected net. */
  value_expected_usd: number;
}

/** A row as farmSteps needs it. */
export interface FarmRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  age_days: number | null;
}

/** One row's costed plan, at the row's sized deposit. */
export interface CostPlan {
  /** The sized deposit: 2x-cover, clamped to [$50, $10,000]. */
  deposit_usd: number;
  /** The deposit floor ($50). */
  deposit_min_usd: number;
  /** The deposit the 2x-cover rule needs when it exceeds the $10,000 cap, else null. */
  deposit_needed_usd: number | null;
  /** Full-plan step costs at the sized deposit (fixed + swap), exact to the cent. */
  gas_usd: number;
  /** The deposit-independent part of gas_usd (amort + second + deposit + weekly + claim + withdraw). */
  fixed_costs_usd: number;
  /** The swap rate applied (0.0015 for swap categories, else 0). */
  swap_rate: number;
  /** The position's annual yield (0.05 LP, 0.04 yield-bearing, else 0). */
  position_yield: number;
  time_minutes: number;
  hold_days: number;
  gross_p10_usd: number;
  net_p10_usd: number;
  net_per_hour_usd: number;
  /** Gross at the point-implied expected value, same deposit and costs. */
  gross_expected_usd: number;
  net_expected_usd: number;
  net_expected_per_hour_usd: number;
  /** The P10 verdict: FARM > $50 and > $5/hr, else THIN > $0, else SKIP. */
  verdict: 'FARM' | 'THIN' | 'SKIP';
  /** The expected-net verdict, same thresholds on the expected net. */
  verdict_expected: 'FARM' | 'THIN' | 'SKIP';
}

/** The row's main chain: the first chain it names, or the default bucket. */
export function mainChain(chains: string[]): string {
  return chains.length > 0 ? chains[0]! : 'Ethereum';
}

/** Gas for one deposit tx and one claim tx on a chain, from the table. */
export function gasForChain(chain: string): ChainGas {
  return GAS_TABLE[chain] ?? DEFAULT_GAS;
}

/** How long to hold, from the protocol's age — the board's own rule. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The position's annual yield from its category: 5% for a DEX / LP
 * position, 4% for a yield-bearing one, 0% otherwise. */
export function positionYield(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('swap') || c.includes('amm') || c.includes('liquidity')) return 0.05;
  for (const k of YIELD_BEARING) if (c.includes(k)) return 0.04;
  return 0;
}

/** Whether the category pays the swap cost on entry. */
export function swapRateFor(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  for (const k of SWAP_CATS) if (c.includes(k)) return SWAP_RATE;
  return 0;
}

/** The full-plan step costs at a deposit, split into the deposit-independent
 * fixed part, the swap part, the opportunity cost and the total. */
export function fullPlanCosts(row: CostRow, deposit: number): { fixed: number; swap: number; opportunity: number; total: number } {
  const chain = mainChain(row.chains);
  const secondChain = row.chains.length > 1 ? row.chains[1]! : null;
  const mainGas = gasForChain(chain);
  const hold = holdDaysFor(row.age_days);
  const weeks = Math.ceil(hold / 7);
  const second = secondChain === null ? 0 : BRIDGE_USD + gasForChain(secondChain).deposit;
  const withdraw = mainGas.deposit + (secondChain === null ? 0 : gasForChain(secondChain).deposit);
  const fixed = Math.round((AMORT_ONRAMP_USD + second + mainGas.deposit + WEEKLY_GAS_USD * weeks + mainGas.claim * Math.min(row.chains.length, 2) + withdraw) * 100) / 100;
  const swap = Math.round(swapRateFor(row.category ?? null) * deposit * 100) / 100;
  const y = positionYield(row.category ?? null);
  const opportunity = Math.round(deposit * Math.max(0, TBILL_RATE - y) * (hold / 365) * 100) / 100;
  return { fixed, swap, opportunity, total: Math.round((fixed + swap + opportunity) * 100) / 100 };
}

/** The participation-minimum deposit (radar-5's gas rule): total main-chain
 * gas must be at most 10% of the deposit, floored at $50 and capped at
 * $250. With the November 2026 gas table the floor binds on every row
 * (the dearest main chain, Ethereum at $2 + $1, sizes only $30). */
export function depositFor(gasUsd: number): number {
  const sized = Math.ceil(gasUsd / MAX_GAS_SHARE);
  return Math.min(DEPOSIT_MIN_CAP_USD, Math.max(DEPOSIT_MIN_USD, sized));
}

/**
 * The deposit the 2x-cover rule needs: the deposit at which the expected
 * gross (value x share x 3) covers the full-plan costs twice. Returns the
 * unclamped requirement, or null when the row has no positive gross rate
 * (no deposit can cover its costs).
 */
export function requiredDeposit(row: CostRow): number | null {
  const grossRate = row.tvl_usd > 0 && row.value_expected_usd > 0
    ? (row.value_expected_usd / row.tvl_usd) * AIRDROP_SHARE * ACTIVITY_MULTIPLIER
    : 0;
  if (grossRate <= 0) return null;
  const start = depositFor(gasForChain(mainChain(row.chains)).deposit + gasForChain(mainChain(row.chains)).claim);
  return Math.ceil((2 * fullPlanCosts(row, start).total) / grossRate);
}

/**
 * One row's costed plan, sized by the 2x-cover rule: start at the $50
 * minimum, compute the full-plan costs, take the deposit that covers them
 * twice, clamp it to [$50, $10,000], recompute the costs once at the
 * chosen deposit. The verdicts are the P10 verdict and the expected-net
 * verdict at that deposit. Pass { deposit_usd } to cost the plan at a
 * fixed deposit instead (the sizing requirement is still reported).
 */
export function costPlan(row: CostRow, opts: { deposit_usd?: number } = {}): CostPlan {
  const hold = holdDaysFor(row.age_days);
  const gas = gasForChain(mainChain(row.chains));
  const depositMin = depositFor(gas.deposit + gas.claim);
  const required = requiredDeposit(row);
  const deposit = opts.deposit_usd !== undefined
    ? Math.min(SIZED_DEPOSIT_CAP_USD, Math.max(DEPOSIT_MIN_USD, opts.deposit_usd))
    : required === null
      ? SIZED_DEPOSIT_CAP_USD
      : Math.min(SIZED_DEPOSIT_CAP_USD, Math.max(depositMin, required));
  const costs = fullPlanCosts(row, deposit);
  const gasUsd = Math.round((costs.fixed + costs.swap) * 100) / 100;
  const grossRate = (v: number): number => (row.tvl_usd > 0 && v > 0 ? (deposit / row.tvl_usd) * v * AIRDROP_SHARE * ACTIVITY_MULTIPLIER : 0);
  const grossP10 = Math.round(grossRate(row.value_p10_usd));
  const grossExp = Math.round(grossRate(row.value_expected_usd));
  const netP10 = Math.round(grossP10 - costs.total);
  const netExp = Math.round(grossExp - costs.total);
  const weeks = Math.ceil(hold / 7);
  const setupMinutes = 5 + 15 + (row.chains.length > 1 ? 15 : 10) + 5;
  const timeMinutes = setupMinutes + 10 + VERIFY_MINUTES + weeks * WEEKLY_CHECK_MINUTES;
  const perHourP10 = Math.round(netP10 / (timeMinutes / 60));
  const perHourExp = Math.round(netExp / (timeMinutes / 60));
  const verdictOf = (net: number, perHour: number): CostPlan['verdict'] =>
    net > FARM_MIN_NET_USD && perHour > FARM_MIN_PER_HOUR_USD ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  return {
    deposit_usd: deposit,
    deposit_min_usd: depositMin,
    deposit_needed_usd: required !== null && required > SIZED_DEPOSIT_CAP_USD ? required : null,
    gas_usd: gasUsd,
    fixed_costs_usd: costs.fixed,
    swap_rate: swapRateFor(row.category ?? null),
    position_yield: positionYield(row.category ?? null),
    time_minutes: timeMinutes,
    hold_days: hold,
    gross_p10_usd: grossP10,
    net_p10_usd: netP10,
    net_per_hour_usd: perHourP10,
    gross_expected_usd: grossExp,
    net_expected_usd: netExp,
    net_expected_per_hour_usd: perHourExp,
    verdict: verdictOf(netP10, perHourP10),
    verdict_expected: verdictOf(netExp, perHourExp),
  };
}

/** $1.2B, $350M, $75.4M, $12,345 — the short form farm steps quote. */
export function shortUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${trim1(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `$${trim1(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${trim1(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function trim1(n: number): string {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Gas as a step states it: "$15", "$1", "$0.20" (callers add "of gas"). */
function gasText(n: number): string {
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(row: FarmRow, capital: number, chain: string): string {
  const c = (row.category ?? '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the position open.`;
  }
  if (c.includes('dex') || c.includes('swap')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('allocator') || c.includes('curator')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} and place one position in an active market on ${chain}.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} through ${name} and hold it.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('payment')) {
    return `Route a $${capital} payment through ${name} on ${chain} and keep the receipt.`;
  }
  if (c.includes('privacy')) {
    return `Deposit $${capital} into ${name}'s privacy pool on ${chain} and hold the note until you withdraw.`;
  }
  if (c.includes('launchpad')) {
    return `Commit $${capital} to the next sale on ${name} on ${chain} and complete its allocation steps.`;
  }
  if (c.includes('index')) {
    return `Deposit $${capital} into ${name}'s index vault on ${chain} and keep the shares.`;
  }
  if (c.includes('governance')) {
    return `Deposit $${capital} into ${name}'s governance vault on ${chain} and vote on its next proposal.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time, every value from the protocol's own record — slug, name, category,
 * chains, TVL and age — plus its costed plan. No step is written for a
 * named protocol: the templates take the row's values as arguments. Step 2
 * quotes the plan's SIZED deposit (not the $50 minimum) and the budget
 * line (deposit + gas + time + hold); step 3 splits the deposit across a
 * second chain when there is one; step 7 verifies the plan against the
 * dashboard, naming the expected and P10 nets and, when the 2x-cover
 * deposit exceeds the $10,000 cap, the deposit the row actually needs.
 */
export function farmSteps(row: FarmRow, plan: CostPlan): string[] {
  const chain = mainChain(row.chains);
  const gas = gasForChain(chain);
  const hold = plan.hold_days;
  const capital = plan.deposit_usd;
  const action = actionFor(row, capital, chain);
  const secondChain = row.chains.length > 1 ? row.chains[1]! : null;
  const ageText =
    row.age_days === null
      ? `its listing date is not in the snapshot, so the full ${hold}-day hold applies`
      : `listed ${row.age_days} days ago`;
  const reconsider = shortUsd(Math.round(row.tvl_usd / 2));
  const claimEach = gas.claim;
  const claimChains = Math.min(row.chains.length, 2);
  const claimTotal = Math.round(claimEach * claimChains * 100) / 100;
  const step3 =
    secondChain !== null
      ? `Repeat the position on ${secondChain} too, splitting the $${capital} deposit across the two chains — do not deploy the full deposit on each chain. A bridge costs ${gasText(BRIDGE_USD)} plus ${gasText(gasForChain(secondChain).deposit)} of deposit gas on ${secondChain}. Time: 15 minutes to set up.`
      : `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote, so the wallet stays active. Cost: ${gasText(gas.claim)} of gas a week. Time: 10 minutes a week.`;
  const budget = `Budget: $${capital} deposit + ${gasText(plan.gas_usd)} gas + ${plan.time_minutes} min over ${hold} days — expected net $${plan.net_expected_usd} ($${plan.net_expected_per_hour_usd}/hr), P10 net $${plan.net_p10_usd}. Verdict ${plan.verdict_expected} on the expected net.`;
  const step7 =
    plan.deposit_needed_usd !== null
      ? `Check the position on the ${chain} explorer: the protocol holds ${shortUsd(row.tvl_usd)} across ${row.chains.length} chain${row.chains.length === 1 ? '' : 's'} — if TVL falls below ${reconsider}, reconsider the position. The 2x-cover deposit is ${shortUsd(plan.deposit_needed_usd)}, above the $10,000 cap, so this row stays ${plan.verdict_expected} at the capped $${capital}. Cost: nothing but the check. Time: 10 minutes.`
      : `Check the position on the ${chain} explorer: the protocol holds ${shortUsd(row.tvl_usd)} across ${row.chains.length} chain${row.chains.length === 1 ? '' : 's'} — if TVL falls below ${reconsider}, reconsider the position. Expected net $${plan.net_expected_usd} at the $${capital} deposit, P10 net $${plan.net_p10_usd}; verdict ${plan.verdict_expected}. Cost: nothing but the check. Time: 10 minutes.`;
  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. On-ramping costs $1.00 plus a first bridge of $3.50, shared across five farms ($0.90 here). Cost: $0.90 of the plan's gas. Time: 5 minutes.`,
    `${action} ${budget} Cost: $${capital} of capital and ${gasText(gas.deposit)} of gas. Time: 15 minutes to set up.`,
    step3,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot — ${ageText}. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; a claim costs about ${gasText(claimEach)} of gas per chain (${gasText(claimTotal)} across ${claimChains} chain${claimChains === 1 ? '' : 's'}), so never pay a third party to claim for you. Cost: ${gasText(claimTotal)} of gas to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction hash in a farm log under the slug "${row.slug}" so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
    step7,
  ];
}
