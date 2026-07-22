# Simulation-based Training for Surveyors

React + Vite landing page for browser-based survey training simulators.

The five simulator experiences remain standalone HTML applications under `games/`. The Vite production build copies them into `dist/games/`, so they continue to work alongside the React landing page.

## Local development

```powershell
npm install
npm run dev
```

To verify the production output:

```powershell
npm run build
npm run preview
```

## GitHub Pages deployment

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `react` builds the Vite app and publishes `dist/` to the separate `gh-pages` branch. Source code remains on `react`; `gh-pages` contains deployment output only.

In the repository's GitHub settings, open **Pages** and set **Build and deployment -> Source** to **Deploy from a branch**, then choose `gh-pages` and `/(root)`. After the workflow completes, the site will be available at:

`https://opensourcegis.github.io/Simulations/`

The Vite base path is configured as `/Simulations/`, matching this repository's GitHub Pages project URL.
