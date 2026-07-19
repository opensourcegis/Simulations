# NIGST P&RS — Simulation-based Training

Browser-based training simulators from the Photogrammetry & Remote Sensing division,
National Institute for Geo-informatics Science & Technology (NIGST), Survey of India.
Each simulator is a single HTML page — no build step, no dependencies, no accounts.

Basemap tiles stream at runtime from OpenStreetMap, Esri World Imagery and Esri World
Hillshade (attribution shown on the map). The Survey Mission Designer additionally samples
real elevation from the AWS Terrain Tiles (Terrarium) dataset and fetches obstructions from
the OSM Overpass API, falling back to seeded synthetic obstacles when offline. The imagery
and terrain layers need an internet connection; the Plain layer works offline.

**Live site:** https://opensourcegis.github.io/Simulations/

## Simulators

| Simulator | Path |
| --- | --- |
| Survey Mission Designer | [`games/survey-mission-designer/`](games/survey-mission-designer/) |

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
