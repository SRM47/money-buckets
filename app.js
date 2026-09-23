(function () {
  const M = window.Model;
  const B = M.BUCKETS;
  const NAMES = { hysa: "HYSA (cash)", low: "Low risk", med: "Medium risk", high: "Extreme risk" };
  const COLORS = { hysa: "#58a6ff", low: "#3fb950", med: "#d29922", high: "#f85149" };
  const HORIZONS = [1, 5, 10, 20];

  const PRESETS = [
    { id: "sleep", name: "Sleep at night", desc: "Mostly cash, some index funds", a: { hysa: 60, low: 40, med: 0, high: 0 } },
    { id: "balanced", name: "Balanced", desc: "Index core, a tech slice, a pinch of spice", a: { hysa: 20, low: 50, med: 25, high: 5 } },
    { id: "sam", name: "Sam's plan (my pick)", desc: "$10k HYSA + $20k brokerage split 12k / 5k / 3k", a: { hysa: 33, low: 40, med: 17, high: 10 } },
    { id: "gamble", name: "Young and gambling", desc: "No cash, heavy tech, big moonshot sleeve", a: { hysa: 0, low: 30, med: 40, high: 30 } },
    { id: "yolo", name: "Full send", desc: "Tech plus moonshots only. For contrast.", a: { hysa: 0, low: 0, med: 30, high: 70 } },
  ];

  let alloc = { ...PRESETS[2].a };
  let A = JSON.parse(JSON.stringify(M.DEFAULTS));
  let start = 30000;
  let C = JSON.parse(JSON.stringify(M.CORR));
  const rf = () => A.hysa.mu;
  const PS = a => M.portfolioFull(a, A, C);

  const $ = s => document.querySelector(s);
  const fmt = x => (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
  const fmtK = x => x <= 0 ? "$0" : x >= 1e6 ? "$" + (x / 1e6).toFixed(1) + "M" : x >= 1e4 ? "$" + Math.round(x / 1e3) + "k" : "$" + (x / 1e3).toFixed(1) + "k";
  const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";

  // ---- sliders ----
  function buildSliders() {
    const box = $("#buckets");
    box.innerHTML = B.map(k => `
      <div class="bucket">
        <div class="row"><label for="s-${k}"><span class="dot" style="background:${COLORS[k]}"></span>${NAMES[k]}</label>
        <span class="v"><b id="p-${k}"></b> · <span id="d-${k}"></span></span></div>
        <input type="range" id="s-${k}" min="0" max="100" step="1">
      </div>`).join("");
    B.forEach(k => $("#s-" + k).addEventListener("input", e => {
      alloc = M.rebalance(alloc, k, +e.target.value);
      $("#dial").value = guessDial(alloc);
      clearPreset(); render();
    }));
  }
  // Rough inverse of the dial: position that best matches current allocation.
  function guessDial(a) {
    let best = 0, bd = 1e9;
    for (let d = 0; d <= 100; d++) {
      const x = M.dialToAlloc(d);
      const dist = B.reduce((s, k) => s + (x[k] - a[k]) ** 2, 0);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }
  function dialWord(d) {
    return d < 10 ? "Cash is king" : d < 30 ? "Cautious" : d < 50 ? "Moderate" : d < 65 ? "Growth" : d < 85 ? "Aggressive" : "Maximum risk";
  }

  function clearPreset() { document.querySelectorAll(".preset").forEach(p => p.classList.remove("on")); }

  function buildPresets() {
    $("#presets").innerHTML = PRESETS.map(p => {
      const st = PS(p.a), r10 = M.project(start, st, 10);
      return `<button class="preset" data-id="${p.id}">
        <b>${p.name}</b><small>${p.desc}</small>
        <div class="bar">${B.map(k => `<div style="width:${p.a[k]}%;background:${COLORS[k]}"></div>`).join("")}</div>
        <small>${B.map(k => p.a[k] + "%").join(" / ")}</small><br>
        <small>10 yr: bad ${fmtK(r10.p10)} · typical ${fmtK(r10.p50)} · EV ${fmtK(r10.mean)} · good ${fmtK(r10.p90)}</small>
      </button>`;
    }).join("");
    document.querySelectorAll(".preset").forEach(el => el.addEventListener("click", () => {
      const p = PRESETS.find(x => x.id === el.dataset.id);
      alloc = { ...p.a }; $("#dial").value = guessDial(alloc);
      clearPreset(); el.classList.add("on"); render();
    }));
  }

  function buildAssumptions() {
    $("#assump").innerHTML = `<table class="assump"><tr><th>Bucket</th><th>Expected return / yr</th><th>Volatility (std dev) / yr</th></tr>` +
      B.map(k => `<tr><td class="${k}">${NAMES[k]}</td>
        <td><input type="number" step="0.5" id="mu-${k}" value="${(A[k].mu * 100).toFixed(1)}">%</td>
        <td><input type="number" step="0.5" id="sg-${k}" value="${(A[k].sigma * 100).toFixed(1)}">%</td></tr>`).join("") + `</table>`;
    B.forEach(k => {
      $("#mu-" + k).addEventListener("input", e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { A[k].mu = v / 100; buildPresets(); render(); } });
      $("#sg-" + k).addEventListener("input", e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) { A[k].sigma = v / 100; buildPresets(); render(); } });
    });
  }

  // ---- fan chart (SVG, no libraries) ----
  function drawChart(st) {
    const svg = $("#chart");
    const narrow = (svg.clientWidth || window.innerWidth) < 600;
    const W = narrow ? 420 : 900, H = narrow ? 300 : 380, L = narrow ? 44 : 58, R = 10, T = 12, Bm = 26;
    const years = +$("#horizon").value;
    const pts = [];
    for (let t = 0; t <= years; t += years > 20 ? 1 : 0.5) pts.push([t, M.project(start, st, t)]);
    const ymax = Math.max(...pts.map(p => p[1].p90), start * 1.1);
    const x = t => L + (W - L - R) * t / years;
    const y = v => T + (H - T - Bm) * (1 - v / ymax);
    const band = (lo, hi) => "M" + pts.map(p => x(p[0]) + "," + y(p[1][hi])).join("L") + "L" + pts.slice().reverse().map(p => x(p[0]) + "," + y(p[1][lo])).join("L") + "Z";
    const line = key => "M" + pts.map(p => x(p[0]) + "," + y(p[1][key])).join("L");
    let g = "";
    const step = niceStep(ymax / 5);
    for (let v = 0; v <= ymax; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#30363d"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtK(v)}</text>`;
    const xs = narrow ? (years <= 10 ? 2 : 5) : (years <= 10 ? 1 : years <= 20 ? 2 : 5);
    for (let t = 0; t <= years; t += xs) g += `<text x="${x(t)}" y="${H - 10}" text-anchor="middle">${t}y</text>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = g +
      `<path d="${band("p10", "p90")}" fill="#a371f7" opacity="0.18"/>` +
      `<path d="${band("p25", "p75")}" fill="#a371f7" opacity="0.30"/>` +
      `<line x1="${L}" x2="${W - R}" y1="${y(start)}" y2="${y(start)}" stroke="#8b949e" stroke-dasharray="3 4"/>` +
      `<path d="${line("p50")}" fill="none" stroke="#e6edf3" stroke-width="2.5"/>` +
      `<path d="${line("mean")}" fill="none" stroke="#f0b72f" stroke-width="2" stroke-dasharray="7 5"/>`;
  }
  function niceStep(s) { const p = Math.pow(10, Math.floor(Math.log10(s))); const n = s / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }

  function render() {
    B.forEach(k => {
      $("#s-" + k).value = alloc[k];
      $("#p-" + k).textContent = alloc[k] + "%";
      $("#d-" + k).textContent = fmt(start * alloc[k] / 100);
    });
    const d = +$("#dial").value;
    $("#dialLabel").textContent = d + " · " + dialWord(d);
    $("#allocBar").innerHTML = B.map(k => `<div style="width:${alloc[k]}%;background:${COLORS[k]}" title="${NAMES[k]} ${alloc[k]}%"></div>`).join("");

    const st = PS(alloc);
    const y1 = M.project(start, st, 1);
    $("#st-mu").textContent = pct(st.mu);
    $("#st-med").textContent = pct(st.medianAnnual);
    $("#st-sig").textContent = pct(st.sigma);
    $("#st-bad").textContent = fmt(M.project(start, st, 1).p10 - start);
    $("#st-bad").className = "";

    $("#proj").innerHTML = `<tr><th>Year</th><th>2.5th pct</th><th>Bad (10th)</th><th>Typical (median)</th><th>EV (mean)</th><th>Good (90th)</th><th>97.5th pct</th><th>P(loss)</th></tr>` +
      HORIZONS.map(T => { const r = M.project(start, st, T); return `<tr><td>${T}</td><td>${fmt(r.p025)}</td><td>${fmt(r.p10)}</td><td>${fmt(r.p50)}</td><td>${fmt(r.mean)}</td><td>${fmt(r.p90)}</td><td>${fmt(r.p975)}</td><td>${pct(r.pLoss, 1)}</td></tr>`; }).join("");
    drawChart(st);
    renderAnalytics(st);
  }

  // ---- analytics ----
  const sgn = x => x <= 0 ? "none (gain)" : fmt(x);
  const pctS = (x, d = 1) => x == null || !isFinite(x) ? "n/a" : (x * 100).toFixed(d) + "%";
  const num = (x, d = 2) => x == null || !isFinite(x) ? "n/a" : x.toFixed(d);
  let ddCache = { key: "", v: null };

  function buildCorr() {
    const box = $("#corr");
    box.innerHTML = `<table class="mtx"><tr><th>&rho;</th>${B.map(k => `<th class="${k}">${NAMES[k]}</th>`).join("")}</tr>` +
      B.map((i, a) => `<tr><th class="${i}">${NAMES[i]}</th>${B.map((j, b) => b === a ? `<td>1.00</td>` :
        b > a ? `<td><input type="number" step="0.05" min="-1" max="1" data-i="${i}" data-j="${j}" value="${C[i][j].toFixed(2)}"></td>` :
        `<td class="mirror" id="cm-${i}-${j}">${C[i][j].toFixed(2)}</td>`).join("")}</tr>`).join("") + `</table>`;
    box.querySelectorAll("input").forEach(el => el.addEventListener("input", e => {
      const v = parseFloat(e.target.value); if (isNaN(v) || v < -1 || v > 1) return;
      const i = e.target.dataset.i, j = e.target.dataset.j; C[i][j] = C[j][i] = v;
      $(`#cm-${j}-${i}`).textContent = v.toFixed(2); buildPresets(); render();
    }));
  }

  function renderAnalytics(st) {
    const R = M.riskFromFit(st.fit, rf());
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("#an-mu", pctS(R.mu, 2)); set("#an-med", pctS(R.median, 2)); set("#an-sig", pctS(R.sigma, 2));
    set("#an-sharpe", R.sharpe == null ? "n/a (no risk)" : num(R.sharpe));
    set("#an-var95", sgn(R.var95 * start)); set("#an-var99", sgn(R.var99 * start));
    set("#an-es95", sgn(R.es95 * start)); set("#an-es99", sgn(R.es99 * start));
    set("#an-nvar95", sgn(R.nvar95 * start));
    set("#an-ploss", pctS(R.pLoss, 1)); set("#an-p05", pctS(R.p05, 1) + " / " + pctS(R.p95, 1));
    set("#an-skew", num(R.skew));
    const H = +$("#horizon").value;
    const key = [st.m.toFixed(6), st.s2.toFixed(6), H].join("|");
    if (ddCache.key !== key) ddCache = { key, v: st.fit.s > 1e-9 ? M.simulateDrawdown(st.fit, H, 2000, 12345) : { median: 0, p95: 0, pDD20: 0 } };
    const D = ddCache.v;
    set("#an-mdd", pctS(D.median, 0));
    set("#an-mdd95", pctS(D.p95, 0)); set("#an-pdd20", pctS(D.pDD20, 0)); set("#an-hz", H);
    $("#psdWarn").style.display = M.isPSD(C) ? "none" : "block";
    // risk contributions
    const w = k => alloc[k] / 100;
    $("#rc").innerHTML = `<tr><th>Bucket</th><th>Weight</th><th>&sigma;<sub>i</sub></th><th>Contribution to &sigma;<sub>p</sub></th><th>% of risk</th></tr>` +
      B.map(k => `<tr><td class="${k}">${NAMES[k]}</td><td>${pctS(w(k), 0)}</td><td>${pctS(A[k].sigma)}</td><td>${pctS(st.rc[k], 2)}</td><td>${st.sigma > 0 ? pctS(st.rc[k] / st.sigma, 0) : "n/a"}</td></tr>`).join("") +
      `<tr><th>Total</th><th>100%</th><th></th><th>${pctS(st.sigma, 2)}</th><th>100%</th></tr>`;
    // covariance matrix
    const S = M.covMatrix(A, C);
    $("#cov").innerHTML = `<tr><th>&Sigma; (&times;10&#8315;&#8308;)</th>${B.map(k => `<th class="${k}">${NAMES[k]}</th>`).join("")}</tr>` +
      B.map(i => `<tr><th class="${i}">${NAMES[i]}</th>${B.map(j => `<td>${(S[i][j] * 1e4).toFixed(1)}</td>`).join("")}</tr>`).join("");
    // per-bucket model table
    const BR = M.bucketRisk(A, rf());
    const rows = [
      ["E[r] (arithmetic mean)", k => pctS(BR[k].mu)],
      ["Volatility &sigma;", k => pctS(BR[k].sigma)],
      ["Median r = e<sup>m</sup>&minus;1", k => pctS(BR[k].median)],
      ["1st pct (1 in 100 bad year)", k => pctS(BR[k].p01)],
      ["5th pct (lower bound, 90% band)", k => pctS(BR[k].p05)],
      ["95th pct (upper bound, 90% band)", k => pctS(BR[k].p95)],
      ["99th pct", k => pctS(BR[k].p99)],
      ["P(losing year)", k => pctS(BR[k].pLoss)],
      ["VaR 95% (1y, % of bucket)", k => BR[k].var95 <= 0 ? "none" : pctS(BR[k].var95)],
      ["VaR 99%", k => BR[k].var99 <= 0 ? "none" : pctS(BR[k].var99)],
      ["Expected shortfall 95%", k => BR[k].es95 <= 0 ? "none" : pctS(BR[k].es95)],
      ["Sharpe (rf = HYSA)", k => BR[k].sharpe == null ? "n/a" : num(BR[k].sharpe)],
      ["Skewness (lognormal)", k => num(BR[k].skew)],
      ["Excess kurtosis (lognormal)", k => num(BR[k].exKurt)],
      ["VaR 95% on your $ in it", k => { const d = start * alloc[k] / 100 * BR[k].var95; return d <= 0 ? "none" : fmt(d); }],
    ];
    $("#bk-model").innerHTML = `<tr><th>Model, 1 year</th>${B.map(k => `<th class="${k}">${NAMES[k]}</th>`).join("")}</tr>` +
      rows.map(([lab, f]) => `<tr><td>${lab}</td>${B.map(k => `<td>${f(k)}</td>`).join("")}</tr>`).join("");
  }

  function renderHistory() {
    const H = window.HIST;
    const cols = [
      ["tbill", "HYSA proxy", "hysa"], ["sp500", "Low proxy", "low"], ["qqq", "Medium proxy", "med"], ["smallcap", "Extreme proxy A", "high"], ["arkk", "Extreme proxy B", "high"],
    ];
    const S = {}; cols.forEach(([k]) => S[k] = M.histStats(H[k], k === "tbill" ? null : H.tbill, k === "sp500" ? null : H.sp500));
    const rows = [
      ["Period (years)", s => `${s.from}-${s.to} (${s.n})`],
      ["Arithmetic mean", s => pctS(s.mean)],
      ["95% CI on the mean (&plusmn;1.96 s/&radic;n)", s => `${pctS(s.ciLo)} to ${pctS(s.ciHi)}`],
      ["CAGR (geometric)", s => pctS(s.cagr)],
      ["Volatility (sample s.d.)", s => pctS(s.sd)],
      ["Skewness (adj.)", s => num(s.skew)],
      ["Excess kurtosis", s => num(s.exKurt)],
      ["Worst year", s => `${pctS(s.min)} (${s.minYr})`],
      ["Best year", s => `${pctS(s.max)} (${s.maxYr})`],
      ["5th / 95th pct year", s => `${pctS(s.p05)} / ${pctS(s.p95)}`],
      ["% of years negative", s => pctS(s.pctNeg, 0)],
      ["Max drawdown (year-end data)", s => s.mdd > 0 ? `${pctS(s.mdd, 0)} (${s.mddFrom}-${s.mddTo})` : "0%"],
      ["Sharpe vs T-bills", s => num(s.sharpe)],
      ["Sortino vs T-bills", s => num(s.sortino)],
      ["Beta vs S&amp;P 500", s => num(s.beta)],
      ["Correlation vs S&amp;P 500", s => num(s.rho)],
    ];
    $("#bk-hist").innerHTML = `<tr><th>Historical</th>${cols.map(([k, lab, b]) => `<th class="${b}">${lab}<br><small>${H[k].label}</small></th>`).join("")}</tr>` +
      rows.map(([lab, f]) => `<tr><td>${lab}</td>${cols.map(([k]) => `<td>${f(S[k])}</td>`).join("")}</tr>`).join("");
    const pairs = [["sp500", "qqq"], ["sp500", "smallcap"], ["sp500", "arkk"], ["qqq", "smallcap"], ["qqq", "arkk"], ["tbill", "sp500"]];
    $("#hist-corr").innerHTML = `<tr><th>Pair</th><th>&rho; (annual)</th><th>Overlap</th></tr>` +
      pairs.map(([a, b]) => { const c = M.corrAligned(H[a], H[b]); return `<tr><td>${H[a].label} vs ${H[b].label}</td><td>${num(c.rho)}</td><td>${c.from}-2025 (n=${c.n})</td></tr>`; }).join("");
  }

  function init() {
    buildSliders(); buildAssumptions(); buildPresets();
    $("#start").value = start;
    $("#start").addEventListener("input", e => { const v = parseFloat(e.target.value); if (v > 0) { start = v; buildPresets(); render(); } });
    $("#dial").addEventListener("input", e => { alloc = M.dialToAlloc(+e.target.value); clearPreset(); render(); });
    $("#horizon").addEventListener("input", e => { $("#hLabel").textContent = e.target.value + " years"; render(); });
    $("#reset").addEventListener("click", () => { A = JSON.parse(JSON.stringify(M.DEFAULTS)); C = JSON.parse(JSON.stringify(M.CORR)); buildAssumptions(); buildCorr(); buildPresets(); render(); });
    buildCorr(); renderHistory();
    $("#dial").value = guessDial(alloc);
    document.querySelector('.preset[data-id="sam"]').classList.add("on");
    render();
    window.addEventListener("resize", render);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
