# NIGST P&RS — Simulation-based Training

React + Vite landing page for browser-based training simulators from the Photogrammetry & Remote Sensing division, National Institute for Geo-informatics Science & Technology (NIGST), Survey of India.

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

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `main` builds the Vite app and deploys `dist/` to GitHub Pages.

In the repository’s GitHub settings, open **Pages** and set **Build and deployment → Source** to **GitHub Actions**. After the workflow completes, the site will be available at:

`https://opensourcegis.github.io/Simulations/`

The Vite base path is configured as `/Simulations/`, matching this repository’s GitHub Pages project URL.
