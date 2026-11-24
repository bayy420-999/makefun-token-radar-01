// Token radar: the value model and the board it builds. The entry reads one
// sealed DefiLlama snapshot and ranks the protocols that record no token by
// an implied launch value, computed from the snapshot's own figures; no
// protocol name is ever special-cased, and the same function scores every row.
//
// THE MODEL (defended in MODEL.md). radar-5: a log-log curve fitted by
// ordinary least squares on the snapshot's 128 tokenized comps, on every
// run — never hardcoded coefficients:
//
//   log(mcap) = a + b·log(TVL)
//   implied   = TVL x curveMultiple, curveMultiple = exp(a + (b-1)·log(TVL))
//
// The slope is below 1 (0.52 on this snapshot), so a bigger TVL is priced
// at a lower multiple: the market pays relatively less per TVL dollar as
// protocols grow. The leave-one-out test on the 128 comps (see
// buildValidation) says the curve beats the flat global median by 33% and
// the radar-4 category medians by 39%; growth, maturity, category residual
// factors and the chain factor were all tested on top of the curve and
// dropped — none improves the median miss. The dropped terms survive in
// MODEL only as the constants that switch them off (growth_weight 0,
// maturity 1.00 flat), and every row still reports the three factors, so
// anyone multiplying the reported factors by the TVL reproduces the
// implied value exactly. The curve multiple is reported as peer_multiple
// (the row's multiple at its own TVL); the fitted coefficients ship in
// data.js as loglog, so the dashboard recomputes the multiple from the
// curve rather than trusting the shipped figure.
//
//   odds          P(token recorded) for the protocol's category x age
//                 cohort, shrunk toward the age-bucket rate (k=5). Display
//                 and second sort only; the board ranks by implied value.
//   p10/p90       Implied value x the 10th/90th percentiles of the
//                 leave-one-out log residuals (per-category where a
//                 category has >= 10 comps, else global).
//
// A protocol is pre-token when its record carries no token at all: mcap,
// gecko_id and symbol all null. Protocols whose token already trades are
// never ranked; they are set aside as the live set, shown at the market's
// own value (their mcap). The board covers every watchlist slug (the floor,
// never the ceiling) and adds up to 160 pre-token protocols outside the
// watchlist that pass the eligibility test below — the snapshot's own
// watchlist rule, applied to every board candidate alike. Coverage is full:
// the early board took below-floor protocols only, which left 20 above-floor
// protocols that pass the same test unranked. Every snapshot-testable
// hypothesis for why the house watchlist omits those 20 fails (category,
// version, name, exchange-name beginning, parent-name linkage,
// duplication), so no figure in the snapshot distinguishes them from the
// rows already ranked — and no figure sets a haircut for them either, so
// they rank at the same curve value as every other row, no discount. The
// one same-family signal, Solv Strategies sharing its first word with two
// tokenized Solv protocols, also flags six rows already on the board at
// full value, so a sibling haircut would have to apply to those too; the
// rule stays uniform: same test, same value. The estimator is unchanged
// (same log-log curve, same validation numbers), so the version stays
// radar-5; only the board's coverage changed.

import { REFERENCE_CAPITAL_USD, costPlan, farmSteps as costedFarmSteps } from './farm.ts';
import type { CostPlan } from './farm.ts';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  /** Tokenized peers needed before a category earns its own multiple. */
  min_category_peers: number;
  /** Growth is clamped to this many per cent below zero. */
  growth_floor_pct: number;
  /** Growth is clamped to this many per cent above zero. */
  growth_cap_pct: number;
  /** How much of the (clamped) weekly move reaches the value. */
  growth_weight: number;
  /** Maturity factor at age zero. */
  maturity_floor: number;
  /** Maturity factor's rise from age zero to maturity_days. */
  maturity_range: number;
  /** Age in days at which the maturity factor stops rising. */
  maturity_days: number;
}

export const MODEL: ModelConstants = {
  min_category_peers: 3,
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  // radar-5: the LOO test dropped growth (weight 0) and maturity (1.00 flat),
  // and the peer multiples are replaced by the fitted log-log curve.
  growth_weight: 0,
  maturity_floor: 1,
  maturity_range: 0,
  maturity_days: 1095,
};

export const MODEL_VERSION = 'radar-5';

/** Cap on ranked rows outside the watchlist (157 on this snapshot: not binding). */
export const MAX_NON_WATCHLIST_ROWS = 160;

export const LIVE_ROWS = 24;

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  odds: number;
  expected_value_usd: number;
  p10_usd: number;
  p90_usd: number;
  /** P10 of the implied launch value, the farm plan's value input (== p10_usd). */
  value_p10_usd: number;
  /** The row's costed farm plan, verdict evaluated at the $1,000 reference capital. */
  cost_plan: CostPlan;
  model: {
    /** The fitted curve's multiple at this row's TVL (== the curve multiple). */
    peer_multiple: number;
    peer_category: string | null;
    /** Comps the fitted curve was estimated on (128 on this snapshot). */
    peer_count: number;
    peer_source: 'category' | 'global' | 'curve';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  odds: number;
  expected_value_usd: number;
  p10_usd: number;
  p90_usd: number;
  /** P10 of the implied launch value, the farm plan's value input (== p10_usd). */
  value_p10_usd: number;
  /** The row's costed farm plan, verdict evaluated at the $1,000 reference capital. */
  cost_plan: CostPlan;
  /** The total multiple: peer x growth x maturity, to 4 decimals. */
  multiple: number;
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  /** True when the slug is one of the snapshot's watchlist. */
  watchlist: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

export interface PeerEntry {
  category: string;
  multiple: number;
  peers: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  /** The model as one readable sentence, for the page's model panel. */
  model: string;
  model_constants: ModelConstants;
  model_version: string;
  /** The fitted log-log coefficients (intercept, slope), rounded to 4 decimals. */
  loglog: { intercept: number; slope: number };
  /** Reference capital the cost_plan verdicts are evaluated at ($1,000). */
  reference_capital_usd: number;
  watchlist_size: number;
  watchlist_count: number;
  board_size: number;
  outside_watchlist_size: number;
  live_size: number;
  global_peer_multiple: number;
  peers: PeerEntry[];
  rows: RadarRow[];
  /** Protocols whose token already trades (the dashboard's "traded" tab). */
  live: LiveRow[];
  traded: LiveRow[];
  /** The held-out tests behind the model, computed from the snapshot. */
  validation: Validation;
  /** 758 = ranked + traded-shown + set-aside pre-token + tokenized not shown. */
  accounting: Accounting;
}

/** One leave-one-out variant's median miss over the tokenized comps. */
export interface LooVariant { variant: string; median_fold_error: number; median_abs_log_error: number }

/** The validation block shipped in data.js: every number MODEL.md quotes. */
export interface Validation {
  loo_comps: number;
  loo: LooVariant[];
  time_split: { median_listed_at: string; older: number; newer: number; radar5_median_fold_error: number; peer_median_fold_error: number; radar3_median_fold_error: number; flat_median_fold_error: number; note: string };
  per_category: { category: string; comps: number; median_fold_error: number }[];
  decisions: { growth: string; maturity: string; chain_factor: string; peer_multiple: string };
  chain_test: { improvement_pct: number; monotone: boolean; adopted: boolean };
  coverage: { q10_factor: number; q90_factor: number; coverage_pct: number; covered: number; total: number; global_band_coverage_pct: number };
  odds: { k: number; brier_model: number; brier_base: number; improvement_pct: number; train: number; test: number; buckets: { bucket: string; n: number; token_rate: number }[] };
}

/** The full-758 accounting, every count computed from the snapshot. */
export interface Accounting {
  total: number; ranked: number; watchlist: number; outside_watchlist: number;
  traded_shown: number; tokenized_total: number; tokenized_not_shown: number; pre_token_total: number;
  set_aside_pre_token: { total: number; by_category_leg: number; by_version_leg: number; by_name_leg: number; rankable_not_chosen: number };
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Peer multiples from the snapshot alone: per-category median mcap/TVL over
 * tokenized protocols, plus the global median. A category earns its own
 * multiple only with >= min_category_peers tokenized peers; thinner ones
 * fall back to the global median, so one outlier can never set a price. */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, PeerEntry>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  all.sort((a, b) => a - b);
  const global = median(all);
  if (global === null) throw new SnapshotError('snapshot.json has no tokenized protocol to price TVL from');
  const out = new Map<string, PeerEntry>();
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    ratios.sort((a, b) => a - b);
    if (ratios.length >= model.min_category_peers) {
      out.set(category, { category, multiple: median(ratios)!, peers: ratios.length });
    }
  }
  return { byCategory: out, global };
}

export interface LogLogFit { intercept: number; slope: number; comps: number }

/** Closed-form OLS on log(mcap) ~ log(TVL) over the tokenized comps.
 * Coefficients are rounded to 4 decimals when shipped, and the board is
 * computed from the rounded values, so the dashboard reproduces the
 * implied value exactly from the shipped coefficients. */
export function fitLogLog(protocols: SnapshotProtocol[]): LogLogFit {
  const comps = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i]! - mx) ** 2; sxy += (xs[i]! - mx) * (ys[i]! - my); }
  const slope = sxy / sxx;
  return { intercept: round4(my - slope * mx), slope: round4(slope), comps: n };
}

/** The curve's multiple at a TVL: exp(a + (b-1)·ln(TVL)), to 4 decimals.
 * A TVL at or below zero has no log and no multiple (0, so the value
 * floors at $1); no protocol in this snapshot has one. */
export function curveMultiple(tvlUsd: number, loglog: { intercept: number; slope: number }): number {
  if (!(tvlUsd > 0)) return 0;
  return round4(Math.exp(loglog.intercept + (loglog.slope - 1) * Math.log(tvlUsd)));
}

/** OLS with an intercept plus extra regressors, by normal equations +
 * Gaussian elimination with partial pivoting. Small (<= 4 columns), exact,
 * deterministic — used only by the LOO variants that add terms to the curve. */
function olsMulti(rows: number[][], ys: number[]): number[] {
  const k = rows[0]!.length;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const v = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < k; j++) {
      v[j]! += rows[i]![j]! * ys[i]!;
      for (let c = 0; c < k; c++) A[j]![c]! += rows[i]![j]! * rows[i]![c]!;
    }
  }
  const M = A.map((r, i) => [...r, v[i]!]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col]![col]!;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / d;
      for (let c = col; c <= k; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((r, i) => r[k]! / r[i]!);
}

/** The three factors are rounded to 4 decimals BEFORE they are multiplied, and
 * the row reports the rounded factors, so the dashboard's recompute matches.
 * The value is the fitted curve's multiple at the row's TVL; growth and
 * maturity are priced at 1.00 (tested and dropped, see buildValidation). */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  loglog: LogLogFit,
  unknownAgeDays: number,
  model: ModelConstants = MODEL,
): { implied: number; peerMultiple: number; peerSource: 'curve'; peerCount: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const peerMultiple = curveMultiple(p.tvl_usd, loglog);
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, finite(p.change_7d, 0)));
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? unknownAgeDays;
  const maturityMult = round4(model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
  const implied = Math.max(1, Math.round(p.tvl_usd * peerMultiple * growthMult * maturityMult));
  return { implied, peerMultiple, peerSource: 'curve', peerCount: loglog.comps, growthPct, growthMult, maturityMult, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The wrapped, staked or bridged classes: a protocol in one of these categories
 * is a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name carrying one of these substrings marks a wrapped or staked product of
 * another token. Substrings, not whole words: "restaking" is not the whole word
 * "staking", and "stakee" is not the word "stake" — the whole-word test let both
 * through. Every name this flags was audited against its record first (MODEL.md). */
const WRAPPED_NAME = /(restak|stak|wrapped)/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol may join the board: pre-token, in none of the excluded categories,
 * not a versioned duplicate pool, and not named as a wrapped or staked product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)) && !VERSIONED.test(p.name) && !WRAPPED_NAME.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function medianPreTokenAge(snapshot: Snapshot): number {
  const ages = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  return median(ages) ?? 365;
}

/** radar-3 factors, for the LOO test only (radar-5 prices them at 1.00). */
const g3 = (p: SnapshotProtocol): number => round4(1 + (Math.min(100, Math.max(-50, finite(p.change_7d, 0))) / 100) * 0.5);
const m3 = (p: SnapshotProtocol, asOf: string, u: number): number => round4(0.7 + (0.3 * Math.min(Math.max(ageDays(asOf, p.listed_at) ?? u, 0), 1095)) / 1095);
/** The clamped weekly move as a fraction, and age as a 0..1 maturity fraction:
 * the regressors the log-log + growth / + maturity LOO variants fit. */
const growthFrac = (p: SnapshotProtocol): number => Math.min(100, Math.max(-50, finite(p.change_7d, 0))) / 100;
const maturityFrac = (p: SnapshotProtocol, asOf: string, u: number): number => Math.min(Math.max(ageDays(asOf, p.listed_at) ?? u, 0), 1095) / 1095;
const chainF = (chains: number): number => (chains < 1 ? 1 : Math.min(1.1, 1 + 0.03 * Math.log(chains)));

interface LooRow { slug: string; category: string | null; chains: number; actual: number; preds: number[] } // preds: [loglog, flat, peer, shrink6, loglogCat, loglogGrowth, radar3]

/** Leave-one-out predictions: each comp priced without itself in the fit. */
function looRows(s: Snapshot): LooRow[] {
  const comps = s.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const u = medianPreTokenAge(s);
  const ratios = (ps: SnapshotProtocol[]): number[] => ps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const pred = (tvl: number, ...ms: number[]): number => Math.max(1, Math.round(ms.reduce((v, m) => v * m, tvl)));
  const loglogPred = (tr: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const f = fitLogLog(tr);
    return Math.max(1, Math.round(Math.exp(f.intercept + f.slope * Math.log(p.tvl_usd))));
  };
  /** Log-log plus shrunk category mean log-residual factors (prior k=6,
   * factor capped to [0.4, 2.5]); residuals and factors come from the
   * training set only, never the held-out comp. */
  const loglogCatPred = (tr: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const f = fitLogLog(tr);
    const base = (q: SnapshotProtocol): number => Math.max(1, Math.round(Math.exp(f.intercept + f.slope * Math.log(q.tvl_usd))));
    const resid = new Map<string, { s: number; n: number }>();
    for (const q of tr) {
      if (q.category === null) continue;
      const e = resid.get(q.category) ?? { s: 0, n: 0 };
      e.s += Math.log(q.mcap_usd! / base(q));
      e.n += 1;
      resid.set(q.category, e);
    }
    let fac = 1;
    if (p.category !== null) {
      const e = resid.get(p.category);
      if (e !== undefined) fac = Math.min(2.5, Math.max(0.4, Math.exp(e.s / (e.n + 6))));
    }
    return Math.max(1, Math.round(base(p) * fac));
  };
  const loglogGrowthPred = (tr: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const beta = olsMulti(tr.map((q) => [1, Math.log(q.tvl_usd), growthFrac(q)]), tr.map((q) => Math.log(q.mcap_usd!)));
    return Math.max(1, Math.round(Math.exp(beta[0]! + beta[1]! * Math.log(p.tvl_usd) + beta[2]! * growthFrac(p))));
  };
  return comps.map((p) => {
    const o = comps.filter((q) => q.slug !== p.slug);
    const c = o.filter((q) => q.category !== null && q.category === p.category);
    const peer = round4(c.length >= MODEL.min_category_peers ? median(ratios(c))! : median(ratios(o))!);
    const glob = round4(median(ratios(o))!);
    const shrink6 = round4(c.length >= 1 ? (c.length * median(ratios(c))! + 6 * median(ratios(o))!) / (c.length + 6) : median(ratios(o))!);
    const g = g3(p);
    const m = m3(p, s.as_of, u);
    const t = p.tvl_usd;
    return { slug: p.slug, category: p.category, chains: p.chains.length, actual: p.mcap_usd!, preds: [loglogPred(o, p), pred(t, glob), pred(t, peer), pred(t, shrink6), loglogCatPred(o, p), loglogGrowthPred(o, p), pred(t, peer, g, m)] };
  });
}

const quantile = (s: number[], q: number): number => {
  if (s.length === 1) return s[0]!;
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
};

/** Age buckets for launch odds, in days; each cell shrinks (k=5) toward its bucket rate. */
const AGE_BUCKETS: { label: string; lo: number; hi: number }[] = [
  { label: '0-180d', lo: 0, hi: 180 }, { label: '181-365d', lo: 181, hi: 365 }, { label: '366-730d', lo: 366, hi: 730 },
  { label: '731-1095d', lo: 731, hi: 1095 }, { label: '>1095d', lo: 1096, hi: Infinity },
];

const ageBucket = (a: number | null): string | null => (a === null ? null : (AGE_BUCKETS.find((b) => a >= b.lo && a <= b.hi)?.label ?? null));

interface OddsBase { all: SnapshotProtocol[]; dated: SnapshotProtocol[]; buckets: { bucket: string; n: number; token_rate: number }[]; global: number }
const oddsBase = (ps: SnapshotProtocol[], asOf: string): OddsBase => {
  const dated = ps.filter((p) => ageDays(asOf, p.listed_at) !== null);
  const tok = (p: SnapshotProtocol): boolean => !isPreToken(p);
  const global = dated.filter(tok).length / dated.length;
  const buckets = AGE_BUCKETS.map((b) => {
    const c = dated.filter((p) => ageBucket(ageDays(asOf, p.listed_at)) === b.label);
    return { bucket: b.label, n: c.length, token_rate: c.length === 0 ? global : c.filter(tok).length / c.length };
  });
  return { all: ps, dated, buckets, global };
};
/** P(token recorded): the category x age cell, shrunk toward the bucket rate. */
const oddsFor = (base: OddsBase, p: SnapshotProtocol, asOf: string): number => {
  const b = ageBucket(ageDays(asOf, p.listed_at));
  if (b === null) {
    // No listed_at: the category's overall rate, shrunk toward the global rate.
    if (p.category === null) return base.global;
    const c = base.all.filter((q) => q.category === p.category);
    return (c.filter((q) => !isPreToken(q)).length + 5 * base.global) / (c.length + 5);
  }
  const br = base.buckets.find((x) => x.bucket === b)!.token_rate;
  if (p.category === null) return br;
  const c = base.dated.filter((q) => q.category === p.category && ageBucket(ageDays(asOf, q.listed_at)) === b);
  return (c.filter((q) => !isPreToken(q)).length + 5 * br) / (c.length + 5);
};

/** P10/P90 factors from the final model's LOO residuals (per-category at >= 10 comps). */
const rangeFactors = (rows: LooRow[]): { q10: number; q90: number; byCategory: Map<string, { q10: number; q90: number }> } => {
  const fac = (rs: LooRow[]): { q10: number; q90: number } => {
    const s = rs.map((r) => Math.log(r.actual / r.preds[0]!)).sort((a, b) => a - b);
    return { q10: round4(Math.exp(quantile(s, 0.1))), q90: round4(Math.exp(quantile(s, 0.9))) };
  };
  const byCategory = new Map<string, { q10: number; q90: number }>();
  for (const c of [...new Set(rows.map((r) => r.category))].filter((c): c is string => c !== null).sort()) {
    const rs = rows.filter((r) => r.category === c);
    if (rs.length >= 10) byCategory.set(c, fac(rs));
  }
  return { ...fac(rows), byCategory };
};
const medianDate = (ds: string[]): string => [...ds].sort()[Math.ceil(ds.length / 2) - 1]!;

/** The held-out tests: LOO variants, listing-date split, per-category misses, Brier, coverage. */
export function buildValidation(s: Snapshot): Validation {
  const loo = looRows(s);
  const comps = s.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const u = medianPreTokenAge(s);
  const labels = ['log-log OLS (radar-5)', 'flat global median', 'peer-only (radar-4)', 'shrinkage k=6', 'log-log + category factors k=6', 'log-log + growth', 'full radar-3 (peer x growth x maturity)'];
  const looOut = labels.map((variant, i) => {
    const f = loo.map((r) => Math.max(r.preds[i]! / r.actual, r.actual / r.preds[i]!)).sort((a, b) => a - b);
    const l = loo.map((r) => Math.abs(Math.log(r.actual / r.preds[i]!))).sort((a, b) => a - b);
    return { variant: labels[i]!, median_fold_error: round4(median(f)!), median_abs_log_error: round4(median(l)!) };
  });
  // Chain test: helps only if it cuts the peer-only miss by >= 5% and the residuals rise with chain count.
  const peerFold = looOut[2]!.median_fold_error;
  const chainFold = round4(median(loo.map((r) => {
    const pr = Math.max(1, Math.round(r.preds[2]! * chainF(r.chains)));
    return Math.max(pr / r.actual, r.actual / pr);
  }).sort((a, b) => a - b))!);
  const meds = [[1, 1], [2, 3], [4, 6], [7, Infinity]].map(([lo, hi]) => {
    const rs = loo.filter((r) => r.chains >= lo! && r.chains <= hi!).map((r) => Math.log(r.actual / r.preds[2]!)).sort((a, b) => a - b);
    return median(rs) ?? 0;
  });
  const monotone = meds.every((m, i) => i === 0 || m > meds[i - 1]!);
  const dated = comps.filter((p) => p.listed_at !== null);
  const medDate = medianDate(dated.map((p) => p.listed_at!));
  const older = dated.filter((p) => p.listed_at! <= medDate);
  const newer = dated.filter((p) => p.listed_at! > medDate);
  const fit = peerMultiples({ ...s, protocols: older });
  const llOld = fitLogLog(older);
  const peerOf = (p: SnapshotProtocol): number => (p.category !== null && fit.byCategory.has(p.category) ? fit.byCategory.get(p.category)!.multiple : fit.global);
  const tsPred = (p: SnapshotProtocol, g: boolean, m: boolean): number => {
    let v = p.tvl_usd * round4(peerOf(p));
    if (g) v *= g3(p);
    if (m) v *= m3(p, s.as_of, u);
    return Math.max(1, Math.round(v));
  };
  const foldOf = (ps: number[]): number => round4(median(ps.map((pr, i) => Math.max(pr / newer[i]!.mcap_usd!, newer[i]!.mcap_usd! / pr)).sort((a, b) => a - b))!);
  const perCat: { category: string; comps: number; median_fold_error: number }[] = [];
  for (const c of [...new Set(loo.map((r) => r.category))].filter((c): c is string => c !== null).sort()) {
    const rs = loo.filter((r) => r.category === c);
    if (rs.length < 3) continue;
    perCat.push({ category: c, comps: rs.length, median_fold_error: round4(median(rs.map((r) => Math.max(r.preds[0]! / r.actual, r.actual / r.preds[0]!)).sort((a, b) => a - b))!) });
  }
  const allDated = s.protocols.filter((p) => ageDays(s.as_of, p.listed_at) !== null);
  const bMed = medianDate(allDated.map((p) => p.listed_at!));
  const train = allDated.filter((p) => p.listed_at! <= bMed);
  const test = allDated.filter((p) => p.listed_at! > bMed);
  const tb = oddsBase(train, s.as_of);
  const baseRate = train.filter((p) => !isPreToken(p)).length / train.length;
  const brier = (pred: (p: SnapshotProtocol) => number): number => round4(test.reduce((a, p) => a + (pred(p) - (isPreToken(p) ? 0 : 1)) ** 2, 0) / test.length);
  const brierModel = brier((p) => oddsFor(tb, p, s.as_of));
  const brierBase = brier(() => baseRate);
  const ranges = rangeFactors(loo);
  const inBand = (r: LooRow, q10: number, q90: number): boolean => r.preds[0]! * q10 <= r.actual && r.actual <= r.preds[0]! * q90;
  const covered = loo.filter((r) => {
    const b = r.category !== null ? ranges.byCategory.get(r.category) : undefined;
    return b !== undefined ? inBand(r, b.q10, b.q90) : inBand(r, ranges.q10, ranges.q90);
  }).length;
  const coveredGlobal = loo.filter((r) => inBand(r, ranges.q10, ranges.q90)).length;
  return {
    loo_comps: loo.length,
    loo: looOut,
    time_split: {
      median_listed_at: medDate, older: older.length, newer: newer.length,
      radar5_median_fold_error: foldOf(newer.map((p) => Math.max(1, Math.round(Math.exp(llOld.intercept + llOld.slope * Math.log(p.tvl_usd)))))),
      peer_median_fold_error: foldOf(newer.map((p) => Math.max(1, Math.round(p.tvl_usd * round4(peerOf(p)))))),
      radar3_median_fold_error: foldOf(newer.map((p) => tsPred(p, true, true))),
      flat_median_fold_error: foldOf(newer.map((p) => Math.max(1, Math.round(p.tvl_usd * round4(fit.global))))),
      note: 'Listing-date split, not a walk-forward: one snapshot date cannot prove walk-forward performance.',
    },
    per_category: perCat,
    decisions: { growth: 'dropped', maturity: 'dropped', chain_factor: 'dropped', peer_multiple: 'replaced by the fitted log-log curve' },
    chain_test: { improvement_pct: round4(((peerFold - chainFold) / peerFold) * 100), monotone, adopted: false },
    coverage: { q10_factor: ranges.q10, q90_factor: ranges.q90, coverage_pct: Math.round((covered / loo.length) * 1000) / 10, covered, total: loo.length, global_band_coverage_pct: Math.round((coveredGlobal / loo.length) * 1000) / 10 },
    odds: { k: 5, brier_model: brierModel, brier_base: brierBase, improvement_pct: round4(((brierBase - brierModel) / brierBase) * 100), train: train.length, test: test.length, buckets: oddsBase(s.protocols, s.as_of).buckets.map((b) => ({ bucket: b.bucket, n: b.n, token_rate: round4(b.token_rate) })) },
  };
}

/** The full-758 accounting, every count computed from the snapshot. */
export function buildAccounting(s: Snapshot, board: BoardRow[], live: LiveRow[]): Accounting {
  const onBoard = new Set(board.map((r) => r.slug));
  const watchlist = board.filter((r) => s.watchlist.includes(r.slug)).length;
  const tokenized = s.protocols.filter((p) => !isPreToken(p)).length;
  const pre = s.protocols.filter(isPreToken);
  const legs = [0, 0, 0, 0];
  for (const p of pre) {
    if (onBoard.has(p.slug)) continue;
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) legs[0]!++;
    else if (VERSIONED.test(p.name)) legs[1]!++;
    else if (WRAPPED_NAME.test(p.name)) legs[2]!++;
    else legs[3]!++;
  }
  return {
    total: s.protocols.length, ranked: board.length, watchlist, outside_watchlist: board.length - watchlist,
    traded_shown: live.length, tokenized_total: tokenized, tokenized_not_shown: tokenized - live.length, pre_token_total: pre.length,
    set_aside_pre_token: { total: legs[0]! + legs[1]! + legs[2]! + legs[3]!, by_category_leg: legs[0]!, by_version_leg: legs[1]!, by_name_leg: legs[2]!, rankable_not_chosen: legs[3]! },
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const loglog = fitLogLog(snapshot.protocols);
  const unknownAgeDays = medianPreTokenAge(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && isRankable(p)) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, loglog, unknownAgeDays, model).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, MAX_NON_WATCHLIST_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, loglog, unknownAgeDays, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const loo = looRows(snapshot);
  const ranges = rangeFactors(loo);
  const octx = oddsBase(snapshot.protocols, snapshot.as_of);
  return scored.map((s, i) => {
    const odds = round4(oddsFor(octx, s.p, snapshot.as_of));
    const band = s.p.category !== null ? ranges.byCategory.get(s.p.category) : undefined;
    const q10 = band?.q10 ?? ranges.q10;
    const q90 = band?.q90 ?? ranges.q90;
    const p10 = Math.round(s.implied * q10);
    const expected = Math.round(s.implied * odds);
    // The verdict is evaluated at the $1,000 reference capital; the farm
    // steps keep farm.ts's deposit rule ($50 minimum), which is what you
    // need to participate.
    const cost_plan = costPlan(
      { tvl_usd: s.p.tvl_usd, chains: s.p.chains, age_days: s.age, implied_value_usd: s.implied, value_p10_usd: p10, value_expected_usd: expected },
      { deposit_usd: REFERENCE_CAPITAL_USD },
    );
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      odds,
      expected_value_usd: expected,
      p10_usd: p10,
      p90_usd: Math.round(s.implied * q90),
      value_p10_usd: p10,
      cost_plan,
      model: {
        peer_multiple: round4(s.peerMultiple),
        peer_category: null,
        peer_count: s.peerCount,
        peer_source: s.peerSource,
        growth_pct: round4(s.growthPct),
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: costedFarmSteps({ slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains, tvl_usd: s.p.tvl_usd, age_days: s.age }),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    odds: row.odds,
    expected_value_usd: row.expected_value_usd,
    p10_usd: row.p10_usd,
    p90_usd: row.p90_usd,
    value_p10_usd: row.value_p10_usd,
    cost_plan: row.cost_plan,
    multiple: round4(row.model.peer_multiple * row.model.growth_multiplier * row.model.maturity_multiplier),
    peer_multiple: row.model.peer_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** The model as readable sentences, for the dashboard's model panel. The
 * fitted coefficients are written in, so the sentence is never stale. */
export function modelText(loglog: LogLogFit): string {
  return `implied = TVL x curve multiple. The curve multiple comes from a log-log fit on the ${loglog.comps} tokenized comps in this snapshot: log(mcap) = ${loglog.intercept.toFixed(4)} + ${loglog.slope.toFixed(4)} x log(TVL), fitted on every run — so a bigger TVL is priced at a lower multiple, because the slope is below 1. Growth and maturity were tested leave-one-out on the same comps and dropped: neither improves the median miss on top of the curve, and the chain factor did not either. Launch odds are the shrunken token rate of the protocol’s category x age cohort; P10–P90 are the 10th/90th percentiles of the leave-one-out residuals.`;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot, model);
  const loglog = fitLogLog(snapshot.protocols);
  const outside = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const watchlist = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: modelText(loglog),
    model_constants: model,
    model_version: MODEL_VERSION,
    loglog: { intercept: loglog.intercept, slope: loglog.slope },
    reference_capital_usd: REFERENCE_CAPITAL_USD,
    watchlist_size: snapshot.watchlist.length,
    watchlist_count: snapshot.watchlist.length,
    board_size: board.length,
    outside_watchlist_size: outside,
    live_size: live.length,
    global_peer_multiple: round4(peers.global),
    peers: [...peers.byCategory.values()],
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
    traded: live,
    validation: buildValidation(snapshot),
    accounting: buildAccounting(snapshot, board, live),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
