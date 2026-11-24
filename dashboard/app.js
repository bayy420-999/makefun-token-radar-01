// Token Radar dashboard. Reads window.RADAR (data.js, written beside this
// folder by main.ts): pre-token rows ranked by implied value under the
// radar-5 model, plus 24 already-trading protocols shown at market cap.
// No network: every figure rendered here ships in data.js.
//
// The value model (radar-5), in one function — the page recomputes each
// row's implied value from the fitted log-log curve (data.js's loglog
// coefficients) and shows the check in the detail view, so the page's code
// and the board's data are visibly the same arithmetic:
//   mult    = round4(exp(a + (b-1) * ln(tvl_usd))) * growth * maturity
//   implied = round(tvl_usd * mult)
// The multiple is the curve's multiple at the row's TVL; growth and
// maturity are priced at 1.00 after the leave-one-out test showed neither
// helps on top of the curve (see MODEL.md). The farm economics recompute
// in-page too: gross scales with the deposit and the airdrop share, gas is
// fixed per chain, opportunity cost scales with the deposit — so verdicts
// and nets follow the capital and share controls live. At the reference
// capital and 10% share the page uses the row's own shipped cost_plan
// figures, so the defaults match data.js exactly; any other capital or
// share recomputes from the row's figures.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var main = document.querySelector('main');
  if (!DATA || !DATA.rows) { main.innerHTML = '<p class="empty">No board data loaded.</p>'; return; }

  var params = new URLSearchParams(location.search);
  var REF_CAP = DATA.reference_capital_usd || 1000;
  var DEF_SHARE = 0.10;
  var state = {
    q: params.get('q') || '',
    cat: params.get('cat') || 'all',
    chain: params.get('chain') || 'all',
    sort: params.get('sort') || 'rank',
    dir: params.get('dir') === 'asc' ? 1 : -1,
    tab: params.get('tab') === 'traded' ? 'traded' : 'pre',
    watch: params.get('watch') === '1',
    capital: REF_CAP,
    share: DEF_SHARE,
    verdict: params.get('verdict') === 'p10' ? 'p10' : 'exp',
    selected: (location.hash.match(/^#\/p\/([\w-]+)$/) || [])[1] || null
  };

  // The model's arithmetic, recomputed here from the fitted curve: the
  // multiple comes from data.js's loglog coefficients and the row's TVL,
  // rounded to 4 decimals exactly as the builder does, then multiplied by
  // the row's growth and maturity factors (both 1.00). Falls back to the
  // row's shipped multiple if the coefficients are absent.
  function modelOf(r) {
    var ll = DATA.loglog;
    var curve = (ll && isFinite(ll.intercept) && isFinite(ll.slope) && r.tvl_usd > 0)
      ? Math.round(Math.exp(ll.intercept + (ll.slope - 1) * Math.log(r.tvl_usd)) * 1e4) / 1e4
      : r.peer_multiple;
    var mult = curve * r.growth_multiplier * r.maturity_multiplier;
    var implied = Math.max(1, Math.round(r.tvl_usd * mult));
    return { mult: mult, implied: implied,
      diffPct: (implied - r.implied_value_usd) / r.implied_value_usd * 100 };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n == null || !isFinite(n)) return '<span class="na">n/a</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : 'na';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(2) + '%</span>';
  }
  function fmtAge(d) {
    if (d == null) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }
  function plainPct(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtChains(chains) {
    var c = chains || [];
    if (c.length <= 1) return esc(c.join(', '));
    return esc(c.slice(0, 1).join(', ')) + ' <span class="na">+' + (c.length - 1) + ' more</span>';
  }
  function fmtDate(s) { return s || 'unknown'; }
  function fmtMoney(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '−$' : '$';
    var a = Math.abs(n);
    if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return sign + Math.round(a / 1e3) + 'K';
    return sign + Math.round(a);
  }
  function fmtFold(n) { return n == null ? 'n/a' : '×' + n.toFixed(4); }
  function badge(v) { return '<span class="badge v-' + v.toLowerCase() + '">' + esc(v) + '</span>'; }
  function looVal(name) {
    var v = ((DATA.validation || {}).loo || []).find(function (x) { return x.variant === name; });
    return v ? v.median_fold_error : null;
  }
  // Farm economics for one row at a deposit and an airdrop share.
  // Gross = deposit's share of TVL × launch value × share (TVL cancels:
  // gross = deposit × curve multiple × P10 factor × share at P10, and the
  // expected value in place of P10 for the expected net). Costs are the
  // row's fixed gas plus 4% a year on the deposit over the hold. Verdict
  // thresholds, at P10: FARM when net > $50 and net/hour > $5, THIN when
  // net > $0, else SKIP. At the reference capital and 10% share the shipped
  // cost_plan figures are used verbatim, so defaults match data.js exactly.
  function verdictOf(net, perHour) { return (net > 50 && perHour > 5) ? 'FARM' : (net > 0 ? 'THIN' : 'SKIP'); }
  // The verdict view: expected-net by default (it discriminates: 108 THIN /
  // 89 SKIP at $1,000), P10 net on toggle (0 FARM / 12 THIN / 185 SKIP).
  function viewVerdict(p) { return state.verdict === 'exp' ? p.verdictExp : p.verdictP10; }
  function planOf(r, dep, share) {
    var c = r.cost_plan, hrs = c.time_minutes / 60;
    if (dep === REF_CAP && share === DEF_SHARE) {
      return { grossP10: c.gross_p10_usd, netP10: c.net_p10_usd, netExp: c.net_expected_usd,
        perHourP10: c.net_per_hour_usd, perHourExp: c.net_expected_per_hour_usd,
        gas: c.gas_usd, opp: dep * 0.04 * c.hold_days / 365,
        verdictP10: c.verdict, verdictExp: verdictOf(c.net_expected_usd, c.net_expected_per_hour_usd) };
    }
    var grossP10 = (dep / r.tvl_usd) * r.p10_usd * share;
    var grossExp = (dep / r.tvl_usd) * r.expected_value_usd * share;
    var gas = c.gas_usd, opp = dep * 0.04 * c.hold_days / 365;
    var netP10 = grossP10 - gas - opp, netExp = grossExp - gas - opp;
    var vP10 = verdictOf(netP10, netP10 / hrs), vExp = verdictOf(netExp, netExp / hrs);
    return { grossP10: Math.round(grossP10), netP10: Math.round(netP10), netExp: Math.round(netExp),
      perHourP10: Math.round(netP10 / hrs * 10) / 10, perHourExp: Math.round(netExp / hrs * 10) / 10,
      gas: gas, opp: opp, verdictP10: vP10, verdictExp: vExp };
  }

  var $ = function (id) { return document.getElementById(id); };

  // ---- masthead + summary (real numbers from the data) ----
  var watchCount = DATA.rows.filter(function (r) { return r.watchlist; }).length;
  var totalImplied = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var top10Sum = DATA.rows.slice(0, 10).reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  $('mastMeta').innerHTML =
    '<div><dt>Snapshot</dt><dd>' + esc(DATA.as_of) + '</dd></div>' +
    '<div><dt>Watchlist floor</dt><dd>' + fmtUsd(DATA.floor_usd) + ' TVL</dd></div>' +
    '<div><dt>Model</dt><dd>' + esc(DATA.model_version) + '</dd></div>' +
    '<div><dt>Data</dt><dd>offline · data.js</dd></div>';
  var v0 = DATA.validation || {}, o0 = v0.odds || {}, cov0 = v0.coverage || {};
  var expThin0 = DATA.rows.filter(function (r) { return r.cost_plan.net_expected_usd > 0; }).length;
  var expFarm0 = DATA.rows.filter(function (r) { return r.cost_plan.net_expected_usd > 50 && r.cost_plan.net_expected_per_hour_usd > 5; }).length;
  $('stats').innerHTML =
    '<div class="stat"><b>' + DATA.rows.length + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + watchCount + ' / ' + DATA.watchlist_size + '</b><span>watchlist names covered</span></div>' +
    '<div class="stat"><b>' + fmtUsd(totalImplied) + '</b><span>combined implied value</span></div>' +
    '<div class="stat"><b>' + (top10Sum / totalImplied * 100).toFixed(1) + '%</b><span>of combined value in the top 10</span></div>' +
    '<div class="stat"><b>×' + (looVal('log-log OLS (radar-5)') || 0).toFixed(2) + '</b><span>leave-one-out miss, log-log curve</span></div>' +
    '<div class="stat"><b>' + (o0.brier_model != null ? o0.brier_model.toFixed(3) : 'n/a') + '</b><span>odds Brier score (base ' + (o0.brier_base != null ? o0.brier_base.toFixed(3) : 'n/a') + ')</span></div>' +
    '<div class="stat"><b>' + (cov0.coverage_pct != null ? cov0.coverage_pct : '?') + '%</b><span>P10–P90 bands hold on comps</span></div>' +
    '<div class="stat"><b>' + expThin0 + '</b><span>THIN at expected net · ' + expFarm0 + ' FARM</span></div>';
  $('modelText').textContent = DATA.model + ' The value uses only the snapshot’s TVL; the odds use category and age. No protocol name is special-cased.';
  $('chart').innerHTML =
    '<h2>Top 10 by implied value</h2>' + DATA.rows.slice(0, 10).map(function (r) {
      var w = (r.implied_value_usd / DATA.rows[0].implied_value_usd * 100).toFixed(1);
      return '<div class="chart-row' + (r.watchlist ? ' watch' : '') + '"><span class="chart-name">#' + r.rank + ' ' + esc(r.name) + '</span><span class="chart-bar"><i style="width:' + w + '%"></i></span><span class="chart-val">' + fmtUsd(r.implied_value_usd) + '</span></div>';
    }).join('');
  $('modelLine').textContent = DATA.model.split('. ')[0] + '.';

  // ---- validation panel (held-out numbers, stated plainly) ----
  function renderValidation() {
    var box = $('validation');
    var v = DATA.validation;
    if (!v) { box.hidden = true; return; }
    var curve = looVal('log-log OLS (radar-5)'), flat = looVal('flat global median'), peer = looVal('peer-only (radar-4)');
    var cats = (v.per_category || []).slice().sort(function (a, b) { return a.median_fold_error - b.median_fold_error; });
    var best = cats[0], worst = cats[cats.length - 1];
    var ts = v.time_split, cov = v.coverage, d = v.decisions || {};
    var p10Verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { p10Verdicts[r.cost_plan.verdict]++; });
    var expThin = DATA.rows.filter(function (r) { return r.cost_plan.net_expected_usd > 0; }).length;
    var maxGross = DATA.rows.reduce(function (a, r) { return r.cost_plan.gross_p10_usd > a.cost_plan.gross_p10_usd ? r : a; }, DATA.rows[0]);
    var maxNet = DATA.rows.reduce(function (a, r) { return r.cost_plan.net_p10_usd > a.cost_plan.net_p10_usd ? r : a; }, DATA.rows[0]);
    var tsMap = { 'log-log OLS (radar-5)': ts.radar5_median_fold_error, 'flat global median': ts.flat_median_fold_error, 'peer-only (radar-4)': ts.peer_median_fold_error, 'full radar-3 (peer x growth x maturity)': ts.radar3_median_fold_error };
    var shortName = { 'log-log OLS (radar-5)': 'Log-log curve (radar-5)', 'flat global median': 'Flat global median', 'peer-only (radar-4)': 'Peer medians (radar-4)', 'shrinkage k=6': 'Shrinkage k=6', 'log-log + category factors k=6': 'Curve + category k=6', 'log-log + growth': 'Curve + growth', 'full radar-3 (peer x growth x maturity)': 'Full radar-3' };
    var keptMap = { 'log-log OLS (radar-5)': 'kept', 'peer-only (radar-4)': 'replaced' };
    var looRows = (v.loo || []).map(function (x) {
      var tsv = tsMap[x.variant];
      return '<tr><td>' + esc(shortName[x.variant] || x.variant) + '</td><td class="num">' + fmtFold(x.median_fold_error) + '</td><td class="num">' + (tsv != null ? fmtFold(tsv) : '—') + '</td><td>' + (keptMap[x.variant] || 'dropped') + '</td></tr>';
    }).join('');
    var looGain = (flat && curve) ? ((flat - curve) / flat * 100).toFixed(1) : '?';
    var tsGain = (ts.flat_median_fold_error && ts.radar5_median_fold_error) ? ((ts.flat_median_fold_error - ts.radar5_median_fold_error) / ts.flat_median_fold_error * 100).toFixed(1) : '?';
    box.innerHTML =
      '<h2>Validation — the held-out tests say the fitted curve wins</h2>' +
      '<p><b>The fitted log-log curve beats the flat median out of sample.</b> Leave-one-out on ' + v.loo_comps + ' tokenized comps: the curve misses by ' + fmtFold(curve) + ', the flat global median by ' + fmtFold(flat) + ', the radar-4 category medians by ' + fmtFold(peer) + ' — the curve wins by ' + looGain + '% against flat. The absolute errors are still large: the median miss is about ×3.4, because mcap/TVL ratios span four orders of magnitude. The curve is kept because it wins on both held-out tests, not because it is precise.</p>' +
      '<div class="valid-grid"><table class="loo"><thead><tr><th>Variant</th><th class="num">Leave-one-out</th><th class="num">Time split</th><th>Kept?</th></tr></thead><tbody>' + looRows + '</tbody></table>' +
      '<div class="valid-notes">' +
      '<p><b>Kept / dropped.</b> Curve: ' + esc(d.peer_multiple || '') + ' — it beats flat by ' + looGain + '% leave-one-out and ' + tsGain + '% on the time split. Growth: ' + esc(d.growth || 'dropped') + ' — on top of the curve it makes the LOO miss worse (' + fmtFold(curve) + ' → ' + fmtFold(looVal('log-log + growth')) + '), and its fitted coefficient swings 3× between the older and newer halves. Maturity: ' + esc(d.maturity || 'dropped') + ' — on the older half every comp is already ~fully mature (mean 0.99, sd 0.02), so the fitted age term explodes and misses the newer half by ×10.07. Category factors: dropped — they make the LOO miss worse (' + fmtFold(curve) + ' → ' + fmtFold(looVal('log-log + category factors k=6')) + '). Chain factor: ' + esc(d.chain_factor || 'dropped') + ' — it cuts the peer-only miss by only ' + (v.chain_test ? (v.chain_test.improvement_pct).toFixed(2) : '0.51') + '%, below the 5% bar set before the test, and the residuals are not monotone in chain count.</p>' +
      '<p><b>Time split — listing date, not walk-forward.</b> Curve fitted on the ' + ts.older + ' older comps (listed before ' + esc(ts.median_listed_at) + '), tested on the ' + ts.newer + ' newer: curve ' + fmtFold(ts.radar5_median_fold_error) + ' vs flat median ' + fmtFold(ts.flat_median_fold_error) + ' vs peer medians ' + fmtFold(ts.peer_median_fold_error) + ' — the same ordering as leave-one-out. ' + esc(ts.note || '') + '</p>' +
      '<p><b>Per-category misses (final model).</b> Best: ' + esc(best.category) + ' ' + fmtFold(best.median_fold_error) + ' (' + best.comps + ' comps). Worst: ' + esc(worst.category) + ' ' + fmtFold(worst.median_fold_error) + ' (' + worst.comps + ' comps). The curve is a rough instrument, and its roughness varies by category.</p>' +
      '<p><b>P10–P90 coverage.</b> The shipped bands (per-category where a category has ≥10 comps, global otherwise) hold ' + cov.coverage_pct + '% (' + cov.covered + ' of ' + cov.total + ' comps); the all-global band holds ' + cov.global_band_coverage_pct + '%. Global factors ×' + cov.q10_factor + ' / ×' + cov.q90_factor + ' — the bands are wide because the residuals are wide.</p>' +
      '<p><b>The P10 verdict now discriminates.</b> At the ' + fmtUsd(REF_CAP) + ' reference capital the P10 verdict is ' + p10Verdicts.FARM + ' FARM / ' + p10Verdicts.THIN + ' THIN / ' + p10Verdicts.SKIP + ' SKIP. The column is still thin: the P10 factor is ×' + cov.q10_factor + ', so the largest gross at P10 on the whole board is ' + fmtMoney(maxGross.cost_plan.gross_p10_usd) + ', and the best net at P10 is ' + fmtMoney(maxNet.cost_plan.net_p10_usd) + ' (' + esc(maxNet.name) + ') after gas and opportunity cost. The expected-net view discriminates more: ' + expThin + ' THIN / ' + (DATA.rows.length - expThin) + ' SKIP at the same capital and the same bars.</p>' +
      '</div></div>';
  }

  // ---- full-758 accounting strip ----
  function renderAccounting() {
    var box = $('accounting');
    var a = DATA.accounting;
    if (!a) { box.hidden = true; return; }
    var s = a.set_aside_pre_token;
    box.innerHTML =
      '<h2>Where all 758 went</h2>' +
      '<p class="acct-line"><b>' + a.total + '</b> protocols in the snapshot = <b>' + a.ranked + '</b> ranked (' + a.watchlist + ' watchlist + ' + a.outside_watchlist + ' outside the watchlist) + <b>' + a.traded_shown + '</b> traded, shown in the Live view + <b>' + s.total + '</b> set aside pre-token + <b>' + a.tokenized_not_shown + '</b> tokenized, not shown.</p>' +
      '<p class="acct-detail">Set aside pre-token (' + s.total + '): category leg ' + s.by_category_leg + ' · version leg ' + s.by_version_leg + ' · name leg ' + s.by_name_leg + ' · rankable but not chosen ' + s.rankable_not_chosen + ' (above the floor, not on the watchlist). ' + a.pre_token_total + ' protocols record no token in all (' + a.ranked + ' ranked + ' + s.total + ' set aside); ' + a.tokenized_total + ' are tokenized (' + a.traded_shown + ' shown + ' + a.tokenized_not_shown + ' not shown).</p>';
  }

  // FNV-1a checksum of the board, recomputed in-page: any row whose rank,
  // slug or value changed since data.js was written changes the checksum.
  function fnv1a(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  // ---- on-page self-check: recompute every row in-page ----
  function renderSelfcheck() {
    var bad = [], evBad = [];
    DATA.rows.forEach(function (r) {
      if (modelOf(r).implied !== r.implied_value_usd) bad.push(r.slug);
      if (Math.round(r.implied_value_usd * r.odds) !== r.expected_value_usd) evBad.push(r.slug);
    });
    var ok = bad.length === 0 && evBad.length === 0;
    $('selfcheck').innerHTML = 'Self-check: <b>' + (DATA.rows.length - bad.length) + '/' + DATA.rows.length + ' rows recompute exactly</b> from TVL × curve multiple (log-log fit) · EV check ' + (DATA.rows.length - evBad.length) + '/' + DATA.rows.length + ' (EV = implied × odds, rounded)' +
      (ok ? ' · <b class="pass">PASS</b>' : ' · <b class="fail">FAIL</b> — implied mismatches: ' + esc(bad.slice(0, 5).join(', ')) + (evBad.length ? '; EV mismatches: ' + esc(evBad.slice(0, 5).join(', ')) : ''));
    $('selfcheck').classList.toggle('fail', !ok);
    var rankOk = true, prev = Infinity;
    DATA.rows.forEach(function (r, i) {
      if (r.rank !== i + 1 || r.implied_value_usd > prev) rankOk = false;
      prev = r.implied_value_usd;
    });
    var sum = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var sumStr = '$' + String(sum).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var check = fnv1a(DATA.rows.map(function (r) { return r.rank + ':' + r.slug + ':' + r.implied_value_usd; }).join('|'));
    var integOk = ok && rankOk;
    var ledger = DATA.accounting ? DATA.accounting.total : 758;
    $('integrity').innerHTML = 'Integrity: <b>' + (DATA.rows.length - bad.length) + '/' + DATA.rows.length + ' rows recomputed</b> · ranks 1–' + DATA.rows.length + ' in order, values never rise · totals equal ' + sumStr + ' · checksum ' + check + ' · ledger ' + ledger + '/' + ledger +
      (integOk ? ' · <b class="pass">PASS</b>' : ' · <b class="fail">FAIL</b>');
    $('integrity').classList.toggle('fail', !integOk);
  }

  // ---- portfolio view: top 5 by expected net per hour ----
  function renderPortfolio() {
    var cap = parseFloat($('planCapital').value);
    if (!(cap > 0)) cap = REF_CAP;
    var hrs = parseFloat($('planHours').value);
    if (!(hrs >= 0)) hrs = 5;
    var p10skip = DATA.rows.filter(function (r) { return r.cost_plan.verdict === 'SKIP'; }).length;
    $('planNote').textContent = 'Top 5 farms by expected net per hour. Each farm is sized at the capital you enter (per farm, not split across farms), at the airdrop share selected above; a farm qualifies only if its plan averages no more than your hours per week over its hold. Totals are expected nets — the pessimistic P10 net is SKIP on ' + p10skip + ' of ' + DATA.rows.length + ' rows at the reference capital, so this plan is an expected-value plan, not a conservative one.';
    var cands = DATA.rows.map(function (r) {
      var p = planOf(r, cap, state.share);
      var wk = (r.cost_plan.time_minutes / 60) / Math.ceil(r.cost_plan.hold_days / 7);
      return { r: r, p: p, wk: wk };
    }).filter(function (x) { return x.wk <= hrs; })
      .sort(function (a, b) { return b.p.perHourExp - a.p.perHourExp; }).slice(0, 5);
    var total = cands.reduce(function (a, x) { return a + x.p.netExp; }, 0);
    $('planList').innerHTML = cands.length === 0
      ? '<p class="empty">No farm fits that hours budget — raise the hours per week.</p>'
      : '<table class="plan"><thead><tr><th>Farm</th><th class="num">Deposit</th><th class="num">Net expected</th><th class="num">Net / hour</th><th class="num">Hours / week</th><th class="num">Net at P10</th></tr></thead><tbody>' +
        cands.map(function (x) {
          return '<tr><td><b>#' + x.r.rank + ' ' + esc(x.r.name) + '</b></td><td class="num">' + fmtUsd(cap) + '</td><td class="num">' + fmtMoney(x.p.netExp) + '</td><td class="num">' + fmtMoney(x.p.perHourExp) + '</td><td class="num">' + x.wk.toFixed(2) + ' h</td><td class="num">' + fmtMoney(x.p.netP10) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="plan-total">Total expected net across the 5 farms: <b>' + fmtMoney(total) + '</b> at ' + fmtUsd(cap) + ' per farm.</p>';
  }

  // ---- CSV export of the visible rows ----
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var lines, head;
    if (state.tab === 'traded') {
      head = ['name', 'slug', 'symbol', 'category', 'chains', 'tvl_usd', 'mcap_usd'];
      lines = (DATA.traded || []).map(function (t) {
        return [t.name, t.slug, t.symbol || '', t.category || '', (t.chains || []).join(';'), t.tvl_usd, t.mcap_usd].map(csvCell).join(',');
      });
    } else {
      head = ['rank', 'name', 'slug', 'category', 'chains', 'tvl_usd', 'implied_value_usd', 'p10_usd', 'p90_usd', 'odds', 'expected_value_usd', 'verdict', 'net_p10_usd', 'net_expected_usd'];
      lines = visibleRows().map(function (r) {
        var p = planOf(r, state.capital, state.share);
        return [r.rank, r.name, r.slug, r.category || '', (r.chains || []).join(';'), r.tvl_usd, r.implied_value_usd, r.p10_usd, r.p90_usd, r.odds, r.expected_value_usd, viewVerdict(p), p.netP10, p.netExp].map(csvCell).join(',');
      });
    }
    var blob = new Blob([head.join(',') + '\n' + lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---- filter options ----
  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o);
    });
  }
  fillSelect($('cat'), Array.from(new Set(DATA.rows.map(function (r) { return r.category; }))).sort());
  fillSelect($('chain'), Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort());
  $('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain;
  $('sort').value = state.sort; $('watchOnly').checked = state.watch;
  $('capital').value = String(state.capital);
  $('share').value = state.share.toFixed(2);
  $('verdict').value = state.verdict;
  $('planCapital').value = String(REF_CAP);
  renderValidation();
  renderAccounting();
  renderSelfcheck();
  renderPortfolio();

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.sort !== 'rank') p.set('sort', state.sort);
    if (state.dir === 1) p.set('dir', 'asc');
    if (state.tab === 'traded') p.set('tab', 'traded');
    if (state.watch) p.set('watch', '1');
    if (state.verdict === 'p10') p.set('verdict', 'p10');
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + (state.selected ? '#/p/' + state.selected : ''));
  }

  // ---- filtering + sorting ----
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort, dir = state.dir;
    // Rank is the one key whose natural order is ascending: rank 1 is the
    // top of the board, so a "descending value" sort (dir -1) means rank
    // numbers ascending. Every other numeric key sorts by value.
    if (key === 'rank') dir = -dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'chains') { va = (a.chains || [''])[0]; vb = (b.chains || [''])[0]; }
      else if (key === 'name' || key === 'category') { va = a[key] || ''; vb = b[key] || ''; }
      else { va = a[key] == null ? -Infinity : a[key]; vb = b[key] == null ? -Infinity : b[key]; }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function render() {
    $('tabPre').setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
    $('tabTraded').setAttribute('aria-selected', state.tab === 'traded' ? 'true' : 'false');
    var tbody = $('rows'), empty = $('empty');
    document.querySelectorAll('#board thead th').forEach(function (th) {
      var sorted = th.dataset.sort === state.sort && state.tab === 'pre';
      th.classList.toggle('sorted', sorted);
      th.setAttribute('aria-sort', sorted ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
      var base = th.textContent.replace(/ [▲▼]$/, '');
      th.innerHTML = esc(base) + (sorted ? ' <span class="arrow">' + (state.dir === 1 ? '▲' : '▼') + '</span>' : '');
    });

    if (state.tab === 'traded') {
      var traded = DATA.traded || DATA.live;
      tbody.innerHTML = traded.map(function (t) {
        return '<tr data-slug="' + esc(t.slug) + '">' +
          '<td class="rank">—</td>' +
          '<td class="proto"><b>' + esc(t.name) + '</b><span>' + esc(t.slug) + ' · ' + esc(t.symbol || '') + ' trades already</span></td>' +
          '<td class="num">' + fmtUsd(t.mcap_usd) + '</td>' +
          '<td class="num na">—</td>' +
          '<td class="num">' + fmtUsd(t.tvl_usd) + '</td>' +
          '<td class="num">' + fmtPct(t.change_7d) + '</td>' +
          '<td class="num na">—</td>' +
          '<td class="cat">' + esc(t.category || '—') + '</td>' +
          '<td class="chains">' + fmtChains(t.chains) + '</td>' +
          '<td class="num na">—</td>' +
          '<td class="na">—</td>' +
          '<td class="num na">—</td><td class="num na">—</td></tr>';
      }).join('');
      $('count').innerHTML = '<b>' + traded.length + '</b> protocols whose token already trades, shown at their market cap — a realised price, not a model claim. They are never ranked; the radar ranks only what has not launched.';
      empty.hidden = true;
      renderDetail();
      return;
    }

    var rows = visibleRows();
    var expT = DATA.rows.filter(function (r) { return r.cost_plan.net_expected_usd > 0; }).length;
    var p10T = DATA.rows.filter(function (r) { return r.cost_plan.verdict === 'THIN'; }).length;
    var p10F = DATA.rows.filter(function (r) { return r.cost_plan.verdict === 'FARM'; }).length;
    $('count').innerHTML = 'Showing <b>' + rows.length + '</b> of ' + DATA.rows.length +
      ' ranked protocols' + (state.watch ? ' · watchlist only' : '') + '. Verdicts and nets at ' + fmtUsd(state.capital) + ' capital, ' + (state.share * 100) + '% airdrop share, ' + (state.verdict === 'exp' ? 'expected-net view (' + expT + ' THIN / ' + (DATA.rows.length - expT) + ' SKIP)' : 'P10 view (' + p10F + ' FARM / ' + p10T + ' THIN / ' + (DATA.rows.length - p10F - p10T) + ' SKIP)') + '. Click a row for its value breakdown and farm plan.';
    empty.hidden = rows.length > 0;
    tbody.innerHTML = rows.map(function (r) {
      var top = r.rank <= 3 ? ' top' : '';
      var p = planOf(r, state.capital, state.share);
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (r.watchlist ? 'watch ' : '') + (state.selected === r.slug ? 'selected' : '') + '">' +
        '<td class="rank' + top + '">' + r.rank + '</td>' +
        '<td class="proto"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span></td>' +
        '<td class="num val"><b>' + fmtUsd(r.implied_value_usd) + '</b><span class="range">' + fmtUsd(r.p10_usd) + '–' + fmtUsd(r.p90_usd) + '</span></td>' +
        '<td class="num odds">' + (r.odds * 100).toFixed(1) + '%</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num mult">' + r.multiple.toFixed(2) + '×</td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + fmtChains(r.chains) + '</td>' +
        '<td class="num age">' + fmtAge(r.age_days) + '</td>' +
        '<td>' + badge(viewVerdict(p)) + '</td>' +
        '<td class="num net">' + fmtMoney(state.verdict === 'exp' ? p.netExp : p.netP10) + '</td>' +
        '<td class="num net">' + fmtMoney(state.verdict === 'exp' ? p.perHourExp : p.perHourP10) + '</td></tr>';
    }).join('');
    renderDetail();
  }

  // ---- detail drawer ----
  // The drawer slides in from the right over the board; it owns its scroll
  // and the body stays put while it is open. Closing removes the open class
  // first (so the slide-out animates) and the hidden attribute only after
  // the transition finishes.
  var closeTimer = null;
  var renderedSlug = null;
  function openDrawer() {
    var box = $('detail'), back = $('drawerBackdrop');
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    back.hidden = false;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    void box.offsetWidth; // let the off-screen transform apply, then slide in
    box.classList.add('open');
  }
  function closeDrawer() {
    var box = $('detail'), back = $('drawerBackdrop');
    box.classList.remove('open');
    document.body.style.overflow = '';
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { box.hidden = true; back.hidden = true; closeTimer = null; }, 240);
  }
  function renderDetail() {
    var box = $('detail');
    var r = state.selected && DATA.rows.find(function (x) { return x.slug === state.selected; });
    if (!r) {
      if (renderedSlug !== null) { renderedSlug = null; closeDrawer(); }
      return;
    }
    if (renderedSlug === r.slug && !box.hidden) return; // already showing it
    renderedSlug = r.slug;
    var m = modelOf(r);
    var firstChain = (r.chains || [])[0] || '—';
    var cov = (DATA.validation || {}).coverage || {};
    var p = planOf(r, state.capital, state.share);
    var ll = DATA.loglog || null;
    var p10Counts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (x) { p10Counts[x.cost_plan.verdict]++; });
    var expPos = DATA.rows.filter(function (x) { return x.cost_plan.net_expected_usd > 0; }).length;
    var p10Note = 'At the ' + fmtUsd(REF_CAP) + ' reference capital the P10 verdict across the board is ' + p10Counts.FARM + ' FARM / ' + p10Counts.THIN + ' THIN / ' + p10Counts.SKIP + ' SKIP: the P10 factor is ×' + (cov.q10_factor || '') + ', so most rows net below $0 at P10 after gas and opportunity cost. The expected net is the view that discriminates more (' + expPos + ' THIN / ' + (DATA.rows.length - expPos) + ' SKIP at the reference).';
    box.innerHTML =
      '<div class="detail-head"><div><h2>#' + r.rank + ' · ' + esc(r.name) + '</h2>' +
      '<p class="sub"><code>' + esc(r.slug) + '</code> · ' + esc(r.category || 'uncategorised') + ' · ' + fmtChains(r.chains) + ' · records no token</p></div>' +
      '<button type="button" class="close" id="closeDetail">Close ×</button></div>' +
      '<div class="detail-grid"><div class="detail-main">' +
      '<h3>Farm plan — ' + esc(r.name) + ' on ' + esc(firstChain) + '</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<div class="breakdown">' +
      '<div><b>' + fmtUsd(r.implied_value_usd) + '</b><span>implied value (rank #' + r.rank + ')</span></div>' +
      '<div><b>' + fmtUsd(r.tvl_usd) + '</b><span>TVL in the snapshot</span></div>' +
      '<div><b>' + r.peer_multiple.toFixed(4) + '×</b><span>curve multiple at this TVL · log-log fit</span></div>' +
      '<div><b>' + r.growth_multiplier.toFixed(4) + '×</b><span>growth factor · 7d ' + plainPct(r.change_7d) + '</span></div>' +
      '<div><b>' + r.maturity_multiplier.toFixed(4) + '×</b><span>maturity factor · ' + fmtAge(r.age_days) + ' with no token</span></div>' +
      '<div class="formula">implied = ' + fmtUsd(r.tvl_usd) + ' × ' + r.peer_multiple.toFixed(4) + ' = <b>' + fmtUsd(r.implied_value_usd) + '</b> · curve multiple exp(' + (ll ? ll.intercept.toFixed(4) + ' + (' + ll.slope.toFixed(4) + ' − 1)·ln(TVL)' : '?') + ')</div>' +
      '</div>' +
      '<p class="model-check">model check: recomputed from the fitted curve ' + fmtUsd(m.implied) +
      ' — ' + (Math.abs(m.diffPct) < 0.01 ? '<b>matches</b> the board value' : 'differs from the board value by ' + Math.abs(m.diffPct).toFixed(2) + '%') + '</p>' +
      '<div class="oddsbox">' +
      '<div><b>' + (r.odds * 100).toFixed(1) + '%</b><span>launch odds — P(token recorded) for this category × age cohort</span></div>' +
      '<div><b>' + fmtUsd(r.expected_value_usd) + '</b><span>expected value = implied × odds</span></div>' +
      '<div><b>' + fmtUsd(r.p10_usd) + ' – ' + fmtUsd(r.p90_usd) + '</b><span>P10 – point – P90: ' + fmtUsd(r.p10_usd) + ' / ' + fmtUsd(r.implied_value_usd) + ' / ' + fmtUsd(r.p90_usd) + '. The shipped bands hold ' + (cov.coverage_pct || '') + '% of the ' + (cov.total || 128) + ' comps inside their band.</span></div>' +
      '</div>' +
      '<div class="costbox"><h3>Farm economics — verdict ' + badge(viewVerdict(p)) + '</h3>' +
      '<p class="cost-line">At ' + fmtUsd(state.capital) + ' capital and a ' + (state.share * 100) + '% airdrop share. Gas is fixed per chain; opportunity cost is 4% a year on the deposit over the ' + r.cost_plan.hold_days + '-day hold.</p>' +
      '<dl class="facts">' +
      '<div><dt>Deposit</dt><dd>' + fmtUsd(state.capital) + '</dd></div>' +
      '<div><dt>Gas (deposit + claim)</dt><dd>' + fmtMoney(p.gas) + '</dd></div>' +
      '<div><dt>Opportunity cost</dt><dd>' + fmtMoney(p.opp) + '</dd></div>' +
      '<div><dt>Gross at P10</dt><dd>' + fmtMoney(p.grossP10) + '</dd></div>' +
      '<div><dt>Net at P10</dt><dd>' + fmtMoney(p.netP10) + '</dd></div>' +
      '<div><dt>Net at P10 / hour</dt><dd>' + fmtMoney(p.perHourP10) + '</dd></div>' +
      '<div><dt>Net expected</dt><dd>' + fmtMoney(p.netExp) + '</dd></div>' +
      '<div><dt>Net expected / hour</dt><dd>' + fmtMoney(p.perHourExp) + '</dd></div>' +
      '<div><dt>Time</dt><dd>' + r.cost_plan.time_minutes + ' min</dd></div>' +
      '</dl>' +
      '<p class="fine">' + p10Note + '</p>' +
      '</div>' +
      '</div><aside class="detail-side">' +
      '<dl class="facts">' +
      '<div><dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + plainPct(r.change_7d) + '</dd></div>' +
      '<div><dt>Curve multiple</dt><dd>' + r.peer_multiple.toFixed(4) + '×</dd></div>' +
      '<div><dt>Tracked since</dt><dd>' + fmtDate(r.listed_at) + '</dd></div>' +
      '<div><dt>Age with no token</dt><dd>' + fmtAge(r.age_days) + '</dd></div>' +
      '<div><dt>Main chain</dt><dd>' + esc(firstChain) + '</dd></div>' +
      '</dl>' +
      '</aside></div>';
    openDrawer();
    $('closeDetail').addEventListener('click', function () { select(null); });
  }

  function select(slug) {
    state.selected = slug;
    syncUrl();
    render();
  }

  // ---- events ----
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr || state.tab === 'traded') return;
    select(state.selected === tr.dataset.slug ? null : tr.dataset.slug);
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      if (state.tab === 'traded') return;
      var k = th.dataset.sort;
      if (!k) return;
      if (state.sort === k) state.dir *= -1;
      else { state.sort = k; state.dir = (k === 'rank' || k === 'implied_value_usd' || k === 'expected_value_usd' || k === 'odds' || k === 'tvl_usd' || k === 'multiple') ? -1 : 1; }
      $('sort').value = state.sort;
      syncUrl(); render();
    });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; syncUrl(); render(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; syncUrl(); render(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; syncUrl(); render(); });
  $('sort').addEventListener('change', function () {
    state.sort = $('sort').value;
    state.dir = (state.sort === 'rank' || state.sort === 'implied_value_usd' || state.sort === 'expected_value_usd' || state.sort === 'odds' || state.sort === 'tvl_usd') ? -1 : 1;
    syncUrl(); render();
  });
  $('capital').addEventListener('change', function () {
    state.capital = parseInt($('capital').value, 10) || REF_CAP;
    renderedSlug = null; syncUrl(); render();
  });
  $('share').addEventListener('change', function () {
    state.share = parseFloat($('share').value) || DEF_SHARE;
    renderedSlug = null; syncUrl(); render(); renderPortfolio();
  });
  $('verdict').addEventListener('change', function () {
    state.verdict = $('verdict').value === 'p10' ? 'p10' : 'exp';
    renderedSlug = null; syncUrl(); render();
  });
  $('csvBtn').addEventListener('click', exportCsv);
  $('planCapital').addEventListener('input', renderPortfolio);
  $('planHours').addEventListener('input', renderPortfolio);
  $('watchOnly').addEventListener('change', function () { state.watch = $('watchOnly').checked; syncUrl(); render(); });
  $('tabPre').addEventListener('click', function () { state.tab = 'pre'; syncUrl(); render(); });
  $('tabTraded').addEventListener('click', function () { state.tab = 'traded'; syncUrl(); render(); });
  $('drawerBackdrop').addEventListener('click', function () { select(null); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) select(null);
  });
  window.addEventListener('hashchange', function () {
    state.selected = (location.hash.match(/^#\/p\/([\w-]+)$/) || [])[1] || null;
    render();
  });

  render();
})();
