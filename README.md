<img src="https://github.com/mingssii.png" width="84" height="84" align="left" style="border-radius:50%;margin-right:16px" alt="Suttipong Promprakarn">

### Hi, I'm Suttipong Promprakarn (`mingssii`)

Business & data analyst who builds AI and automation that teams actually use.  
Computer Engineering, Chulalongkorn University (graduating Dec 2026) · Bangkok

[Portfolio Hub](https://mingssii.github.io) · [LinkedIn](https://www.linkedin.com/in/suttipong-promprakarn-150760287) · `s.promprakarn@gmail.com`

<br clear="left">

---

### Featured Projects
- **[Portfolio & AI Skills Hub](https://mingssii.github.io/)**: Central landing page for live web apps, open-source tools, and MIT-licensed AI agent skills
- **[PAD Flow Cleaner](https://mingssii.github.io/pad-flow-cleaner/)**: Clean, redact and visualize Power Automate Desktop flows, 100% in the browser (MIT, tested)
- **[Daily Dashboard](https://mingssii.github.io/daily-dashboard/)**: Unified personal finance & nutrition dashboard on Google Apps Script + Sheets with an iOS Medium Widget (demo data)
- **[Fair Wheel](https://mingssii.github.io/wheel/)**: Provably fair cryptographic decision wheel with Web Crypto CSPRNG and a built-in χ² fairness test
- **[Retail Promotion Analysis](https://github.com/mingssii/data-science-test)**: Incremental lift, post-promotion dip, cannibalization and profitability in Python
- **[DTW Lower-Bound Evaluation](https://github.com/mingssii/stock-dtw-lower-bound-evaluation)**: Reproducible study of faster time-series similarity search

### Work Experience
*(Internship repositories are private)*
- **CPF** — HR AI & process automation workflows across multiple HR teams
- **Promes** — Expense management application used by ~30 staff
- **Data Cafe** — Stock-allocation scoring model for a Thai retailer

### Public Catalog & Live Health
[![Ecosystem Ops & Portfolio Sync](https://github.com/mingssii/mingssii/actions/workflows/ecosystem-ops.yml/badge.svg)](https://github.com/mingssii/mingssii/actions/workflows/ecosystem-ops.yml)

<!-- AUTO-PORTFOLIO:START -->
| Project | Surface | Stack | Topics | Health | Summary |
|---|---|---|---|---|---|
| [daily-dashboard](https://github.com/mingssii/daily-dashboard) | [Live App](https://mingssii.github.io/daily-dashboard/) | HTML | `dashboard` `google-apps-script` `google-sheets` | Healthy | Unified Personal Life Dashboard (Finance & Nutrition) — Warm Paper UI, Scalable Sidebar & iOS Medium Widget |
| [pad-flow-cleaner](https://github.com/mingssii/pad-flow-cleaner) | [Live App](https://mingssii.github.io/pad-flow-cleaner/) | HTML | `flowchart` `mermaid` `power-automate-desktop` | Healthy | Clean, redact and visualize Power Automate Desktop flows. Free, open source, runs 100% in your browser. |
| [wheel](https://github.com/mingssii/wheel) | [Live App](https://mingssii.github.io/wheel/) | JavaScript | `cryptography` `csprng` `decision-wheel` | Healthy | Provably Fair Cryptographic Decision Wheel (Web Crypto CSPRNG + Lemire Rejection Sampling) |
| [stock-dtw-lower-bound-evaluation](https://github.com/mingssii/stock-dtw-lower-bound-evaluation) | Repository | Python | `benchmark` `dynamic-time-warping` `python` | Healthy | Reproducible DTW lower-bound evaluation for stock time-series similarity search |
| [data-science-test](https://github.com/mingssii/data-science-test) | Repository | Python | `data-science` `profitability` `promotion-analysis` | Healthy | Retail promotion analysis in Python: incremental lift, post-promotion dip, cannibalization and profitability |
<!-- AUTO-PORTFOLIO:END -->

### GitHub Automation & Self-Maintenance
This profile acts as the control plane for the `mingssii` GitHub ecosystem via [`.github/workflows/ecosystem-ops.yml`](.github/workflows/ecosystem-ops.yml) and [`scripts/github-ops.mjs`](scripts/github-ops.mjs):
- **Portfolio Auto-Sync**: Queries the GitHub API for all public non-fork, non-archived repositories and updates the catalog table above.
- **Profile & Repo Hygiene Audit**: Verifies profile website alignment (`https://mingssii.github.io`) and ensures every public repo has a description, topic tags, a README without legacy handle drift, and a matching `homepage` URL when GitHub Pages is enabled.
- **Secret & Credential Leak Guard**: Scans every public repository's Git tree for sensitive files (`.env`, `key.txt`, `secret.txt`, `.clasp.json`, `*.pem`, `credentials.json`, `id_rsa`).
- **Live Endpoint Verification & Self-Healing Alerts**: Performs HTTP reachability checks across `mingssii.github.io` and all published GitHub Pages apps, records deterministic state in [`status/ecosystem-health.json`](status/ecosystem-health.json), and opens/auto-closes an alert issue on failures.
- **Zero-Noise Commits**: Commits back only when repository metadata, catalog items, or live health status actually change.
