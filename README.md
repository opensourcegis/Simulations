# Simulator Arcade

Browser-based training simulators. Each one is a single self-contained HTML page — no build
step, no dependencies, no accounts.

**Live site:** https://opensourcegis.github.io/Simulations/

## Simulators

| Simulator | Path |
| --- | --- |
| Drone Mission Planner | [`games/drone-mission-planner/`](games/drone-mission-planner/) |

## Publishing

The site is served straight from the repository root on the `main` branch. To turn it on:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Choose branch `main` and folder `/ (root)`, then **Save**.

The first deploy takes a minute or two. `.nojekyll` is present so GitHub serves the files
as-is rather than running them through Jekyll.

## Local preview

Any static file server works. For example:

```powershell
python -m http.server 8000
```

Then open http://localhost:8000/.
