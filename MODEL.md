# Token Radar — the value model (radar-6)

The board ranks protocols that record no token by an **implied launch
value**: what a token would be worth if the protocol's record stayed as it
is. The value is computed from the snapshot's own figures only — TVL,
7-day growth and age. No protocol name is ever special-cased; the same
function scores every row. Coverage is full: every pre-token protocol
that passes the eligibility test is ranked, 197 rows — the 40 watchlist
slugs plus 157 outside the watchlist, including 20 above the $50M floor
that the early board left out. The estimator is the radar-5 log-log curve
plus the fitted growth/age coefficients at 0.05× strength (radar-6);
the curve itself is unchanged, and every validation number below is
recomputed from the snapshot on every run.

## The formula

```
implied_value_usd = TVL × curve_multiple × growth_factor × maturity_factor
curve_multiple    = exp(6.9646 + (0.5223 − 1) × ln(TVL))
growth_factor     = clamp(exp(0.05 × β_g × growth), 0.50, 2.00), β_g = −3.9059
maturity_factor   = clamp(exp(0.05 × β_a × age_years), 0.50, 2.00), β_a = −0.5312
```

radar-6 fits a log-log curve by ordinary least squares on the snapshot's
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

The growth and maturity factors are the fitted growth/age coefficients
at 0.05× strength — the shrinkage ladder's accepted rung (see §2–§3).
`growth` is the 7-day change as a fraction, clamped to −60%/+120%, with
a missing 7-day change at −8.23% (the training median); `age_years` is
the years since `listed_at`, with an undated protocol at 1.8535 years
(the pre-token median). Each factor is clamped to 0.50–2.00, so neither
can move a value by more than 2×. No row hits either clamp on this
snapshot. The median implied value is 1.0753× the curve alone — the
growth/age terms shift the median only slightly, which is the point:
they are a small, measured adjustment, not a second model.

Worked examples from this snapshot (computed, not assumed):

| Protocol | TVL | Curve multiple | Growth | Maturity | Implied value |
| --- | --- | --- | --- | --- | --- |
| Steakhouse Financial | $2,753,981,495 | 0.0328 | 1.0043 | 0.9869 | $89,530,595 |
| Sentora Curator | $2,757,585,593 | 0.0327 | 0.9954 | 0.9902 | $88,878,622 |
| USDD | $1,055,793,606 | 0.0518 | 1.0055 | 0.9853 | $54,182,538 |
| Nucleus | $5,007,171 | 0.6673 | 1.0485 | 0.9831 | $3,444,131 |

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

### 2. Growth — tested at full strength, shipped shrunk

radar-3 priced a dampened weekly move,
`growth = 1 + clamp(change_7d, -50%, +100%) × 0.5`. Round 2 tested it
again as a regressor on top of the curve, `log(mcap) ~ log(TVL) +
clamped weekly move`: the leave-one-out test says it hurts at full
strength (curve alone ×3.3986, curve + growth ×3.7632), and its fitted
coefficient is not stable — −3.71 on all 128 comps, −1.34 fitted on the
older half alone, a 3× swing, with an implausible magnitude (a +100%
week would price a token at ×0.02). A week's TVL move is noise at this
horizon — but the walk-forward test says the opposite (×3.04 → ×2.81):
growth helps the newer half and hurts leave-one-out. It is
regime-dependent, so radar-6 does not trust it at full strength and
does not drop it either: it ships at 0.05× the fitted coefficient
(β_g = −3.9059, fitted jointly with age), the accepted rung of the
shrinkage ladder (0.25 → LOO ×3.6357 / WF ×3.6535, fails both caps;
0.10 → ×3.4709 / ×3.1210, fails both narrowly; 0.05 → ×3.4314 /
×2.7641, passes both). Each multiplier is clamped to 0.50–2.00.

A units bug in the round-2 test is worth stating: `change_7d` is in
percent (median −8.23%), and the first test clamped raw percents to
[−0.5, +1.0], so 87.5% of comps sat at the floor. The corrected test
divides by 100 first. The conclusion is the same (full strength fails),
but the numbers above are the corrected ones.

### 3. Maturity — tested at full strength, shipped shrunk

radar-3 priced age,
`maturity = 0.70 + 0.30 × min(age_days, 1095) / 1095`. Round 2 tested it
again as a regressor on top of the curve, and the time split is what
kills it at full strength: the older half (listed before 2024-02-18) is
already ~fully mature — age fraction mean 0.99, sd 0.02, min 0.91 — so
the fitted age coefficient explodes (−4.75, against −0.41 on all comps)
and the model misses the newer half by ×10.07, against ×3.04 for the
curve alone (leave-one-out is worse too: ×3.6518 against ×3.3986). The
time split cannot identify an age term at full strength, because the
older half has almost no age variance in it. So age ships at the same
0.05× strength as growth (β_a = −0.5312, fitted jointly), inside the
same ladder and the same 0.50–2.00 clamp — the joint shrunk model reads
LOO ×3.4314 / WF ×2.7641 against the curve alone at ×3.3986 / ×3.0413,
inside the 2% acceptance caps on both tests. Age still matters for the
launch odds below, where it is a full-strength regressor — that is the
other place `listed_at` enters the board.

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
| Log-log + shrunk growth/age (radar-6, ×0.05) | 3.4314 | — |

The decisions follow the rule set before the test — drop a term unless it
improves the LOO median fold error; adopt the chain factor only on a ≥5%
improvement with a monotone sensible effect; adopt a new estimator only
if it beats flat by ≥5% on BOTH leave-one-out and the time split; and
the radar-6 addition — a shrunk term is adopted only if it stays within
2% of the curve on BOTH tests (LOO ≤ ×3.4667, WF ≤ ×3.1007):

- **Growth: shrunk, not dropped, not trusted.** At full strength it
  makes the LOO miss worse (×3.3986 → ×3.7632) and its coefficient is
  unstable across halves — but it helps the walk-forward test (×3.04 →
  ×2.81), so it is regime-dependent. At 0.05× strength the joint
  growth/age model reads LOO ×3.4314 / WF ×2.7641, inside both 2% caps.
- **Maturity: shrunk, not dropped, not trusted.** At full strength it
  makes the LOO miss worse (×3.6518) and destroys the time split
  (×10.07) — the older half has almost no age variance to fit it on.
  At 0.05× strength, jointly with growth, it is inside both caps.
- **Chain factor: dropped.** +0.51% improvement on the peer model, below
  the 5% bar, and the residuals are not monotone in chain count. (Note:
  the stage-5 row is cumulative — curve + category + family + growth +
  age + chains, ridge λ=8 — while a chain-only OLS re-run gives LOO
  ×3.8044 / WF ×3.0285. Different variant, same conclusion.)
- **Category factors: dropped.** Shrunk category mean log-residuals
  (prior k=6, capped to [0.4, 2.5]) make the LOO miss worse (×3.3986 →
  ×3.7775) — the same small-sample noise that sank the category medians.
  52 signals were tested for the value model in total (category, family,
  growth, age, chains, and 47 more); 0 terms were kept at full strength.
- **Peer multiple: replaced by the fitted log-log curve.** The curve is
  adopted under the rule set before the test, and it clears the bar by a
  wide margin: +33.0% on leave-one-out (×5.0697 → ×3.3986) and +42.7%
  on the time split (×5.3090 → ×3.0413). The shrinkage blend from round
  1 (`(n × category median + k × global) / (n + k)`: k=3 gives ×5.1653,
  k=6 gives ×5.1983 — better than category medians, still worse than
  flat) is superseded: the curve beats it too, on both tests.
- **Quadratic size curve: tested, not adopted.** A free quadratic in log
  TVL improves leave-one-out to ×3.3760 and walk-forward to ×2.6704, but
  a bootstrap finds it better only 40% of the time — a coin flip, not a
  model.

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
| radar-6 shrunk growth/age (older-fit) | 2.7641 |
| Flat global median (older-fit) | 5.3090 |
| Peer-only (older-fit medians) | 5.2043 |
| radar-3 (older-fit peers) | 5.8006 |

The same ordering as LOO: the curve wins again, by 42.7% against flat,
and the shrunk growth/age model improves the time split further (×3.04
→ ×2.76) while staying within 2% of the curve on leave-one-out. This is a
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

Each row carries `odds`, the probability that a protocol with its TVL,
growth, age, category and family has a token recorded, estimated from
the snapshot's own record (tokenized vs pre-token among the 758), and
`expected_value_usd = round(implied_value_usd × odds)`.

Method (radar-6, model v2c): a logistic regression on all 758 protocols,
fitted on every run —

```
logit P(token) = −2.8114 + 0.1098·logTVL − 1.8512·growth + 0.4528·age_years
                 + category_offset(k=3) + family_offset(k=3)
```

`growth` is the 7-day change as a fraction, clamped to −60%/+120%,
with a missing 7-day change at −8.23% (the training median);
`age_years` is the years since `listed_at`, with an undated protocol at
1.8535 years (the pre-token median). The category and family offsets are
count-shrunk toward the base rate with prior strength k=3:
`offset = logit((t + k·p0)/(n + k)) − logit(p0)`, where `p0 = 0.5488`
is the overall token rate (416 of 758) and `t`/`n` are the tokenized
count and total in that category or family. The family is the first word
of the protocol's name, lowercased. The largest offsets: Risk Curators
−1.87, Token Locker +1.40, Launchpad +1.23, CEX −1.22, Lending +1.06,
Synthetics +1.04; families aave +1.40, frax/hyperliquid/jupiter/kinetiq/
lista/meteora/sunswap +1.23.

This replaces the radar-5 odds (a per-category cell with age, k=5
shrinkage toward the bucket rate). The stage table, Brier score by
stage (758 protocols, leave-one-out / walk-forward):

| Stage | LOO | Walk-forward | Verdict |
| --- | --- | --- | --- |
| Intercept only (base rate) | 0.2483 | 0.3176 | kept (baseline) |
| + log TVL | 0.2482 | 0.3190 | dropped — WF worse |
| + category offset | 0.2251 | 0.3159 | kept, k=20 |
| + family offset | 0.2195 | 0.3142 | kept, k=20 |
| + growth (corrected) | 0.2039 | 0.3071 | kept, k=5 |
| + age (years listed) | 0.1845 | 0.2180 | kept, k=3 — all k pass |
| + log chains | 0.1822 | 0.2192 | dropped — WF worsens |

The shipped model is the stage-6 fit (Brier **0.1845** leave-one-out /
**0.2180** walk-forward) against the radar-5 cell baseline of 0.2075 /
0.2836 and the base rate's 0.2483 / 0.3176 — a 41.9% improvement over
the base rate on walk-forward. Stage 4 is the k=3 near-miss: the offsets
look attractive but the category counts are too thin to trust, so the
shipped model uses k=3 shrinkage and stops one stage short of the best
Brier (0.1822, which fails walk-forward). A units bug in the earlier
test is worth stating: `change_7d` is in percent and was clamped raw,
so 87.5% of comps sat at the floor; the corrected growth coefficient
is stable across cohorts (−1.70 older half vs −1.85 full fit), and the
gains hold after the correction.

Calibration (walk-forward test half): mean predicted 0.427 vs actual
0.358. Terciles (predicted → actual): 0.225 → 0.206, 0.404 → 0.346,
0.652 → 0.523. Example odds: Steakhouse Financial 10.6% (cat −1.87,
fam −0.55), Sentora Curator 8.4% (cat −1.87, fam −0.55), Nucleus 46.7%
(cat +0.22, fam −0.55), USDD 39.1% (cat −0.17, fam −0.55). Odds across
the board run 0.0088–0.8396 (median 0.2713). The highest expected value
is USDD at $21,158,281, just ahead of Polymarket International at
$18,843,678 — odds never outrank value.

**P(token recorded) means whether the protocol records a token at all**
(mcap, gecko_id or symbol in DefiLlama) — not whether it launches one.
A protocol can record a token without launching one, and the odds do
not distinguish the two.

**Odds is a display and second-sort field only.** The board's primary
rank stays by implied value, and the gate requires non-increasing
implied value with rank. A high-value protocol with low odds stays high
on the board; its odds say only that its cohort rarely records a token.

## P10–P90 and P25–P75 ranges

Each row carries `p10_usd` and `p90_usd`: the implied value times the
10th and 90th percentiles of the final model's leave-one-out log
residuals (`log(actual/pred)`), exponentiated back to multiplicative
factors. Global factors are **×0.0619 / ×8.6298**. Where a category has
≥10 comps, its own residuals set the band instead: Lending ×0.0271 /
×9.9070, Dexs ×0.1583 / ×5.8359. The ≥10 bar is the choice: below it a
quantile of 10–15 residuals is mostly noise, so the global band applies.

Each row also carries `p25_usd` and `p75_usd`: the implied value times
the 25th and 75th percentiles of the same residuals — the middle 50% of
the model's misses. Global factors are **×0.3061 / ×4.1939**, so the
P25–P75 band is **13.7× wide** (vs ×139 for P10–P90). Per-category:
Lending ×0.1098 / ×1.4146 (12.9× wide), Dexs ×0.2273 / ×5.4384 (23.9×
wide). The P25–P75 band is the range the board shows per row, because
a ×139 band says almost nothing about where the value sits; the P10–P90
band is the honest outer range, shown under the point estimate.

Coverage, measured on the same 128 comps: the shipped P10–P90 bands
(per-category where available, global otherwise) hold **78.9%** (101 of
128); the all-global band holds **79.7%** (102 of 128). The shipped
P25–P75 bands hold **52.3%** (67 of 128); the all-global P25–P75 band
holds **50.0%** (64 of 128). The per-category bands cover slightly worse
than the global band — they are noisier at n=11–15 — and that is
reported rather than rounded away.

A note on the 78.9%: the spec's 80.5% (103 of 128) comes from the
hat-matrix leave-one-out; the build refits exactly, as radar-5 did, and
the exact refit gives 78.9%. The other three coverage numbers match the
spec exactly (all-global P10–P90 79.7%, P25–P75 52.3%, all-global
P25–P75 50.0%). The bands narrowed on the top side against radar-4 (P90
×13.28 → ×8.63) and barely moved on the bottom (P10 ×0.0639 → ×0.0619):
the curve's misses are less one-sidedly high than the peer medians'
were. The bands are still wide: a P90 of ×8.6 means the model cannot
rule out a launch worth most of an order of magnitude more than the
point estimate, and a P10 of ×0.06 means it cannot rule out one worth
almost nothing.

## What is ranked, and what is set aside

- **Ranked:** protocols whose record carries no token at all (`mcap_usd`,
  `gecko_id` and `symbol` all null). All 40 watchlist slugs, plus every
  pre-token protocol outside the watchlist that passes the eligibility test
  below — 157 of them in this snapshot, 197 rows in all. The test is the
  snapshot's own watchlist rule, applied to every board candidate alike
  (watchlist and non-watchlist), so a non-watchlist row cannot slip through
  on a category or a name the watchlist would have refused. The board runs
  $89,530,595 (Steakhouse Financial) down to $3,170,335 (Monolith Market),
  $2,253,874,267 in all.
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
other row: Sentora Curator (#2, $88,878,622), Polymarket International
(#9), Defi Saver Asset Management (#12), CIAN Yield Layer (#13), Mellow
Core (#15), BitFi Basis (#19), Figure Markets Prime (#25), Theo Network
thUSD (#29), Figure Markets Exchange (#31), Avant avUSD (#36), Extended
Perps (#39), Stellar DeFi Hub (#43), Loopscale Lending (#45), IPOR
Fusion (#48), Circle Gateway (#49), Arcus Perps (#51), USDCx (#54), Solv
Strategies (#55), AZverse Perps (#59) and Nado Spot (#60). The board
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

The one same-family signal: **Solv Strategies** (#55, $11,815,412)
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
as arguments. Step 2 carries the budget line (deposit + gas + time +
hold, expected and P10 nets, verdict); step 7 is a verification step
naming the main chain, the TVL, and the TVL level below which the
position should be reconsidered (half the current TVL), plus the
deposit needed for the plan to pay when the row is capped.

The steps are costed by the rules in `lib/farm.ts`, and every row also
carries a `cost_plan` in `data.js` with the arithmetic behind the plan.
The cost inputs are November 2026 figures (see `farm-costs.md` for the
sources): gas by chain, the 3-month T-bill at 4.16%, and the position
yields below. They are operational estimates, not snapshot figures and
not a quote for any moment: gas moves with congestion, and the reader
can check any figure against a block explorer or a gas tracker before
moving funds.

- **Gas (full plan).** The whole plan's gas, not just deposit + claim:
  amortised on-ramp ($0.90) + second-chain setup ($1.00 + the deposit
  gas) + deposit gas + weekly check-ins ($0.10/week) + claim gas (× the
  number of chains, capped at 2) + withdraw gas. Per-chain deposit/claim
  gas: Ethereum/Tron/Bitcoin $2/$1, Base/Arbitrum $0.50/$0.25, Optimism
  $0.75/$0.50, Polygon $0.25/$0.25, Binance $0.50/$0.25, Solana
  $0.10/$0.10; any chain not listed takes the $0.50/$0.25 default.
  A swap (for swap-category protocols) costs 0.15% of the deposit.
- **Deposit (sized, 2×-cover rule).** Each row's deposit is sized to the
  minimum that makes the expected gross cover twice the costs:
  `deposit = clamp(deposit_min, $50, $10,000)`, where `deposit_min` is
  the deposit at which gas is at most 10% (floored at $50), then one
  recompute at that deposit. The 2×-cover rule is the spec's sizing:
  the plan is built to pay twice over at the expected value, not to
  maximise the deposit. Most rows size at the $10,000 cap.
- **Gross.** `(deposit / TVL) × value × 0.10 × 3`: the deposit's share of
  the protocol's TVL times the launch value times `AIRDROP_SHARE = 0.10`
  (an explicit assumption, stated as one: 10% of the implied launch
  value is assumed to reach farmers, the rest going to the team,
  investors, the treasury and everyone else the launch pays) times the
  **activity multiplier ×3** — a dedicated farmer earns about 3× the
  capital-pro-rata share of an airdrop (the median airdrop payout is
  ~$1,000 against a $0.35 pro-rata share; ×3 is conservative). TVL
  cancels out of this: the gross is `deposit × multiple × 0.10 × 3`,
  so a row's gross is set by its multiple, not its size.
- **Opportunity cost (yield-netted).** `deposit × max(0, 0.0416 −
  position_yield) × hold_days / 365` — the 4.16% T-bill rate less the
  yield the position itself pays. Position yields: DEX/LP positions 5%,
  yield-bearing positions (vaults, lending, CDPs, liquid staking) 4%,
  non-yielding positions 0%. A 5% LP position has no opportunity cost
  (its yield beats the T-bill); a 0% position pays the full 4.16%.
- **Net.** `net = gross − gas − opportunity cost`, whole dollars, at
  P10 and at the expected value. `net_per_hour = net / (time_minutes /
  60)`, where time is the setup (5 + 15 + 15-or-10 + 5 minutes) plus
  10 minutes to claim, 10 minutes to verify, and 10 minutes a week for
  `ceil(hold_days / 7)` weekly check-ins (110 minutes for a 30-day
  hold).
- **Verdict — at the row's own sized deposit, two views.** The shipped
  verdict is evaluated at the sized deposit, not at a fixed reference
  capital: `verdict` is the P10 net, `verdict_expected` the expected
  net. Thresholds: FARM when `net > $50` AND `net/hour > $5`; THIN when
  `net > $0`; SKIP otherwise. The dashboard's Verdict/Net columns
  recompute the same arithmetic at the capital the reader selects
  ($100 / $1,000 / $10,000); the detail drawer shows both the shipped
  sized-deposit plan (the budget line) and the selected-capital plan.
  `deposit_needed_usd` is the deposit at which a capped SKIP row would
  pay (2-iteration estimate; see below).

The honest result on this snapshot: **at the sized deposits, the
expected verdict is 0 FARM / 188 THIN / 9 SKIP, and the P10 verdict is
0 FARM / 42 THIN / 155 SKIP.** No row farms at its sized deposit. The
reason is the sizing rule itself, not the cost numbers: sizing to the
minimum 2×-cover deposit caps the net at roughly the costs ($3–13), and
the FARM bar is $50 net and $5/hour. At a fixed $5,000 deposit the same
cost model gives 129 FARM / 55 MARGINAL / 4 THIN / 9 SKIP — the costs
are not what blocks farming, the sizing is. The spec's acceptance rule
says to stop and report a 0 FARM count rather than tune the sizing to
compensate, and that is what this build does: the sizing is kept
faithful and the 0 FARM is reported with this diagnosis. The portfolio
acceptance is still met — the top 5 by expected net/hour at the sized
deposit are all positive (USDD +$7/hr, BIMA CDP +$7/hr, Upshift +$5/hr,
CIAN +$5/hr, Plume +$5/hr).

The largest gross at P10 on the whole board is $52 (August Digital),
and the best net at P10 is $41 (August Digital) after gas and
opportunity cost. The best net at the expected value is $13 (BIMA CDP)
and the best net/hour $7 (USDD). `deposit_needed_usd` is honest for 4
of the 6 capped rows (net +$1 to +$6 at the needed deposit); Sentora
(−$3 at $23,089) and August Digital (−$4 at $22,502) are $3–4 short —
the spec's 2-iteration formula prices the costs at the $50 minimum, so
it understates the true fixed-point deposit (~$29,143 / ~$28,000).
The thresholds were not moved to manufacture a spread — the columns
say what they say, and the detail view shows both the P10 and the
expected net side by side.

## Determinism

The program reads only the snapshot, uses no clock, no randomness and no
network. Ties in implied value break on slug, so two runs write identical
bytes — verified: two clean runs of `main.ts` into separate directories
produce byte-identical `board.json`, `data.js` and `dossier.json` (each
run ~2.4s, well inside the 120s / 1 CPU / 1024MB envelope; no `Date.now()`
or unseeded randomness anywhere in the entry, including the vendored
library). The validation, odds, ranges and accounting are computed from
the snapshot on every run, never pasted in — rerunning the program
recomputes them. The log-log coefficients are part of that: fitted from
the snapshot's tokenized comps on every run, rounded to 4 decimals when
shipped, and the board is computed from the rounded values. The odds
logistic and its offsets are likewise fitted on every run.
