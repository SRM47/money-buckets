// Pure math - shared by the page and by tests. No libraries.
(function (root) {
  const BUCKETS = ["hysa", "low", "med", "high"];

  // Default assumptions. These are ASSUMPTIONS, not promises. See the Assumptions section.
  const DEFAULTS = {
    hysa: { mu: 0.04, sigma: 0.005 },
    low: { mu: 0.08, sigma: 0.15 },
    med: { mu: 0.10, sigma: 0.24 },
    high: { mu: 0.12, sigma: 0.55 },
  };
  // Correlations between buckets (HYSA is treated as uncorrelated cash).
  const CORR = {
    hysa: { hysa: 1, low: 0, med: 0, high: 0 },
    low: { hysa: 0, low: 1, med: 0.85, high: 0.6 },
    med: { hysa: 0, low: 0.85, med: 1, high: 0.8 },
    high: { hysa: 0, low: 0.6, med: 0.8, high: 1 },
  };

  // Risk dial anchors: dial value -> allocation (percent).
  const DIAL = [
    [0, { hysa: 100, low: 0, med: 0, high: 0 }],
    [25, { hysa: 50, low: 50, med: 0, high: 0 }],
    [50, { hysa: 20, low: 55, med: 25, high: 0 }],
    [75, { hysa: 5, low: 45, med: 35, high: 15 }],
    [100, { hysa: 0, low: 20, med: 40, high: 40 }],
  ];

  function dialToAlloc(d) {
    d = Math.max(0, Math.min(100, d));
    for (let i = 0; i < DIAL.length - 1; i++) {
      const [a, A] = DIAL[i], [b, B] = DIAL[i + 1];
      if (d >= a && d <= b) {
        const t = (d - a) / (b - a);
        const out = {};
        BUCKETS.forEach(k => out[k] = A[k] + (B[k] - A[k]) * t);
        return roundTo100(out);
      }
    }
    return { ...DIAL[DIAL.length - 1][1] };
  }

  // Round percentages to integers that still sum to exactly 100.
  function roundTo100(a) {
    const keys = BUCKETS;
    const floors = keys.map(k => Math.floor(a[k]));
    let rem = 100 - floors.reduce((s, x) => s + x, 0);
    const order = keys.map((k, i) => [a[k] - floors[i], i]).sort((x, y) => y[0] - x[0]);
    for (let j = 0; j < rem; j++) floors[order[j % 4][1]]++;
    const out = {};
    keys.forEach((k, i) => out[k] = floors[i]);
    return out;
  }

  // When one slider moves, rescale the others proportionally so the total stays 100.
  function rebalance(alloc, changedKey, newVal) {
    newVal = Math.max(0, Math.min(100, Math.round(newVal)));
    const others = BUCKETS.filter(k => k !== changedKey);
    const otherSum = others.reduce((s, k) => s + alloc[k], 0);
    const left = 100 - newVal;
    const out = { [changedKey]: newVal };
    if (otherSum <= 0) {
      others.forEach(k => out[k] = left / others.length);
    } else {
      others.forEach(k => out[k] = alloc[k] / otherSum * left);
    }
    // keep the changed value exact, round the rest
    const r = roundTo100(out);
    const diff = newVal - r[changedKey];
    if (diff !== 0) {
      r[changedKey] = newVal;
      const k = others.slice().sort((x, y) => r[y] - r[x])[0];
      r[k] -= diff;
    }
    return r;
  }

  function portfolioStats(allocPct, A) {
    A = A || DEFAULTS;
    const w = {};
    BUCKETS.forEach(k => w[k] = (allocPct[k] || 0) / 100);
    let mu = 0, v = 0;
    BUCKETS.forEach(i => {
      mu += w[i] * A[i].mu;
      BUCKETS.forEach(j => { v += w[i] * w[j] * CORR[i][j] * A[i].sigma * A[j].sigma; });
    });
    const sigma = Math.sqrt(v);
    // Lognormal fit matching the arithmetic mean and std dev of one year's return.
    const s2 = Math.log(1 + v / Math.pow(1 + mu, 2));
    const m = Math.log(1 + mu) - s2 / 2; // median log growth per year
    return { mu, sigma, m, s2, medianAnnual: Math.exp(m) - 1 };
  }

  // Inverse normal CDF (Acklam) and normal CDF.
  function invNorm(p) {
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function normCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const dd = 0.3989423 * Math.exp(-x * x / 2);
    const p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  // Projection at year T: EV (mean), percentiles, chance of ending below the start.
  function project(start, stats, T) {
    if (T === 0) return { mean: start, p025: start, p05: start, p10: start, p25: start, p50: start, p75: start, p90: start, p95: start, p975: start, pLoss: 0 };
    const sd = Math.sqrt(stats.s2 * T), mT = stats.m * T;
    const at = p => start * Math.exp(mT + invNorm(p) * sd);
    return {
      mean: start * Math.pow(1 + stats.mu, T),
      p025: at(0.025), p05: at(0.05), p10: at(0.10), p25: at(0.25), p50: at(0.50), p75: at(0.75), p90: at(0.90), p95: at(0.95), p975: at(0.975),
      pLoss: sd > 0 ? normCdf(-mT / sd) : (mT < 0 ? 1 : 0),
    };
  }


  // ---------- Risk analytics ----------
  // Lognormal one-year fit for a single (mu, sigma): arithmetic mean mu, std dev sigma.
  function lnFit(mu, sigma) {
    const s2 = Math.log(1 + sigma * sigma / Math.pow(1 + mu, 2));
    return { mu, sigma, s2, s: Math.sqrt(s2), m: Math.log(1 + mu) - s2 / 2 };
  }
  // One-year risk numbers as FRACTIONS of starting value (loss > 0 means you lose money).
  // VaR_a = 1 - exp(m + s*z_a); ES_a = 1 - exp(m + s^2/2) * Phi(z_a - s) / a  (lognormal closed form).
  function riskFromFit(f, rf) {
    const z95 = invNorm(0.05), z99 = invNorm(0.01);
    const q = z => Math.exp(f.m + f.s * z) - 1;
    const es = (a, z) => f.s > 0 ? 1 - Math.exp(f.m + f.s2 / 2) * normCdf(z - f.s) / a : -(Math.exp(f.m) - 1);
    const w = Math.exp(f.s2);
    return {
      mu: f.mu, sigma: f.sigma, median: Math.exp(f.m) - 1,
      p01: q(z99), p05: q(z95), p95: q(-z95), p99: q(-z99),
      var95: -q(z95), var99: -q(z99), es95: es(0.05, z95), es99: es(0.01, z99),
      nvar95: -(f.mu + z95 * f.sigma), nvar99: -(f.mu + z99 * f.sigma), // parametric normal VaR, desk-style comparison
      pLoss: f.s > 0 ? normCdf(-f.m / f.s) : (f.m < 0 ? 1 : 0),
      sharpe: f.sigma > 0 ? (f.mu - rf) / f.sigma : null,
      skew: f.s > 0 ? (w + 2) * Math.sqrt(w - 1) : 0,
      exKurt: f.s > 0 ? Math.pow(w, 4) + 2 * Math.pow(w, 3) + 3 * w * w - 6 : 0,
    };
  }
  function bucketRisk(A, rf) {
    const out = {};
    BUCKETS.forEach(k => out[k] = riskFromFit(lnFit(A[k].mu, A[k].sigma), rf));
    return out;
  }
  function covMatrix(A, C) {
    C = C || CORR;
    const S = {};
    BUCKETS.forEach(i => { S[i] = {}; BUCKETS.forEach(j => S[i][j] = C[i][j] * A[i].sigma * A[j].sigma); });
    return S;
  }
  // Portfolio stats with a supplied correlation matrix, plus Euler risk contributions:
  // RC_i = w_i (Sigma w)_i / sigma_p, and sum_i RC_i = sigma_p.
  function portfolioFull(allocPct, A, C) {
    C = C || CORR;
    const w = {}; BUCKETS.forEach(k => w[k] = (allocPct[k] || 0) / 100);
    const S = covMatrix(A, C);
    let mu = 0, v = 0; const Sw = {};
    BUCKETS.forEach(i => { mu += w[i] * A[i].mu; Sw[i] = 0; BUCKETS.forEach(j => Sw[i] += S[i][j] * w[j]); });
    BUCKETS.forEach(i => v += w[i] * Sw[i]);
    v = Math.max(v, 0);
    const sigma = Math.sqrt(v);
    const rc = {}; BUCKETS.forEach(i => rc[i] = sigma > 0 ? w[i] * Sw[i] / sigma : 0);
    const f = lnFit(mu, sigma);
    return { mu, sigma, m: f.m, s2: f.s2, medianAnnual: Math.exp(f.m) - 1, rc, fit: f };
  }
  // Positive semi-definite check via Cholesky (with tiny tolerance).
  function isPSD(C) {
    const n = BUCKETS.length, L = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let sum = C[BUCKETS[i]][BUCKETS[j]];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) { if (sum < -1e-9) return false; L[i][i] = Math.sqrt(Math.max(sum, 0)); }
      else L[i][j] = L[j][j] > 1e-12 ? sum / L[j][j] : 0;
    }
    return true;
  }
  // Monte Carlo of max drawdown: monthly GBM steps with log drift m/12 and log vol s/sqrt(12),
  // i.e. continuous rebalancing to the target mix. Seeded so results are reproducible.
  function simulateDrawdown(fit, years, nPaths, seed) {
    let x = seed >>> 0 || 1;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x + 0.5) / 4294967296; };
    const gauss = () => { const u = rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const n = Math.round(years * 12), dm = fit.m / 12, ds = fit.s / Math.sqrt(12);
    const dds = [], ends = [];
    for (let p = 0; p < nPaths; p++) {
      let lv = 0, peak = 0, mdd = 0;
      for (let t = 0; t < n; t++) { lv += dm + ds * gauss(); if (lv > peak) peak = lv; const dd = 1 - Math.exp(lv - peak); if (dd > mdd) mdd = dd; }
      dds.push(mdd); ends.push(Math.exp(lv));
    }
    dds.sort((a, b) => a - b); ends.sort((a, b) => a - b);
    const qt = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    return { median: qt(dds, 0.5), p90: qt(dds, 0.9), p95: qt(dds, 0.95), mean: dds.reduce((a, b) => a + b, 0) / dds.length,
      pDD20: dds.filter(d => d >= 0.2).length / dds.length, pDD50: dds.filter(d => d >= 0.5).length / dds.length,
      endP10: qt(ends, 0.1), endP50: qt(ends, 0.5), endP90: qt(ends, 0.9), n: nPaths, months: n };
  }

  // ---------- Historical statistics on annual return series ----------
  function histStats(ser, rfSer, bench) {
    const r = ser.r, n = r.length, start = ser.start;
    const mean = r.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    const m2 = r.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const m3 = r.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
    const m4 = r.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
    const g1 = m3 / Math.pow(m2, 1.5);
    const skew = n > 2 ? g1 * Math.sqrt(n * (n - 1)) / (n - 2) : null; // adjusted Fisher-Pearson
    const g2 = m4 / (m2 * m2) - 3;
    const exKurt = n > 3 ? ((n + 1) * g2 + 6) * (n - 1) / ((n - 2) * (n - 3)) : null;
    let w = 1, peak = 1, mdd = 0, ddStart = start, worstPeakYr = start, worstTroughYr = start, curPeakYr = start - 1;
    r.forEach((x, i) => { w *= 1 + x; if (w > peak) { peak = w; curPeakYr = start + i; } const dd = 1 - w / peak; if (dd > mdd) { mdd = dd; worstPeakYr = curPeakYr; worstTroughYr = start + i; } });
    const cagr = Math.pow(w, 1 / n) - 1;
    let iMin = 0, iMax = 0; r.forEach((x, i) => { if (x < r[iMin]) iMin = i; if (x > r[iMax]) iMax = i; });
    const sorted = r.slice().sort((a, b) => a - b);
    const pct = p => { const h = (n - 1) * p, lo = Math.floor(h); return sorted[lo] + (h - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]); };
    const align = other => { if (!other) return null; const a = [], b = []; r.forEach((x, i) => { const j = start + i - other.start; if (j >= 0 && j < other.r.length) { a.push(x); b.push(other.r[j]); } }); return [a, b]; };
    let sharpe = null, sortino = null;
    const ar = align(rfSer);
    if (ar) {
      const ex = ar[0].map((x, i) => x - ar[1][i]);
      const em = ex.reduce((a, b) => a + b, 0) / ex.length;
      const esd = Math.sqrt(ex.reduce((a, b) => a + (b - em) ** 2, 0) / (ex.length - 1));
      const dd = Math.sqrt(ex.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / ex.length);
      sharpe = esd > 0 ? em / esd : null; sortino = dd > 0 ? em / dd : null;
    }
    let beta = null, rho = null;
    const ab = align(bench);
    if (ab && ab[0].length > 2) { rho = corr(ab[0], ab[1]); const sa = sdOf(ab[0]), sb = sdOf(ab[1]); beta = rho * sa / sb; }
    const se = sd / Math.sqrt(n);
    return { n, from: start, to: start + n - 1, mean, cagr, sd, skew, exKurt, min: r[iMin], minYr: start + iMin, max: r[iMax], maxYr: start + iMax,
      p05: pct(0.05), p95: pct(0.95), mdd, mddFrom: worstPeakYr, mddTo: worstTroughYr, sharpe, sortino, beta, rho, se, ciLo: mean - 1.96 * se, ciHi: mean + 1.96 * se,
      pctNeg: r.filter(x => x < 0).length / n };
  }
  function sdOf(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
  function corr(a, b) {
    const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return sab / Math.sqrt(saa * sbb);
  }
  function corrAligned(s1, s2) {
    const a = [], b = []; s1.r.forEach((x, i) => { const j = s1.start + i - s2.start; if (j >= 0 && j < s2.r.length) { a.push(x); b.push(s2.r[j]); } });
    return { rho: corr(a, b), n: a.length, from: Math.max(s1.start, s2.start) };
  }

  root.Model = { BUCKETS, DEFAULTS, CORR, DIAL, dialToAlloc, roundTo100, rebalance, portfolioStats, project, invNorm, normCdf,
    lnFit, riskFromFit, bucketRisk, covMatrix, portfolioFull, isPSD, simulateDrawdown, histStats, corr, corrAligned };
})(typeof window !== "undefined" ? window : globalThis);
