// Token radar: costed farm plans (farm.ts).
//
// Pure functions, deterministic: no clock, no randomness, no network.
// Self-contained on purpose — it duplicates the two tiny helpers it needs
// (shortUsd, holdDaysFor, the category action) instead of importing from
// model.ts, so the integration step can wire it in without merge conflicts.
//
// ── Gas table: what it is and what it is not ─────────────────────────────
// The per-chain deposit/claim figures below are TYPICAL-GAS OPERATIONAL
// ESTIMATES, NOT snapshot figures and NOT a quote for any moment: gas moves
// with congestion, and the reader can check any figure against a block
// explorer or a gas tracker before moving funds. They are one deposit
// transaction and one claim transaction on that chain, in USD, for a plain
// contract interaction at ordinary (not congested) gas. Chains are grouped
// by what that kind of transaction typically costs on them:
//   Ethereum        $10 / $5   — mainnet contract calls cost real money.
//   Bitcoin family  $3 / $2    — UTXO chains: a plain transfer-sized fee.
//   Busy EVM L1s    $2 / $1    — Avalanche, Tron, Fantom and the like.
//   Mid L1s / ZK    $1 / $1    — BNB Chain, Starknet, Linea, Scroll, zkSync.
//   L2s / cheap EVM $0.50/$0.50 — Base, Arbitrum, Optimism and most L2s.
//   Ultra-cheap     $0.10/$0.10 — Solana, Sui, Aptos, Stellar and the like.
// Any chain not listed falls in the DEFAULT bucket ($1 deposit / $1 claim),
// which is the mid-L1 figure. Every chain on the current board is listed
// explicitly below, so the default only covers chains a future snapshot
// might add.
//
// ── Deposit sizing (minimum viable capital) ──────────────────────────────
// The deposit is a function of the row's MAIN chain gas only (chains[0]):
//   deposit_usd = clamp(ceil(total_gas / 0.10), $50, $250)
// i.e. total gas (deposit + claim on the main chain) must be at most 10%
// of the deposit, with a $50 floor and a $250 cap. The floor binds on every
// cheap chain (gas of $1 needs only a $10 deposit, so the $50 floor rules);
// the cap binds only if main-chain gas ever exceeded $25, in which case
// gas would be more than 10% of the deposit and the plan says so by the
// numbers rather than by hiding it. On the current board only Ethereum
// rows ($15 gas) size above the floor, at $150.
//
// ── Net value at P10 ─────────────────────────────────────────────────────
//   gross_p10_usd = (deposit_usd / tvl_usd) x value_p10_usd x AIRDROP_SHARE
//   AIRDROP_SHARE = 0.10 — an explicit assumption, surfaced on the page:
//   10% of the implied launch value is assumed to reach farmers (the rest
//   goes to the team, investors, the treasury and everyone else the launch
//   pays). It is a guess, stated as one, not a measurement.
//   costs = gas (deposit + claim on the main chain) + opportunity cost,
//   where opportunity cost = deposit x 0.04 x hold_days / 365 — the 4%
//   T-bill rate, stated: the deposit could otherwise earn ~4% a year.
//   net_p10_usd = gross_p10_usd - costs.
// Money outputs are whole dollars, except gas_usd which is the exact table
// sum (whole dollars or $0.20 steps) so the reader can check it; time
// outputs are whole minutes.
//
// ── Time model ───────────────────────────────────────────────────────────
//   setup: 5 min (fresh wallet) + 15 min (deposit) + 15 min (second-chain
//     step, when the protocol runs on more than one chain) or 10 min
//     (weekly action, single-chain) + 5 min (farm log) = 40 / 35 min.
//   claim: 10 min at the end. Verification (step 7): 10 min, one check.
//   weekly check-in: 10 min a week, ceil(hold_days / 7) weeks.
//   time_minutes = setup + claim + verification + weekly check-ins.
//   net_per_hour_usd = net_p10_usd / (time_minutes / 60), whole dollars.
// Hold length reuses the board's own rule (model.ts holdDaysFor): age
// unknown 45 days, under 180 days 60 days, under 365 days 45 days,
// 365 days or older 30 days.
//
// ── Verdicts (our rules, stated, not derived) ────────────────────────────
//   FARM  net_p10_usd > $50 AND net_per_hour_usd > $5.
//   THIN  net_p10_usd > $0 (worth doing only if the hour is already spent).
//   SKIP  otherwise (net_p10_usd <= $0: the farm costs more than P10 pays).
// The verdict is evaluated at REFERENCE_CAPITAL_USD ($1,000), a stated
// reference capital — not at the deposit rule's $50 minimum, where the
// gross is twenty times smaller while gas barely moves and nearly every
// row reads SKIP. The farm steps keep the minimum deposit, which is what
// you need to participate; the verdict answers "does it pay at $1,000?".
// P10 is the pessimistic case by design: a row that cannot clear $0 at P10
// is a row whose farm only pays in the good outcomes, and the board says
// so instead of selling the median outcome as the plan.

/** Share of the implied launch value assumed to reach farmers. */
export const AIRDROP_SHARE = 0.1;

/** Risk-free rate used for the opportunity cost of the deposit. */
export const TBILL_RATE = 0.04;

/** Gas must be at most this share of the deposit. */
export const MAX_GAS_SHARE = 0.1;

/** Deposit floor and cap, in USD. */
export const DEPOSIT_FLOOR_USD = 50;
export const DEPOSIT_CAP_USD = 250;

/** Verdict thresholds, in USD. */
export const FARM_MIN_NET_USD = 50;
export const FARM_MIN_PER_HOUR_USD = 5;

/** Reference capital the verdict is evaluated at: "does it pay at $1,000?" */
export const REFERENCE_CAPITAL_USD = 1000;

/** Weekly check-in time, in minutes, and the one-off verification time. */
export const WEEKLY_CHECK_MINUTES = 10;
export const VERIFY_MINUTES = 10;

/** One chain's gas: one deposit transaction and one claim transaction, USD. */
export interface ChainGas {
  deposit: number;
  claim: number;
}

/** Per-chain gas table: one deposit tx and one claim tx, in USD. See header. */
export const GAS_TABLE: Record<string, ChainGas> = {
  // Ethereum mainnet: contract calls cost real money.
  Ethereum: { deposit: 10, claim: 5 },
  // Bitcoin family (UTXO chains).
  Bitcoin: { deposit: 3, claim: 2 },
  Litecoin: { deposit: 3, claim: 2 },
  Doge: { deposit: 3, claim: 2 },
  Zcash: { deposit: 3, claim: 2 },
  // Busy EVM L1s.
  Avalanche: { deposit: 2, claim: 1 },
  Tron: { deposit: 2, claim: 1 },
  Fantom: { deposit: 2, claim: 1 },
  Cronos: { deposit: 2, claim: 1 },
  Kava: { deposit: 2, claim: 1 },
  Klaytn: { deposit: 2, claim: 1 },
  Evmos: { deposit: 2, claim: 1 },
  ThunderCore: { deposit: 2, claim: 1 },
  Pulse: { deposit: 2, claim: 1 },
  RSK: { deposit: 2, claim: 1 },
  Celo: { deposit: 2, claim: 1 },
  Astar: { deposit: 2, claim: 1 },
  Moonbeam: { deposit: 2, claim: 1 },
  Metis: { deposit: 2, claim: 1 },
  Filecoin: { deposit: 2, claim: 1 },
  Bittensor: { deposit: 2, claim: 1 },
  'Bittensor EVM': { deposit: 2, claim: 1 },
  Cardano: { deposit: 2, claim: 1 },
  Stacks: { deposit: 2, claim: 1 },
  Qubic: { deposit: 2, claim: 1 },
  Canton: { deposit: 2, claim: 1 },
  Strato: { deposit: 2, claim: 1 },
  Goat: { deposit: 2, claim: 1 },
  HeLa: { deposit: 2, claim: 1 },
  Rayls: { deposit: 2, claim: 1 },
  Hibachi: { deposit: 2, claim: 1 },
  'Elysium Kinetiq': { deposit: 2, claim: 1 },
  'BOT Chain': { deposit: 2, claim: 1 },
  Provenance: { deposit: 2, claim: 1 },
  'Babylon Genesis': { deposit: 2, claim: 1 },
  Aleo: { deposit: 2, claim: 1 },
  // Mid L1s and ZK rollups.
  Binance: { deposit: 1, claim: 1 },
  Starknet: { deposit: 1, claim: 1 },
  Linea: { deposit: 1, claim: 1 },
  Scroll: { deposit: 1, claim: 1 },
  'zkSync Era': { deposit: 1, claim: 1 },
  'Polygon zkEVM': { deposit: 1, claim: 1 },
  ZetaChain: { deposit: 1, claim: 1 },
  Telos: { deposit: 1, claim: 1 },
  Manta: { deposit: 1, claim: 1 },
  Mode: { deposit: 1, claim: 1 },
  CORE: { deposit: 1, claim: 1 },
  // L2s and cheap EVM chains.
  Base: { deposit: 0.5, claim: 0.5 },
  Arbitrum: { deposit: 0.5, claim: 0.5 },
  Optimism: { deposit: 0.5, claim: 0.5 },
  Polygon: { deposit: 0.5, claim: 0.5 },
  Unichain: { deposit: 0.5, claim: 0.5 },
  Ink: { deposit: 0.5, claim: 0.5 },
  Katana: { deposit: 0.5, claim: 0.5 },
  Mantle: { deposit: 0.5, claim: 0.5 },
  Blast: { deposit: 0.5, claim: 0.5 },
  Soneium: { deposit: 0.5, claim: 0.5 },
  'World Chain': { deposit: 0.5, claim: 0.5 },
  Op_Bnb: { deposit: 0.5, claim: 0.5 },
  Lisk: { deposit: 0.5, claim: 0.5 },
  Taiko: { deposit: 0.5, claim: 0.5 },
  Zircuit: { deposit: 0.5, claim: 0.5 },
  Fraxtal: { deposit: 0.5, claim: 0.5 },
  ApeChain: { deposit: 0.5, claim: 0.5 },
  MetalL2: { deposit: 0.5, claim: 0.5 },
  Morph: { deposit: 0.5, claim: 0.5 },
  BOB: { deposit: 0.5, claim: 0.5 },
  Citrea: { deposit: 0.5, claim: 0.5 },
  BSquared: { deposit: 0.5, claim: 0.5 },
  Fluent: { deposit: 0.5, claim: 0.5 },
  Pharos: { deposit: 0.5, claim: 0.5 },
  MegaETH: { deposit: 0.5, claim: 0.5 },
  RISE: { deposit: 0.5, claim: 0.5 },
  Tempo: { deposit: 0.5, claim: 0.5 },
  Stable: { deposit: 0.5, claim: 0.5 },
  Arc: { deposit: 0.5, claim: 0.5 },
  'Robinhood Chain': { deposit: 0.5, claim: 0.5 },
  Plume: { deposit: 0.5, claim: 0.5 },
  'Plume Mainnet': { deposit: 0.5, claim: 0.5 },
  Sonic: { deposit: 0.5, claim: 0.5 },
  Berachain: { deposit: 0.5, claim: 0.5 },
  Monad: { deposit: 0.5, claim: 0.5 },
  'Hyperliquid L1': { deposit: 0.5, claim: 0.5 },
  Plasma: { deposit: 0.5, claim: 0.5 },
  Hemi: { deposit: 0.5, claim: 0.5 },
  TAC: { deposit: 0.5, claim: 0.5 },
  Flare: { deposit: 0.5, claim: 0.5 },
  Etherlink: { deposit: 0.5, claim: 0.5 },
  Sophon: { deposit: 0.5, claim: 0.5 },
  Mezo: { deposit: 0.5, claim: 0.5 },
  Nibiru: { deposit: 0.5, claim: 0.5 },
  'Reya Network': { deposit: 0.5, claim: 0.5 },
  zkLink: { deposit: 0.5, claim: 0.5 },
  'Bifrost Network': { deposit: 0.5, claim: 0.5 },
  Saga: { deposit: 0.5, claim: 0.5 },
  Ronin: { deposit: 0.5, claim: 0.5 },
  'X Layer': { deposit: 0.5, claim: 0.5 },
  Corn: { deposit: 0.5, claim: 0.5 },
  Swellchain: { deposit: 0.5, claim: 0.5 },
  Proton: { deposit: 0.5, claim: 0.5 },
  // Ultra-cheap chains: a transaction costs cents.
  Solana: { deposit: 0.1, claim: 0.1 },
  Sui: { deposit: 0.1, claim: 0.1 },
  Aptos: { deposit: 0.1, claim: 0.1 },
  Near: { deposit: 0.1, claim: 0.1 },
  Stellar: { deposit: 0.1, claim: 0.1 },
  Ripple: { deposit: 0.1, claim: 0.1 },
  Algorand: { deposit: 0.1, claim: 0.1 },
  Sei: { deposit: 0.1, claim: 0.1 },
  XION: { deposit: 0.1, claim: 0.1 },
  Noble: { deposit: 0.1, claim: 0.1 },
  Flow: { deposit: 0.1, claim: 0.1 },
  Peaq: { deposit: 0.1, claim: 0.1 },
  'XRPL EVM': { deposit: 0.1, claim: 0.1 },
  ZIGChain: { deposit: 0.1, claim: 0.1 },
  Story: { deposit: 0.1, claim: 0.1 },
};

/** Gas for a chain the table does not list: the mid-L1 figure. */
export const DEFAULT_GAS: ChainGas = { deposit: 1, claim: 1 };

/** A row as costPlan needs it. */
export interface CostRow {
  tvl_usd: number;
  chains: string[];
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

/** One row's costed plan. */
export interface CostPlan {
  deposit_usd: number;
  gas_usd: number;
  time_minutes: number;
  hold_days: number;
  gross_p10_usd: number;
  net_p10_usd: number;
  net_per_hour_usd: number;
  /** Net at the point-implied expected value, same deposit and costs. */
  net_expected_usd: number;
  net_expected_per_hour_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
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

/**
 * The deposit that keeps total main-chain gas at or under 10% of it,
 * floored at $50 and capped at $250.
 */
export function depositFor(gasUsd: number): number {
  const sized = Math.ceil(gasUsd / MAX_GAS_SHARE);
  return Math.min(DEPOSIT_CAP_USD, Math.max(DEPOSIT_FLOOR_USD, sized));
}

/**
 * One row's costed plan at P10. value_p10_usd comes from the validation
 * step; everything else is the row's own record plus the stated rules.
 *
 * The verdict is evaluated at REFERENCE_CAPITAL_USD ($1,000), not at the
 * deposit rule's $50 minimum: at the minimum the gross is twenty times
 * smaller while gas barely moves, so nearly every row reads SKIP and the
 * verdict column says nothing. Pass { deposit_usd } to cost the plan at
 * another capital; the farm steps keep the deposit rule's minimum, which
 * is what you need to participate. net_expected_usd prices the same plan
 * at the point-implied expected value instead of P10, at the same deposit.
 */
export function costPlan(row: CostRow, opts: { deposit_usd?: number } = {}): CostPlan {
  const chain = mainChain(row.chains);
  const gas = gasForChain(chain);
  const gasUsd = Math.round((gas.deposit + gas.claim) * 100) / 100;
  const deposit = opts.deposit_usd ?? depositFor(gasUsd);
  const hold = holdDaysFor(row.age_days);
  const gross =
    row.tvl_usd > 0 && row.value_p10_usd > 0
      ? Math.round((deposit / row.tvl_usd) * row.value_p10_usd * AIRDROP_SHARE)
      : 0;
  const opportunity = Math.round((deposit * TBILL_RATE * hold) / 365);
  const net = Math.round(gross - gasUsd - opportunity);
  const weeks = Math.ceil(hold / 7);
  const setupMinutes = 5 + 15 + (row.chains.length > 1 ? 15 : 10) + 5;
  const timeMinutes = setupMinutes + 10 + VERIFY_MINUTES + weeks * WEEKLY_CHECK_MINUTES;
  const perHour = Math.round(net / (timeMinutes / 60));
  const grossExpected =
    row.tvl_usd > 0 && row.value_expected_usd > 0
      ? Math.round((deposit / row.tvl_usd) * row.value_expected_usd * AIRDROP_SHARE)
      : 0;
  const netExpected = Math.round(grossExpected - gasUsd - opportunity);
  const perHourExpected = Math.round(netExpected / (timeMinutes / 60));
  const verdict: CostPlan['verdict'] =
    net > FARM_MIN_NET_USD && perHour > FARM_MIN_PER_HOUR_USD ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  return {
    deposit_usd: deposit,
    gas_usd: gasUsd,
    time_minutes: timeMinutes,
    hold_days: hold,
    gross_p10_usd: gross,
    net_p10_usd: net,
    net_per_hour_usd: perHour,
    net_expected_usd: netExpected,
    net_expected_per_hour_usd: perHourExpected,
    verdict,
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
 * chains, TVL and age. No step is written for a named protocol: the
 * templates take the row's values as arguments. Steps 1–3 are the board's
 * existing plan (fresh wallet, category action, second chain); steps 4–6
 * now carry the row's own values (hold cites its age, claim names its main
 * chain and gas, the log records its slug); step 7 is new — a
 * protocol-specific verification step naming the main chain, the TVL and
 * the TVL level below which the position should be reconsidered (half the
 * current TVL).
 */
export function farmSteps(row: FarmRow): string[] {
  const chain = mainChain(row.chains);
  const gas = gasForChain(chain);
  const gasUsd = Math.round((gas.deposit + gas.claim) * 100) / 100;
  const capital = depositFor(gasUsd);
  const hold = holdDaysFor(row.age_days);
  const action = actionFor(row, capital, chain);
  const secondChain = row.chains.length > 1 ? row.chains[1]! : null;
  const ageText =
    row.age_days === null
      ? `its listing date is not in the snapshot, so the full ${hold}-day hold applies`
      : `listed ${row.age_days} days ago`;
  const reconsider = shortUsd(Math.round(row.tvl_usd / 2));
  const step3 =
    secondChain !== null
      ? `Repeat the position on ${secondChain} too: ${row.name} runs on ${row.chains.length} chains and holds ${shortUsd(row.tvl_usd)} in TVL, so activity on a second chain counts separately. Cost: $${capital} of capital and ${gasText(gas.deposit)} of gas. Time: 15 minutes to set up.`
      : `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote, so the wallet stays active. Cost: ${gasText(gas.claim)} of gas a week. Time: 10 minutes a week.`;
  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: ${gasText(gas.deposit)} of gas. Time: 5 minutes.`,
    `${action} Cost: $${capital} of capital and ${gasText(gas.deposit)} of gas. Time: 15 minutes to set up.`,
    step3,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot — ${ageText}. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; a claim on ${chain} costs about ${gasText(gas.claim)} of gas, so never pay a third party to claim for you. Cost: ${gasText(gas.claim)} of gas to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction hash in a farm log under the slug "${row.slug}" so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
    `Check the position on the ${chain} explorer: the protocol holds ${shortUsd(row.tvl_usd)} across ${row.chains.length} chain${row.chains.length === 1 ? '' : 's'} — if TVL falls below ${reconsider}, reconsider the position. Cost: nothing but the check. Time: 10 minutes.`,
  ];
}
