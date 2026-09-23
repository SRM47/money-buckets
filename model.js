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
    if (T === 0) return { mean: start, p10: start, p25: start, p50: start, p75: start, p90: start, pLoss: 0 };
    const sd = Math.sqrt(stats.s2 * T), mT = stats.m * T;
    const at = p => start * Math.exp(mT + invNorm(p) * sd);
    return {
      mean: start * Math.pow(1 + stats.mu, T),
      p10: at(0.10), p25: at(0.25), p50: at(0.50), p75: at(0.75), p90: at(0.90),
      pLoss: sd > 0 ? normCdf(-mT / sd) : (mT < 0 ? 1 : 0),
    };
  }

  root.Model = { BUCKETS, DEFAULTS, CORR, DIAL, dialToAlloc, roundTo100, rebalance, portfolioStats, project, invNorm, normCdf };
})(typeof window !== "undefined" ? window : globalThis);
