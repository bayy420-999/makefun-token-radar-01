# Token Radar — the value model (radar-5)

The board ranks protocols that record no token by an **implied launch
value**: what a token would be worth if the protocol's record stayed as it
is. The value is computed from the snapshot's own figures only — TVL. No
protocol name is ever special-cased; the same function scores every row.
Coverage is full: every pre-token protocol that passes the eligibility
test is ranked, 197 rows — the 40 watchlist slugs plus 157 outside the
watchlist, including 20 above the $50M floor that the early board left
out. The estimator is the radar-5 log-log curve, unchanged; only the
board's coverage changed, so the version stays radar-5 and every
validation number below is the same as the 177-row board's.

## The formula

```
implied_value_usd = TVL × curve_multiple
curve_multiple    = exp(6.9646 + (0.5223 − 1) × ln(TVL))
```

radar-5 fits a log-log curve by ordinary least squares on the snapshot's
128 tokenized comps, on every run: `log(mcap) = 6.9646 + 0.5223 × log(TVL)`
(R² 0.19). The slope is below 1, so a bigger TVL is priced at a lower
multiple: the market pays relatively less per TVL dollar as protocols
grow. The coefficients are fitted from the snapshot on every run, never
hardcoded, and rounded to 4 decimals when shipped; the board is computed
from the rounded values, so the dashboard reproduces the implied value
exactly from the shipped coefficients (`data.js` carries them as
`loglog`). radar-4 was `TVL × peer_multiple` (category median mcap/TVL);
the leave-one-out test below says the curve beats it by 39% and beats the
flat global median by 33%, so the peer multiples are replaced, not kept.
The dropped terms survive in the code only as the constants that switch
them off (`growth_weight` 0, maturity 1.00 flat), so every row still
reports the three factors and anyone multiplying the reported factors by
the TVL reproduces the implied value exactly.

Worked examples from this snapshot (computed, not assumed):

| Protocol | TVL | Curve multiple | Implied value |
| --- | --- | --- | --- |
| Steakhouse Financial | $2,753,981,495 | 0.0328 | $90,330,593 |
| Sentora Curator | $2,757,585,593 | 0.0327 | $90,173,049 |
| USDD | $1,055,793,606 | 0.0518 | $54,690,109 |
| Nucleus | $5,007,171 | 0.6673 | $3,341,285 |

### 1. The fitted curve — what the market pays for a dollar of TVL, by size

Take the 128 tokenized protocols (market cap and TVL both present and
positive) and regress `log(mcap)` on `log(TVL)` by ordinary least squares,
closed form, on every run. The fitted line is the model's whole claim:
a protocol's implied value is its TVL times the curve's multiple at that
TVL. The multiple falls with size — 0.67× at $5M of TVL, 0.16× at $100M,
0.05× at $1B — because the slope (0.52) is below 1: the market pays
relatively less per TVL dollar as protocols grow. The fit is weak in
absolute terms (R² 0.19: four-fifths of the log variance is not size), and
that is stated, not hidden — but it is the best of everything tested
below, on both held-out tests.

The category medians radar-4 used are still computed and shipped in
`data.js` (the `peers` list), as descriptive context — and they show why
the curve wins: most categories have 3–15 peers, so a category median is
one or two protocols away from moving a lot, and thin categories fall back
to the global median (0.2138) anyway. The medians:

| Category | Peers | Median mcap/TVL |
| --- | --- | --- |
| Lending | 15 | 0.1324 |
| Dexs | 11 | 0.3424 |
| Yield | 9 | 0.1914 |
| RWA | 9 | 0.2748 |
| Basis Trading | 7 | 0.6544 |
| Cross Chain Bridge | 4 | 1.2205 |
| Risk Curators | 1 | global 0.2138 (fallback) |
| Onchain Capital Allocator | 2 | global 0.2138 (fallback) |

This is why the board's top rows are not simply the biggest TVLs, and
why its bottom rows are not simply the smallest: a $5M-TVL protocol is
priced at 0.67× while a $2.8B one is priced at 0.03×. The watchlist's
largest category by count, Risk Curators (12 of 40), has only one
tokenized peer — under radar-4 it was priced at the global median rather
than on a single protocol's ratio; under radar-5 its rows are priced by
the curve like every other row, and the category enters only through the
launch odds.

### 2. Growth — tested and dropped

radar-3 priced a dampened weekly move,
`growth = 1 + clamp(change_7d, -50%, +100%) × 0.5`. Round 2 tested it
again as a regressor on top of the curve, `log(mcap) ~ log(TVL) +
clamped weekly move`: the leave-one-out test says it hurts (curve alone
×3.3986, curve + growth ×3.7632), and its fitted coefficient is not
stable — −3.71 on all 128 comps, −1.34 fitted on the older half alone,
a 3× swing, with an implausible magnitude (a +100% week would price a
token at ×0.02). A week's TVL move is noise at this horizon, so radar-5
prices it at 1.00. The row still reports the week's clamped change and a
1.00 multiplier: the move is shown, not priced.

### 3. Maturity — tested and dropped

radar-3 priced age,
`maturity = 0.70 + 0.30 × min(age_days, 1095) / 1095`. Round 2 tested it
again as a regressor on top of the curve, and the time split is what
kills it: the older half (listed before 2024-02-18) is already ~fully
mature — age fraction mean 0.99, sd 0.02, min 0.91 — so the fitted age
coefficient explodes (−4.75, against −0.41 on all comps) and the model
misses the newer half by ×10.07, against ×3.04 for the curve alone
(leave-one-out is worse too: ×3.6518 against ×3.3986). The time split
cannot identify an age term, because the older half has almost no age
variance in it. Age no longer moves the value. Age still matters for the
launch odds below, where it defines the cohort — that is the only place
`listed_at` now enters the board.

### 4. Chain factor — tested and dropped

The test was `chain = 1 + 0.03 × ln(chains)`, capped at 1.10 (a
single-chain protocol prices at 1.00, a 14-chain one at 1.08). It cuts
the peer-only median miss by only 0.51% (×5.5321 → ×5.5039), below the
5% bar set before the test, and the effect is not monotone sensible: the
median peer-only log residual by chain count is −0.05 (1 chain), −0.41
(2–3), −0.67 (4–6), +0.08 (7+) — it falls, then rises, instead of rising
steadily. Multi-chain TVL is often the same capital counted twice. The
factor is dropped.

## Validation — the held-out tests

Every number here is computed from the snapshot on every run and shipped
in `data.js` under `validation`; nothing is pasted in by hand.

### Leave-one-out on the 128 tokenized comps

Each of the 128 protocols with a market cap and a TVL is priced without
itself in the fit. Metric: median fold
error — the median over comps of `max(pred/actual, actual/pred)` — plus
median |log error|.

| Variant | Median fold error | Median \|log error\| |
| --- | --- | --- |
| Log-log OLS (radar-5) | 3.3986 | 1.2234 |
| Flat global median | 5.0697 | 1.6233 |
| Peer-only (radar-4) | 5.5321 | 1.7106 |
| Shrinkage k=6 | 5.1983 | 1.6483 |
| Log-log + category factors k=6 | 3.7775 | 1.3284 |
| Log-log + growth | 3.7632 | 1.3253 |
| Full radar-3 (peer × growth × maturity) | 5.7313 | 1.7456 |

The decisions follow the rule set before the test — drop a term unless it
improves the LOO median fold error; adopt the chain factor only on a ≥5%
improvement with a monotone sensible effect; adopt a new estimator only
if it beats flat by ≥5% on BOTH leave-one-out and the time split:

- **Growth: dropped.** On top of the curve it makes the LOO miss worse
  (×3.3986 → ×3.7632) and its coefficient is unstable across halves.
- **Maturity: dropped.** It makes the LOO miss worse (×3.6518) and
  destroys the time split (×10.07) — the older half has almost no age
  variance to fit it on.
- **Chain factor: dropped.** +0.51% improvement on the peer model, below
  the 5% bar, and the residuals are not monotone in chain count.
- **Category factors: dropped.** Shrunk category mean log-residuals
  (prior k=6, capped to [0.4, 2.5]) make the LOO miss worse (×3.3986 →
  ×3.7775) — the same small-sample noise that sank the category medians.
- **Peer multiple: replaced by the fitted log-log curve.** The curve is
  adopted under the rule set before the test, and it clears the bar by a
  wide margin: +33.0% on leave-one-out (×5.0697 → ×3.3986) and +42.7%
  on the time split (×5.3090 → ×3.0413). The shrinkage blend from round
  1 (`(n × category median + k × global) / (n + k)`: k=3 gives ×5.1653,
  k=6 gives ×5.1983 — better than category medians, still worse than
  flat) is superseded: the curve beats it too, on both tests.

The absolute errors are still large, and that is stated plainly: the
median miss is ×3.4 for the final model (×5.1 for the flat median),
because mcap/TVL ratios span four orders of magnitude and the curve
explains only about a fifth of the log variance (R² 0.19). The model
orders protocols by what the market pays for TVL at their size; it does
not predict any single token's price to within a factor of two.

### Listing-date split (not a walk-forward)

The 128 comps split by `listed_at` at the median listing date
(2024-02-18): 48 older, 47 newer. Only 95 of the 128 comps carry a
`listed_at`; the other 33 cannot be placed in time and are excluded from
this split. Curve and medians fitted on the older half, tested on the
newer half:

| Model | Median fold error |
| --- | --- |
| radar-5 log-log (older-fit curve) | 3.0413 |
| Flat global median (older-fit) | 5.3090 |
| Peer-only (older-fit medians) | 5.2043 |
| radar-3 (older-fit peers) | 5.8006 |

The same ordering as LOO: the curve wins again, by 42.7% against flat. This is a
**listing-date split, not a true walk-forward**: the snapshot is one
date (2026-11-14), so a one-date sample cannot prove walk-forward
performance. No model is fitted on genuinely earlier data and tested on
later data, because no earlier data exists in the snapshot.

### Per-category misses (final model, LOO)

Median fold error per category, categories with ≥3 comps. Canonical
Bridge and Lending are the worst-priced categories in the sample and CDP
the best — the curve is a rough instrument, and its roughness varies by
category. Note the reversals against radar-4: Bridge improves from
×12.52 to ×2.58, while Lending worsens from ×4.51 to ×7.26 — the curve
fits some categories better and others worse, which is why the
per-category table is shown rather than smoothed away.

| Category | Comps | Median fold error |
| --- | --- | --- |
| CDP | 3 | 1.3205 |
| RWA | 9 | 1.5909 |
| Basis Trading | 7 | 2.3862 |
| Yield Aggregator | 4 | 2.4998 |
| Bridge | 6 | 2.5788 |
| Liquid Staking | 9 | 3.3831 |
| Indexes | 3 | 3.4959 |
| Yield | 9 | 3.9663 |
| Cross Chain Bridge | 4 | 4.1327 |
| Dexs | 11 | 5.2805 |
| CEX | 9 | 6.0627 |
| Privacy | 3 | 6.3983 |
| Lending | 15 | 7.2622 |
| Canonical Bridge | 8 | 7.3724 |

## Launch odds — P(token recorded)

Each row carries `odds`, the probability that a protocol with its
category and age profile has a token recorded, estimated from the
snapshot's own record (tokenized vs pre-token among the 758), and
`expected_value_usd = round(implied_value_usd × odds)`.

Method: for a protocol in category C and age bucket B, with `t` tokenized
of `n` protocols in that cell and `bucket_rate` the token rate of the
whole bucket,

```
odds = (t + 5 × bucket_rate) / (n + 5)
```

The prior strength is k=5: a cell of 5 protocols is pulled halfway to
its bucket rate, a cell of 50 mostly speaks for itself, and a cell of
one barely moves the bucket rate. Small cells dominate this snapshot —
most category × bucket cells hold a handful of protocols — so the
shrinkage, not the raw cell rate, is doing the work, and the choice of
k=5 is stated rather than hidden. Age buckets are 0–180d, 181–365d,
366–730d, 731–1095d, >1095d.

| Age bucket | Protocols | Token rate |
| --- | --- | --- |
| 0–180d | 88 | 0.2614 |
| 181–365d | 73 | 0.3973 |
| 366–730d | 184 | 0.3859 |
| 731–1095d | 137 | 0.5474 |
| >1095d | 163 | 0.7914 |

Odds rise with age: a protocol listed over three years ago has a 79%
token rate in this snapshot, one listed in the last six months 26%.
Two fallbacks, both computed, never assumed: a protocol with no
`listed_at` (6 board rows) takes its category's overall rate shrunk
toward the global dated rate (0.5070) with the same k=5; a protocol
with no category (none on the board) takes its bucket rate.

Validation: the odds are fitted on the older half by `listed_at`
(median 2025-01-06; 324 protocols) and tested on the newer half (321
protocols). Brier score **0.2836** against **0.3176** for the base rate
(the older half's token rate, 0.6543, predicted for every row) — a
10.7% improvement. The test covers dated protocols only; the 113
undated protocols cannot be placed in time. Odds across the board run
0.1378–0.8913 (median 0.3321). The highest expected value is USDD at
$19,535,307, just ahead of Polymarket International at $19,321,833 —
odds never outrank value.

**Odds is a display and second-sort field only.** The board's primary
rank stays by implied value, and the gate requires non-increasing
implied value with rank. A high-value protocol with low odds stays high
on the board; its odds say only that its cohort rarely records a token.

## P10–P90 ranges

Each row carries `p10_usd` and `p90_usd`: the implied value times the
10th and 90th percentiles of the final model's leave-one-out log
residuals (`log(actual/pred)`), exponentiated back to multiplicative
factors. Global factors are **×0.0619 / ×8.6298**. Where a category has
≥10 comps, its own residuals set the band instead: Lending ×0.0271 /
×9.9070, Dexs ×0.1583 / ×5.8359. The ≥10 bar is the choice: below it a
quantile of 10–15 residuals is mostly noise, so the global band applies.

Coverage, measured on the same 128 comps: the shipped bands (per-category
where available, global otherwise) hold **78.9%** (101 of 128); the
all-global band holds **79.7%** (102 of 128). The per-category bands
cover slightly worse than the global band — they are noisier at n=11–15 —
and that is reported rather than rounded away. The bands narrowed on the
top side against radar-4 (P90 ×13.28 → ×8.63) and barely moved on the
bottom (P10 ×0.0639 → ×0.0619): the curve's misses are less one-sidedly
high than the peer medians' were. The bands are still wide: a P90 of
×8.6 means the model cannot rule out a launch worth most of an order of
magnitude more than the point estimate, and a P10 of ×0.06 means it
cannot rule out one worth almost nothing.

## What is ranked, and what is set aside

- **Ranked:** protocols whose record carries no token at all (`mcap_usd`,
  `gecko_id` and `symbol` all null). All 40 watchlist slugs, plus every
  pre-token protocol outside the watchlist that passes the eligibility test
  below — 157 of them in this snapshot, 197 rows in all. The test is the
  snapshot's own watchlist rule, applied to every board candidate alike
  (watchlist and non-watchlist), so a non-watchlist row cannot slip through
  on a category or a name the watchlist would have refused. The board runs
  $90,330,593 (Steakhouse Financial) down to $3,341,285 (Nucleus),
  $2,269,286,628 in all.
- **Set aside, never ranked:** protocols whose token already trades. The
  dashboard shows the top 24 of them at the market's own value (their
  market cap), in a separate Live view, so the board never mixes a model's
  claim with a market price.

Full-758 accounting, every count computed from the snapshot in `main.ts`
and shipped in `data.js` under `accounting`:

```
758 total
  = 197 ranked (40 watchlist + 157 outside the watchlist)
  + 24 traded, shown in the Live view
  + 145 set-aside pre-token
      (category leg 128, version leg 11, name leg 6,
       rankable but not chosen 0)
  + 392 tokenized, not shown
```

### The 20 above-floor rows — included at full value, no discount

The early board ranked below-floor protocols only (137 of them), which
left 20 above-floor protocols unranked even though they pass the same
eligibility test. They are now ranked, at the same curve value as every
other row: Sentora Curator (#2, $90,173,049), Polymarket International
(#9), CIAN Yield Layer (#12), Defi Saver Asset Management (#13), Mellow
Core (#16), BitFi Basis (#19), Figure Markets Prime (#24), Theo Network
thUSD (#29), Figure Markets Exchange (#31), Extended Perps (#37), Avant
avUSD (#38), Stellar DeFi Hub (#41), Loopscale Lending (#45), IPOR
Fusion (#48), Circle Gateway (#49), Arcus Perps (#52), Solv Strategies
(#54), USDCx (#55), AZverse Perps (#58) and Nado Spot (#60). The board
is 197 rows; the top-10 share of combined value is 23.5%.

Why no discount: every snapshot-testable hypothesis for why the house
watchlist omits these 20 was run and fails. They pass the category leg
(none is a Bridge, Liquid Staking, Restaking, Restaked BTC or CEX),
the version leg (no V2/v2/2.0 suffix), the name leg (no restak/stak/
wrapped substring), the exchange-name test (no name begins with an
exchange name), the parent-name test (no name shares a distinctive stem
with a tokenized protocol, except Solv Strategies below) and the
duplication test (all 20 TVLs are unique in the snapshot). No figure in
the snapshot distinguishes them from the 137 rows already ranked — and
no figure sets a haircut factor for them. A haircut (halving, P10
pricing, any fixed factor) would be a hardcoded value with no
snapshot-derived justification, which is exactly what the value model
forbids. The watchlist is the floor, never the ceiling: the house's own
rule has no above-floor exclusion, and the board's rule is the
eligibility test, applied alike to every candidate.

The one same-family signal: **Solv Strategies** (#54, $11,858,490)
shares its first word with two tokenized Solv protocols (Solv Basis
Trading, Solv RWA). The same first-word test also flags six rows
already on the board at full value — GMX Solana, Kava Mint, MetalX
Swap, Flying Tulip ftUSD, Manta CeDeFi and Mezo Earn — so a sibling
haircut would have to apply to those too, and no figure sets it. Solv
Strategies ranks at full value like them: a strategy vault is not a
wrapped or staked receipt token, and its category (Onchain Capital
Allocator) is the same shape as Mellow Core and IPOR Fusion beside it.

## The eligibility test — not a wrapped or staked product of one that trades

A ranked protocol must be a standalone launch, not a wrapped, staked or
bridged product of a token that already trades. Three legs, all computed
from the snapshot's own record (category, name) — no name is special-cased:

1. **Category.** The protocol's category is none of Bridge, Canonical
   Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX — the
   category set the snapshot's watchlist rule itself uses. A bridge's TVL
   is other chains' tokens locked to move them (wTAO is wrapped TAO, tzBTC
   is wrapped BTC); a liquid staking or restaking protocol issues a receipt
   token for a staked asset that already trades (staked ETH, SOL, HYPE),
   and that receipt *is* the product — its launch already happened in the
   form of the underlying. A centralised exchange is not a protocol launch
   at all. Restaked BTC is the same receipt-token shape for BTC.
2. **Version.** The name does not end in a version marker (a space followed
   by V2, v2, 2.0 or the like): a V2 is a pool of the same protocol, not a
   new launch.
3. **Name.** The name carries no substring `restak`, `stak` or `wrapped`
   (case-insensitive). Substrings, not whole words: "restaking" is not the
   whole word "staking", and "stakee" is not the word "stake" — the
   whole-word test let Mantle Restaking, Mellow Restaking, Valantis stHYPE
   Restaking, InceptionLRT (Isolated Restaking) and Stakee through. Every
   name the substring test flags in this snapshot was audited against its
   record (category, chains) before the rule shipped, and all of them are
   staking or restaking products of tokens that already trade — including
   the ones the category leg misses, such as CatFee Staking Vault,
   Chiliz Governance Staking (CHZ trades), Starknet BTC Staking,
   WEMIX.FI Staking (WEMIX trades) and Zircuit Staking. No standalone
   protocol's name trips it.

What the audit removed from the 200-row board: **27 rows** — 19 bridges
(Ink Bridge, PulseChain Bridge, Polygon zkEVM Bridge, TxFlow Bridge,
SuiBridge, Scroll Bridge, ObeliskBTC, Ring Few, wTAO, Pacifica Bridge,
SX Rollup Bridge, Circle Bitcoin, Morph Bridge, Echo Bridge, tzBTC,
Sophon Bridge, Citrea Bridge, Endurance Bridge, Wan Bridge) and 8
staking/restaking rows (Mantle Restaking, Mellow Restaking, STKESOL by SOL
Strategies, Valantis stHYPE Restaking, Bitget SOL, InceptionLRT (Isolated
Restaking), NodeDAO, Stakee). Four eligible rows entered in their place
(Monarq, Granite, Flying Tulip ftUSD, Nucleus); the board is now 177 rows,
because only 137 below-floor pre-token protocols pass the test at all.

Deliberately kept, after the same audit: Adrastea Validator and Qearn
(category Staking Pool) — a validator operator and a staking pool are
services, not receipt-token products, and the house's own watchlist keeps
a Staking Pool protocol (Reti Pooling) and a Restaking one (b14g) on the
same reasoning: the category alone does not make a protocol a wrapped
product. Sygnum FIUSD Liquidity Fund (RWA) is a fund, not liquid staking —
"Liquidity Fund" is not a staked product.

## E1 audit — the risky rows

Four rows the eligibility test passes but a reviewer will question, each
audited against its snapshot record (category, chains, name) and kept on
a stated argument. The default was removal; removal is unavailable for
three of the four, and no generic rule removes the fourth — both facts
are part of the audit, not footnotes to it.

- **Saturn** (Stablecoin Wrapper, rank 22, Ethereum/Monad/Binance,
  $154M TVL, listed 2026-04-09). Kept. The "wrapper" wraps off-chain
  credit into Saturn's own stablecoin: DefiLlama describes it as a
  dual-token Bitcoin-backed credit protocol, USDat a stablecoin backed by
  tokenized treasuries and sUSDat a yield-bearing version backed by
  digital credit exposure. What is wrapped is tokenized treasuries and
  STRC credit — off-chain assets, not another protocol's trading token.
  Saturn is not a bridge (nothing is locked to move it across chains)
  and not liquid staking (no receipt for a staked asset that trades);
  its own USDat/sUSDat are its product, and the snapshot records no
  token for Saturn. The category name alone does not make a protocol a
  wrapped product of one that trades, any more than "Staking Pool" does
  for Adrastea and Qearn above.
- **Doppler Finance** (CeDeFi, rank 30, Ripple/Ethereum, $93M TVL,
  listed 2025-02-14). Kept. CeDeFi yield vaults for XRP and RLUSD under
  institutional custody: XRP has no staking mechanism, and the vaults
  pay yield in the deposited asset rather than issuing a receipt token
  that trades. It is a custody-and-strategy business, not a wrapped or
  staked product of a trading token; CeDeFi is not in the excluded
  category set, the name carries no marker, and it passes every leg.
- **Goose** (CeDeFi, rank 121, Binance/Op_Bnb/Arbitrum/Ethereum,
  $12.8M TVL, listed 2024-11-14). Kept. Same category as Doppler, same
  treatment: the category is not excluded, the name carries no marker,
  and it passes every leg. No generic rule separates Goose from Doppler
  — same category, both pass all legs, both multi-chain — so removing
  Goose alone would mean hardcoding its name, which the entry forbids.
  The snapshot's Goose is the CeDeFi stablecoin-staking platform (its
  four chains match that platform's footprint), not the older
  single-chain BSC Goose Finance (EGG) farm that shares the name.
- **Armitage by Wintermute** (Risk Curators, rank 29, Ethereum only,
  $103M TVL, listed 2026-05-20). Kept. A vault curator on Morpho — the
  same category as the board's #1 (Steakhouse Financial) and #2
  (Gauntlet), the same shape: a curator's vaults, not a wrapped product.
  "by Wintermute" is a builder credit, not a parent protocol:
  Wintermute is an algorithmic trading firm, not an exchange, and the
  house rule excludes names *beginning* with an exchange name — Armitage
  begins with "Armitage". The snapshot carries no parent-protocol field,
  so the house's parent leg cannot be tested from the snapshot at all.

Why removal was not the outcome: Saturn, Doppler Finance and Armitage
are watchlist slugs, and the gate requires all 40 watchlist slugs on the
board — removing one makes `main.ts` refuse to run. The watchlist is the
floor: the house itself classified these three as rankable under its own
rule, and the board cannot overrule the watchlist by dropping a slug.
Goose is below-floor, so removal was mechanically possible, but only by
a rule that also removes Doppler (same category) or by naming Goose
directly. Neither is defensible, so Goose is kept on the same argument
as Doppler.

## Farm plans

Each row carries seven steps generated from the protocol's own record:
category (which action to take), chains (which chain, and a second-chain
step when the protocol runs on more than one), TVL (how much capital the
position needs), and age (how long to hold: 30–60 days). Every step
states its cost and its time. No step is a slogan, and no step is
written for a named protocol — the templates take the protocol's values
as arguments. Step 7 is new: a verification step naming the main chain,
the TVL, and the TVL level below which the position should be
reconsidered (half the current TVL).

The steps are costed by the rules in `lib/farm.ts`, and every row also
carries a `cost_plan` in `data.js` with the arithmetic behind the plan:

- **Gas.** One deposit transaction and one claim transaction on the
  row's main chain, from a per-chain table of typical-gas operational
  estimates — not snapshot figures and not a quote for any moment: gas
  moves with congestion, and the reader can check any figure against a
  block explorer or a gas tracker before moving funds. Ethereum $10/$5,
  Bitcoin-family chains $3/$2, busy EVM L1s $2/$1, mid L1s and ZK
  rollups $1/$1, L2s and cheap EVM $0.50/$0.50, ultra-cheap chains
  (Solana, Sui, Aptos and the like) $0.10/$0.10; any chain not listed
  takes the $1/$1 mid-L1 figure.
- **Deposit (the steps).** The minimum to participate: total main-chain
  gas must be at most 10% of the deposit, floored at $50 and capped at
  $250 — `deposit = clamp(ceil(gas / 0.10), $50, $250)`. The floor binds
  on every cheap chain; only Ethereum rows size above it, at $150.
- **Gross at P10.** `(deposit / TVL) × value_p10 × 0.10`: the deposit's
  share of the protocol's TVL times the P10 launch value times
  `AIRDROP_SHARE = 0.10` — an explicit assumption, stated as one: 10% of
  the implied launch value is assumed to reach farmers, the rest going
  to the team, investors, the treasury and everyone else the launch
  pays. TVL cancels out of this: the gross is
  `deposit × peer_multiple × q10_factor × 0.10`, so a row's gross is set
  by its multiple and its P10 factor, not its size.
- **Costs.** Gas (deposit + claim on the main chain) plus opportunity
  cost: `deposit × 0.04 × hold_days / 365` — the 4% T-bill rate, stated:
  the deposit could otherwise earn ~4% a year.
- **Net at P10.** `net_p10 = gross_p10 − costs`, whole dollars.
  `net_per_hour = net_p10 / (time_minutes / 60)`, where time is the
  setup (5 + 15 + 15-or-10 + 5 minutes) plus 10 minutes to claim, 10
  minutes to verify, and 10 minutes a week for `ceil(hold_days / 7)`
  weekly check-ins.
- **Verdict — at a stated reference capital of $1,000.** The verdict
  answers "does it pay at $1,000?", not "does it pay at the $50 minimum
  deposit?": at the minimum the gross is twenty times smaller while gas
  barely moves, so the column cannot discriminate. The verdict is
  computed from the same cost plan with `deposit_usd = $1,000` — the
  farm steps still show the minimum deposit, which is what you need to
  participate. Thresholds, evaluated at P10 (the conservative case):
  FARM when `net_p10 > $50` AND `net_per_hour > $5`; THIN when
  `net_p10 > $0`; SKIP otherwise.
- **Net at the point-implied value.** `cost_plan` also ships
  `net_expected_usd` and `net_expected_per_hour_usd`: the same
  arithmetic with the expected value (`implied × odds`) in place of
  P10, at the same $1,000 reference capital — so the detail view can
  show both the pessimistic P10 net and the expected net side by side.

The honest result on this snapshot: the P10 verdict column now
discriminates a little — FARM 0 / THIN 12 / SKIP 185 at the $1,000
reference (at the $50 minimum it is 0 / 1 / 196: the gross is twenty
times smaller while gas barely moves). The reason the column is still
thin is arithmetic, not a threshold choice: the largest gross at P10
on the whole board is $10 (GoonFi: multiple 0.6537 × its Dexs P10 factor
0.1583 × $1,000 × 0.10 — the curve prices small TVLs at high multiples,
so the biggest P10 gross now sits on a small protocol, not a big one),
and the best net at P10 is $5 (Manifest Trade, Byreal and Katana DEX
tie at $5) after gas and opportunity cost. FARM needs a net above $50;
the best row's net grows about $0.005 per extra dollar of deposit, so
FARM needs roughly $11,000 of capital on that row. The expected net
discriminates more: at the same $1,000 and the same bars, 0 FARM / 108
THIN / 89 SKIP. The thresholds were not moved to manufacture a spread —
the P10 column says what it says, and the detail view shows the expected
net alongside it.

## Determinism

The program reads only the snapshot, uses no clock, no randomness and no
network. Ties in implied value break on slug, so two runs write identical
bytes. The validation, odds, ranges and accounting are computed from the
snapshot on every run, never pasted in — rerunning the program
recomputes them. The log-log coefficients are part of that: fitted from
the snapshot's tokenized comps on every run, rounded to 4 decimals when
shipped, and the board is computed from the rounded values.
