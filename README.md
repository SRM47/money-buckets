# Money Buckets

Allocation visualizer: slide between HYSA, low, medium and extreme risk and see expected value, the typical (median) outcome, and the 10th-90th percentile spread over time.

- Static site: `index.html`, `style.css`, `model.js` (math), `app.js` (UI). No build step, no dependencies.
- Hosted free on GitHub Pages from the `main` branch.
- Model: each bucket has an assumed yearly mean return and volatility; buckets are combined with a correlation matrix and projected with a lognormal model. All assumptions are editable on the page.

Research dated September 23, 2026. Not financial advice.
