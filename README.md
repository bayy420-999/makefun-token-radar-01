# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bayy420-999/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bayy420-999/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from DefiLlama's sealed snapshot of 758 protocols. It ranks the 177 pre-token protocols by implied launch value — a log-log comps curve fitted on 128 tokenized peers and tested held-out (leave-one-out median fold error 3.40 vs 5.07 for a flat median) — with launch odds, P10–P90 ranges, and costed farm plans for every row.

## How it works

- **Funnel:** 758 protocols → 342 record no token → 177 ranked. The other 165 pre-token protocols are set aside as wrapped, staked, bridged, versioned, or child products of a token that already trades. Every watchlist protocol (40/40) is on the board.
- **Value model (radar-5):** implied value = TVL × curve multiple, where the curve is a log-log OLS fit on the snapshot's own tokenized comps: log(mcap) = 6.9646 + 0.5223 × log(TVL). Growth, maturity, and chain factors were each tested leave-one-out on the same comps and dropped — none improves the median miss on top of the curve. Launch odds are the shrunken token rate of the protocol's category × age cohort (Brier 0.284 vs 0.318 base); P10–P90 are the 10th/90th percentiles of the leave-one-out residuals (78.9% coverage).
- **Farm plans:** 7 steps per row, each with what it costs and how long it takes, plus a costed verdict (FARM / THIN / SKIP) at a $1,000 deposit. The dashboard recomputes verdicts live at other capitals and airdrop shares.
- **Verification:** the dashboard recomputes every row in-page against the board (177/177 match) and shows the result. `node check-gate.mjs` passes 9/9; the program runs twice byte-identical.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only. Reads the sealed snapshot, writes the ranked board (`board.json`), the dashboard data (`data.js`), copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json`. No network, no clock, no unseeded randomness — two runs write identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2mq8brn9&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
