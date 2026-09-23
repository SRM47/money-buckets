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
      const st = M.portfolioStats(p.a, A), r10 = M.project(start, st, 10);
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

    const st = M.portfolioStats(alloc, A);
    const y1 = M.project(start, st, 1);
    $("#st-mu").textContent = pct(st.mu);
    $("#st-med").textContent = pct(st.medianAnnual);
    $("#st-sig").textContent = pct(st.sigma);
    $("#st-bad").textContent = fmt(M.project(start, st, 1).p10 - start);
    $("#st-bad").className = "";

    $("#proj").innerHTML = `<tr><th>Year</th><th>Bad (10th pct)</th><th>Typical (median)</th><th>Expected value (mean)</th><th>Good (90th pct)</th><th>Chance of loss</th></tr>` +
      HORIZONS.map(T => { const r = M.project(start, st, T); return `<tr><td>${T}</td><td>${fmt(r.p10)}</td><td>${fmt(r.p50)}</td><td>${fmt(r.mean)}</td><td>${fmt(r.p90)}</td><td>${pct(r.pLoss, 0)}</td></tr>`; }).join("");
    drawChart(st);
  }

  function init() {
    buildSliders(); buildAssumptions(); buildPresets();
    $("#start").value = start;
    $("#start").addEventListener("input", e => { const v = parseFloat(e.target.value); if (v > 0) { start = v; buildPresets(); render(); } });
    $("#dial").addEventListener("input", e => { alloc = M.dialToAlloc(+e.target.value); clearPreset(); render(); });
    $("#horizon").addEventListener("input", e => { $("#hLabel").textContent = e.target.value + " years"; render(); });
    $("#reset").addEventListener("click", () => { A = JSON.parse(JSON.stringify(M.DEFAULTS)); buildAssumptions(); buildPresets(); render(); });
    $("#dial").value = guessDial(alloc);
    document.querySelector('.preset[data-id="sam"]').classList.add("on");
    render();
    window.addEventListener("resize", render);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
