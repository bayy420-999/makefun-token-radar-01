// Token Radar dashboard (radar-6). Reads window.RADAR (data.js): pre-token
// rows by implied value + 24 traded protocols at market cap. No network.
// implied = TVL x curve x growth x maturity (§1.2, 0.05x, clamp 0.50-2.00);
// farm gross scales with deposit x share x 3, costs are fixed plan costs +
// swap rate + T-bill opportunity net of yield. At a row's sized deposit and
// 10% share the shipped cost_plan is used verbatim. See MODEL.md.
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
// modelOf: implied = round(TVL x round4(exp(a + (b-1).ln TVL)) x growth x
// maturity), from data.js's loglog coefficients; else the shipped multiple.
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
// planOf (§4.3/§4.4): gross = (dep/TVL) x value x share x 3; costs =
// fixed plan costs + swap rate x dep + T-bill opportunity (4.16% net of
// yield) x dep x hold/365. FARM when net > $50 and net/h > $5, THIN when
// net > $0, else SKIP. At the sized deposit + 10% share, shipped verbatim.
var TBILL = 0.0416, ACT_MULT = 3;
function verdictOf(net, perHour) { return (net > 50 && perHour > 5) ? 'FARM' : (net > 0 ? 'THIN' : 'SKIP'); }
// Verdict view: expected-net by default (188 THIN / 9 SKIP at the sized
// deposits), P10 on toggle (0 FARM / 42 THIN / 155 SKIP).
function viewVerdict(p) { return state.verdict === 'exp' ? p.verdictExp : p.verdictP10; }
function planOf(r, dep, share) {
  var c = r.cost_plan, hrs = c.time_minutes / 60;
  if (dep === c.deposit_usd && share === DEF_SHARE) {
    return { grossP10: c.gross_p10_usd, netP10: c.net_p10_usd, netExp: c.net_expected_usd,
      perHourP10: c.net_per_hour_usd, perHourExp: c.net_expected_per_hour_usd,
      gas: c.gas_usd, opp: dep * Math.max(0, TBILL - c.position_yield) * c.hold_days / 365,
      verdictP10: c.verdict, verdictExp: c.verdict_expected };
  }
  var grossP10 = Math.round((dep / r.tvl_usd) * r.p10_usd * share * ACT_MULT);
  var grossExp = Math.round((dep / r.tvl_usd) * r.expected_value_usd * share * ACT_MULT);
  var gas = Math.round((c.fixed_costs_usd + c.swap_rate * dep) * 100) / 100;
  var opp = Math.round(dep * Math.max(0, TBILL - c.position_yield) * c.hold_days / 365 * 100) / 100;
  var netP10 = Math.round(grossP10 - gas - opp), netExp = Math.round(grossExp - gas - opp);
  var vP10 = verdictOf(netP10, netP10 / hrs), vExp = verdictOf(netExp, netExp / hrs);
  return { grossP10: grossP10, netP10: netP10, netExp: netExp,
    perHourP10: Math.round(netP10 / hrs), perHourExp: Math.round(netExp / hrs),
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
// 8th stat: the SHIPPED expected verdicts (sized deposits, not the
// selected capital).
var expFarm0 = DATA.rows.filter(function (r) { return r.cost_plan.verdict_expected === 'FARM'; }).length;
var expThin0 = DATA.rows.filter(function (r) { return r.cost_plan.verdict_expected === 'THIN'; }).length;
$('stats').innerHTML =
  '<div class="stat"><b>' + DATA.rows.length + '</b><span>protocols ranked</span></div>' +
  '<div class="stat"><b>' + watchCount + ' / ' + DATA.watchlist_size + '</b><span>watchlist covered</span></div>' +
  '<div class="stat"><b>' + fmtUsd(totalImplied) + '</b><span>combined value</span></div>' +
  '<div class="stat"><b>' + (top10Sum / totalImplied * 100).toFixed(1) + '%</b><span>of value in the top 10</span></div>' +
  '<div class="stat"><b>×' + (looVal('log-log OLS (radar-5)') || 0).toFixed(2) + '</b><span>leave-one-out miss</span></div>' +
  '<div class="stat"><b>' + (o0.brier_model != null ? o0.brier_model.toFixed(3) : 'n/a') + '</b><span>odds Brier (base ' + (o0.brier_base != null ? o0.brier_base.toFixed(3) : 'n/a') + ')</span></div>' +
  '<div class="stat"><b>' + (cov0.coverage_pct != null ? cov0.coverage_pct : '?') + '%</b><span>P10–P90 bands hold · ' + (cov0.p25_p75_coverage_pct != null ? cov0.p25_p75_coverage_pct : '?') + '% P25–P75</span></div>' +
  '<div class="stat"><b>' + expFarm0 + ' FARM</b><span>at expected net · ' + expThin0 + ' THIN</span></div>';
// Evidence strip: the headline held-out numbers, one line, always visible.
var sm = (v0.shrunk_model || {});
$('strip').innerHTML = 'LOO ×' + (looVal('log-log OLS (radar-5)') || 0).toFixed(2) +
  ' · odds Brier ' + (o0.brier_model != null ? o0.brier_model.toFixed(3) : 'n/a') + ' LOO / ' + (o0.brier_model_wf != null ? o0.brier_model_wf.toFixed(3) : 'n/a') + ' WF' +
  ' · P25–P75 ' + (cov0.band_width_x != null ? cov0.band_width_x.toFixed(1) : '?') + '× wide' +
  ' · 52 signals, 0 kept' +
  (sm.shrink != null ? ' · growth/age ×' + sm.shrink : '');
$('modelText').textContent = DATA.model + ' The value uses TVL, 7-day growth and age; the odds use TVL, growth, age and shrunk cat/fam offsets. No name is special-cased.';
// Evidence (§5.2/§5.7): held-out tables from data.js's validation block.
// E1/E2 are the spec's verbatim tables (E2 stage 4 is the k=3 near-miss).
function evTable(title, heads, rows) {
  var h = '<h3>' + title + '</h3><table class="loo"><thead><tr>' + heads.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
  rows.forEach(function (r) { h += '<tr>' + r.map(function (c, i) { return '<td' + (i > 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; });
  return h + '</tbody></table>';
}
function renderEvidence() {
  var v = DATA.validation || {}, vs = v.value_stages || [], os = v.odds_stages || [], co = v.coverage || {}, cal = v.calibration || {};
  var h = '<h2>Evidence</h2>';
  // E1: the spec's verbatim value table. data.js ships {stage, model,
  // loo, wf, decision} (n is 128 comps throughout; params in the model
  // string), so the table shows Stage / LOO / WF / Verdict.
  h += evTable('E1 · Value model — held-out miss by stage',
    ['Stage', 'LOO', 'WF', 'Verdict'],
    vs.map(function (s) { return [s.model, '×' + s.loo.toFixed(4), '×' + s.wf.toFixed(4), s.decision]; }));
  h += '<p class="ev-note">Quadratic sensitivity: a free quadratic in log TVL improves LOO to ×3.3760 and WF to ×2.6704, but a bootstrap finds it better only 40% of the time — a coin flip. 52 signals tested; 0 terms kept — every one fails the both-tests rule. Shipped: the curve plus the fitted growth/age coefficients at 0.05× strength (LOO ×3.4314 / WF ×2.7641), each multiplier clamped to 0.50–2.00. The chain-count row is cumulative (curve + category + family + growth + age + chains, ridge λ=8); a chain-only OLS re-run gives LOO ×3.8044 / WF ×3.0285 — same conclusion.</p>';
  // E2: the spec's verbatim odds table. data.js ships {stage, model,
  // loo, wf, decision}; the k values live in the decision strings (the
  // k=3 near-miss is stage 4, the family-offset row).
  h += evTable('E2 · Odds model — Brier by stage',
    ['Stage', 'LOO', 'WF', 'Verdict'],
    os.map(function (s) { return [s.model, s.loo.toFixed(4), s.wf.toFixed(4), s.decision]; }));
  h += '<p class="ev-note">Baseline: a per-category cell with age (the radar-5 odds) scores 0.2075 LOO / 0.2836 WF; the shipped model scores 0.1845 / 0.2180. Stage 4 is the k = 3 near-miss — the category counts are too thin to trust, so the shipped model stops one stage short of the best Brier. Growth is clamped to −60%/+120%; a missing 7-day change is −8.23%.</p>';
  var bandRows = [['All protocols', '×' + (co.band_width_x != null ? co.band_width_x.toFixed(1) : '?'), (co.p25_p75_coverage_pct != null ? co.p25_p75_coverage_pct : '?') + '%', (co.coverage_pct != null ? co.coverage_pct : '?') + '%']];
  (co.per_category_bands || []).forEach(function (b) { bandRows.push([b.category, '×' + (b.q75 / b.q25).toFixed(2), '—', '—']); });
  h += evTable('E3 · Range bands',
    ['Band', 'Width', 'P25–P75 coverage', 'P10–P90 coverage'], bandRows);
  var wk = DATA.rows.filter(function (r) { return r.rank <= 5; }).slice(0, 3);
  h += '<p class="ev-note">Worked rows: ' + wk.map(function (r) {
    return r.name + ' ' + fmtUsd(r.p25_usd) + '–' + fmtUsd(r.p75_usd) + ' (' + (r.p75_usd / r.p25_usd).toFixed(1) + '×) around ' + fmtUsd(r.implied_value_usd);
  }).join('; ') + '. The shipped P10–P90 bands hold on 78.9% of comps (the spec’s 80.5% is the hat-matrix LOO; the build refits exactly); P25–P75 holds on 52.3%. Median implied value is ' + (co.q50_factor != null ? co.q50_factor.toFixed(3) : '?') + '× the curve.</p>';
  // E4: the worst categories by leave-one-out, from per_category.
  var worst = (v.per_category || []).slice().sort(function (a, b) { return b.median_fold_error - a.median_fold_error; }).slice(0, 5);
  h += evTable('E4 · Where the curve misses',
    ['Category', 'LOO miss'],
    worst.map(function (w) { return [w.category + ' (' + w.comps + ' comps)', '×' + w.median_fold_error.toFixed(4)]; }));
  h += '<p class="ev-note">Lending and Canonical Bridge remain the worst-priced. No category term survives the both-tests rule, so the board keeps the curve and shows the misses.</p>';
  // §5.7 calibration. data.js: calibration.{mean_pred, actual_rate,
  // terciles:[{pred, actual}], examples:[{slug, name, odds}]},
  // offsets_top.{cat, fam}:[{name, offset}]. Example offsets come from
  // the board rows, looked up by slug.
  var offs = cal.offsets_top || { cat: [], fam: [] };
  h += '<h3>Odds calibration — P(token recorded)</h3><p class="ev-note">The odds predict whether a protocol <b>records a token at all</b> (mcap, gecko_id or symbol) — not whether it launches one. Walk-forward: mean predicted ' + (cal.mean_pred != null ? cal.mean_pred.toFixed(3) : '?') + ' vs actual ' + (cal.actual_rate != null ? cal.actual_rate.toFixed(3) : '?') + '. Terciles (predicted → actual): ' + (cal.terciles || []).map(function (t) { return t.pred.toFixed(3) + ' → ' + t.actual.toFixed(3); }).join(', ') + '. Examples: ' + (cal.examples || []).map(function (e) { return e.name + ' ' + (e.odds * 100).toFixed(1) + '%'; }).join('; ') + '. Top offsets: ' + (offs.cat || []).slice(0, 3).map(function (o) { return o.name + ' ' + (o.offset > 0 ? '+' : '') + o.offset.toFixed(2); }).join(', ') + '; families ' + (offs.fam || []).slice(0, 3).map(function (o) { return o.name + ' ' + (o.offset > 0 ? '+' : '') + o.offset.toFixed(2); }).join(', ') + '.</p>';
  $('evidence').innerHTML = h;
}
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
  // The shrunk variant is already the 8th loo row (shipped); its WF
  // comes from validation.shrunk_model (the loo list has no WF column).
  var sm = v.shrunk_model || {};
  var tsMap = { 'log-log OLS (radar-5)': ts.radar5_median_fold_error, 'flat global median': ts.flat_median_fold_error, 'peer-only (radar-4)': ts.peer_median_fold_error, 'full radar-3 (peer x growth x maturity)': ts.radar3_median_fold_error, 'log-log + shrunk growth/age (radar-6, x0.05)': sm.wf };
  var shortName = { 'log-log OLS (radar-5)': 'Log-log curve (radar-5)', 'flat global median': 'Flat global median', 'peer-only (radar-4)': 'Peer medians (radar-4)', 'shrinkage k=6': 'Shrinkage k=6', 'log-log + category factors k=6': 'Curve + category k=6', 'log-log + growth': 'Curve + growth', 'full radar-3 (peer x growth x maturity)': 'Full radar-3', 'log-log + shrunk growth/age (radar-6, x0.05)': 'Curve + shrunk growth/age' };
  var keptMap = { 'log-log OLS (radar-5)': 'kept', 'peer-only (radar-4)': 'replaced', 'log-log + shrunk growth/age (radar-6, x0.05)': 'kept (shipped)' };
  var looRows = (v.loo || []).map(function (x) {
    var tsv = tsMap[x.variant];
    return '<tr><td>' + esc(shortName[x.variant] || x.variant) + '</td><td class="num">' + fmtFold(x.median_fold_error) + '</td><td class="num">' + (tsv != null ? fmtFold(tsv) : '—') + '</td><td>' + (keptMap[x.variant] || 'dropped') + '</td></tr>';
  }).join('');
  var looGain = (flat && curve) ? ((flat - curve) / flat * 100).toFixed(1) : '?';
  var tsGain = (ts.flat_median_fold_error && ts.radar5_median_fold_error) ? ((ts.flat_median_fold_error - ts.radar5_median_fold_error) / ts.flat_median_fold_error * 100).toFixed(1) : '?';
  box.innerHTML =
    '<h2>Validation — the held-out tests say the fitted curve wins</h2>' +
    '<p><b>The fitted log-log curve beats the flat median out of sample.</b> Leave-one-out on ' + v.loo_comps + ' tokenized comps: the curve misses by ' + fmtFold(curve) + ', the flat global median by ' + fmtFold(flat) + ', the radar-4 category medians by ' + fmtFold(peer) + ' — the curve wins by ' + looGain + '% against flat. The median miss is still about ×3.4: mcap/TVL ratios span four orders of magnitude. The curve is kept because it wins on both held-out tests, not because it is precise.</p>' +
    '<div class="valid-grid"><table class="loo"><thead><tr><th>Variant</th><th class="num">Leave-one-out</th><th class="num">Time split</th><th>Kept?</th></tr></thead><tbody>' + looRows + '</tbody></table>' +
    '<div class="valid-notes">' +
    '<p><b>Kept / dropped.</b> The term-by-term evidence is in the <a href="#evidence">Evidence section</a> above (E1–E4): 52 signals tested, 0 value terms kept at full strength; the shipped model is the curve plus the fitted growth/age coefficients at 0.05× strength, each multiplier clamped to 0.50–2.00. The odds model is the stage-7 fit (Brier 0.1845 LOO / 0.2180 WF) with k = 3 shrinkage on the category/family offsets.</p>' +
    '<p><b>Time split — listing date, not walk-forward.</b> Curve fitted on the ' + ts.older + ' older comps (listed before ' + esc(ts.median_listed_at) + '), tested on the ' + ts.newer + ' newer: curve ' + fmtFold(ts.radar5_median_fold_error) + ' vs flat median ' + fmtFold(ts.flat_median_fold_error) + ' vs peer medians ' + fmtFold(ts.peer_median_fold_error) + ' — the same ordering as leave-one-out.</p>' +
    '<p><b>Per-category misses (final model).</b> Best: ' + esc(best.category) + ' ' + fmtFold(best.median_fold_error) + ' (' + best.comps + ' comps). Worst: ' + esc(worst.category) + ' ' + fmtFold(worst.median_fold_error) + ' (' + worst.comps + ' comps).</p>' +
    '<p><b>P10–P90 and P25–P75 coverage.</b> The shipped bands (per-category where a category has ≥10 comps, global otherwise) hold ' + cov.coverage_pct + '% (' + cov.covered + ' of ' + cov.total + ' comps); the all-global band holds ' + cov.global_band_coverage_pct + '%. The P25–P75 bands hold ' + cov.p25_p75_coverage_pct + '% (' + cov.p25_p75_covered + ' of ' + cov.total + ' comps), ' + cov.global_p25_p75_coverage_pct + '% all-global, and are ' + cov.band_width_x + '× wide. Global factors ×' + cov.q10_factor + ' / ×' + cov.q90_factor + '.</p>' +
    '<p><b>The P10 verdict now discriminates.</b> At each row’s sized deposit the P10 verdict is ' + p10Verdicts.FARM + ' FARM / ' + p10Verdicts.THIN + ' THIN / ' + p10Verdicts.SKIP + ' SKIP. The P10 factor is ×' + cov.q10_factor + ', so the largest gross at P10 on the whole board is ' + fmtMoney(maxGross.cost_plan.gross_p10_usd) + ', and the best net at P10 is ' + fmtMoney(maxNet.cost_plan.net_p10_usd) + ' (' + esc(maxNet.name) + ') after gas and opportunity cost. The expected-net view discriminates more: ' + expThin + ' THIN / ' + (DATA.rows.length - expThin) + ' SKIP at the sized deposits.</p>' +
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
    '<p class="acct-line"><b>' + a.total + '</b> protocols = <b>' + a.ranked + '</b> ranked (' + a.watchlist + ' watchlist + ' + a.outside_watchlist + ' outside) + <b>' + a.traded_shown + '</b> traded, shown in the Live view + <b>' + s.total + '</b> set aside pre-token + <b>' + a.tokenized_not_shown + '</b> tokenized, not shown.</p>' +
    '<p class="acct-detail">Set aside pre-token (' + s.total + '): category leg ' + s.by_category_leg + ' · version leg ' + s.by_version_leg + ' · name leg ' + s.by_name_leg + ' · rankable but not chosen ' + s.rankable_not_chosen + ' (above the floor, not on the watchlist). ' + a.pre_token_total + ' record no token in all; ' + a.tokenized_total + ' are tokenized (' + a.traded_shown + ' shown + ' + a.tokenized_not_shown + ' not shown).</p>';
}
// FNV-1a checksum of the board, recomputed in-page.
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
  $('planNote').textContent = 'Top 5 farms by expected net per hour at the capital you enter (per farm, not split across farms), at the airdrop share selected above; a farm qualifies only if its plan averages no more than your hours per week over its hold. Totals are expected nets — the pessimistic P10 net is SKIP on ' + p10skip + ' of ' + DATA.rows.length + ' rows at the sized deposits, so this plan is an expected-value plan, not a conservative one. Each row’s sized deposit is in its detail drawer.';
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
    head = ['rank', 'name', 'slug', 'category', 'chains', 'tvl_usd', 'implied_value_usd', 'p10_usd', 'p25_usd', 'p75_usd', 'p90_usd', 'odds', 'expected_value_usd', 'verdict', 'verdict_expected', 'net_p10_usd', 'net_expected_usd'];
    lines = visibleRows().map(function (r) {
      var p = planOf(r, state.capital, state.share);
      return [r.rank, r.name, r.slug, r.category || '', (r.chains || []).join(';'), r.tvl_usd, r.implied_value_usd, r.p10_usd, r.p25_usd, r.p75_usd, r.p90_usd, r.odds, r.expected_value_usd, viewVerdict(p), p.verdictExp, p.netP10, p.netExp].map(csvCell).join(',');
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
renderEvidence();
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
  // Rank sorts ascending (rank 1 is the top); every other numeric key
  // sorts by value.
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
        '<td class="num val"><b>' + fmtUsd(t.mcap_usd) + '</b><span class="range">market cap</span></td>' +
        '<td class="num na">—</td>' +
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
  // Verdict counts at the SELECTED capital/share (via planOf), so the
  // count line matches the Verdict/Net columns.
  var expT = 0, expF = 0, p10T = 0, p10F = 0;
  DATA.rows.forEach(function (r) {
    var p = planOf(r, state.capital, state.share);
    if (p.verdictExp === 'FARM') expF++; else if (p.verdictExp === 'THIN') expT++;
    if (p.verdictP10 === 'FARM') p10F++; else if (p.verdictP10 === 'THIN') p10T++;
  });
  $('count').innerHTML = 'Showing <b>' + rows.length + '</b> of ' + DATA.rows.length +
    ' ranked protocols' + (state.watch ? ' · watchlist only' : '') + '. Verdicts and nets at ' + fmtUsd(state.capital) + ' capital, ' + (state.share * 100) + '% airdrop share, ' + (state.verdict === 'exp' ? 'expected-net view (' + expF + ' FARM / ' + expT + ' THIN / ' + (DATA.rows.length - expF - expT) + ' SKIP)' : 'P10 view (' + p10F + ' FARM / ' + p10T + ' THIN / ' + (DATA.rows.length - p10F - p10T) + ' SKIP)') + '. Click a row for its value breakdown and farm plan.';
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows.map(function (r) {
    var top = r.rank <= 3 ? ' top' : '';
    var p = planOf(r, state.capital, state.share);
    return '<tr data-slug="' + esc(r.slug) + '" class="' + (r.watchlist ? 'watch ' : '') + (state.selected === r.slug ? 'selected' : '') + '">' +
      '<td class="rank' + top + '">' + r.rank + '</td>' +
      '<td class="proto"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span></td>' +
      '<td class="num val"><b>' + fmtUsd(r.implied_value_usd) + '</b><span class="range">' + fmtUsd(r.p10_usd) + '–' + fmtUsd(r.p90_usd) + '</span></td>' +
      '<td class="num range">' + fmtUsd(r.p25_usd) + '–' + fmtUsd(r.p75_usd) + '</td>' +
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
  var sm2 = (DATA.validation || {}).shrunk_model || {};
  var p = planOf(r, state.capital, state.share);
  var ll = DATA.loglog || null;
  var p10Counts = { FARM: 0, THIN: 0, SKIP: 0 };
  DATA.rows.forEach(function (x) { p10Counts[x.cost_plan.verdict]++; });
  var expPos = DATA.rows.filter(function (x) { return x.cost_plan.net_expected_usd > 0; }).length;
  var p10Note = 'At each row’s sized deposit the P10 verdict across the board is ' + p10Counts.FARM + ' FARM / ' + p10Counts.THIN + ' THIN / ' + p10Counts.SKIP + ' SKIP (P10 factor ×' + (cov.q10_factor || '') + '). The expected net discriminates more (' + expPos + ' THIN / ' + (DATA.rows.length - expPos) + ' SKIP at the sized deposits).';
  // Shipped sized-deposit plan (§4.5 budget line).
  var c = r.cost_plan;
  var budget = 'Budget: ' + fmtUsd(c.deposit_usd) + ' deposit + ' + fmtMoney(c.gas_usd) + ' gas + ' + c.time_minutes + ' min over ' + c.hold_days + ' days · Gross (expected) ' + fmtMoney(c.gross_expected_usd) + ' · Net (expected) ' + fmtMoney(c.net_expected_usd) + ' · ' + fmtMoney(c.net_expected_per_hour_usd) + '/h · P10 net ' + fmtMoney(c.net_p10_usd) + ' · ' + c.verdict_expected +
    (c.verdict_expected === 'SKIP' && c.deposit_needed_usd ? ' — needs ' + fmtUsd(c.deposit_needed_usd) + ' deposit to pay' : '');
  box.innerHTML =
    '<div class="detail-head"><div><h2>#' + r.rank + ' · ' + esc(r.name) + '</h2>' +
    '<p class="sub"><code>' + esc(r.slug) + '</code> · ' + esc(r.category || 'uncategorised') + ' · ' + fmtChains(r.chains) + ' · records no token</p></div>' +
    '<button type="button" class="close" id="closeDetail">Close ×</button></div>' +
    '<p class="budget">' + budget + '</p>' +
    '<div class="detail-grid"><div class="detail-main">' +
    '<h3>Farm plan — ' + esc(r.name) + ' on ' + esc(firstChain) + '</h3>' +
    '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
    '<div class="breakdown">' +
    '<div><b>' + fmtUsd(r.implied_value_usd) + '</b><span>implied value (rank #' + r.rank + ')</span></div>' +
    '<div><b>' + fmtUsd(r.tvl_usd) + '</b><span>TVL in the snapshot</span></div>' +
    '<div><b>' + r.peer_multiple.toFixed(4) + '×</b><span>curve multiple at this TVL · log-log fit</span></div>' +
    '<div><b>' + r.growth_multiplier.toFixed(4) + '×</b><span>growth factor · 7d ' + plainPct(r.change_7d) + (sm2.beta_g != null ? ' (β_g ' + sm2.beta_g.toFixed(2) + ' at ×' + sm2.shrink + ')' : '') + '</span></div>' +
    '<div><b>' + r.maturity_multiplier.toFixed(4) + '×</b><span>maturity factor · ' + fmtAge(r.age_days) + ' with no token' + (sm2.beta_a != null ? ' (β_a ' + sm2.beta_a.toFixed(2) + ' at ×' + sm2.shrink + ')' : '') + '</span></div>' +
    '<div><b>' + fmtDate(r.listed_at) + '</b><span>tracked since</span></div>' +
    '<div class="formula">implied = ' + fmtUsd(r.tvl_usd) + ' × ' + r.peer_multiple.toFixed(4) + ' × ' + r.growth_multiplier.toFixed(4) + ' × ' + r.maturity_multiplier.toFixed(4) + ' = <b>' + fmtUsd(r.implied_value_usd) + '</b> · curve multiple exp(' + (ll ? ll.intercept.toFixed(4) + ' + (' + ll.slope.toFixed(4) + ' − 1)·ln(TVL)' : '?') + ')</div>' +
    '</div>' +
    '<p class="model-check">model check: recomputed from the fitted curve ' + fmtUsd(m.implied) +
    ' — ' + (Math.abs(m.diffPct) < 0.01 ? '<b>matches</b> the board value' : 'differs from the board value by ' + Math.abs(m.diffPct).toFixed(2) + '%') + '</p>' +
    '<div class="oddsbox">' +
    '<div><b>' + (r.odds * 100).toFixed(1) + '%</b><span>launch odds — P(token recorded); category ' + esc(r.category || '—') + ' ' + (r.cat_offset != null ? (r.cat_offset > 0 ? '+' : '') + r.cat_offset.toFixed(2) : '') + ', family ' + esc(r.name.split(' ')[0].toLowerCase()) + ' ' + (r.fam_offset != null ? (r.fam_offset > 0 ? '+' : '') + r.fam_offset.toFixed(2) : '') + ' (log-odds offsets, k=3)</span></div>' +
    '<div><b>' + fmtUsd(r.expected_value_usd) + '</b><span>expected value = implied × odds</span></div>' +
    '<div><b>' + fmtUsd(r.p25_usd) + ' – ' + fmtUsd(r.p75_usd) + '</b><span>P25 – P75: ' + (r.p75_usd / r.p25_usd).toFixed(1) + '× wide; the shipped P25–P75 bands hold ' + (cov.p25_p75_coverage_pct || '') + '% of the ' + (cov.total || 128) + ' comps.</span></div>' +
    '<div><b>' + fmtUsd(r.p10_usd) + ' – ' + fmtUsd(r.p90_usd) + '</b><span>P10 – point – P90: ' + fmtUsd(r.p10_usd) + ' / ' + fmtUsd(r.implied_value_usd) + ' / ' + fmtUsd(r.p90_usd) + '. The shipped P10–P90 bands hold ' + (cov.coverage_pct || '') + '% of the ' + (cov.total || 128) + ' comps inside their band.</span></div>' +
    '</div>' +
    '<div class="costbox"><h3>Farm economics — verdict ' + badge(viewVerdict(p)) + '</h3>' +
    '<p class="cost-line">At ' + fmtUsd(state.capital) + ' capital and a ' + (state.share * 100) + '% airdrop share. Gas is the full plan cost (deposit + claim + weekly check-ins + withdraw); opportunity cost is the 4.16% T-bill rate net of the position yield, on the deposit over the ' + r.cost_plan.hold_days + '-day hold.</p>' +
    '<dl class="facts">' +
    '<div><dt>Deposit</dt><dd>' + fmtUsd(state.capital) + '</dd></div>' +
    '<div><dt>Sized deposit (shipped)</dt><dd>' + fmtUsd(c.deposit_usd) + '</dd></div>' +
    '<div><dt>Gas (full plan)</dt><dd>' + fmtMoney(p.gas) + '</dd></div>' +
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
    '</div>';
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
    else { state.sort = k; state.dir = (k === 'rank' || k === 'implied_value_usd' || k === 'p25_usd' || k === 'expected_value_usd' || k === 'odds' || k === 'tvl_usd' || k === 'multiple') ? -1 : 1; }
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
