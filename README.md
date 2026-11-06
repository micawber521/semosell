# semosell.com

Placeholder site for SEMO Sell, LLC (holding company for CSU Sports Cards, 3totes, etc.).

- `public/`: static site served by Cloudflare Workers (assets-only, no worker script)
- `wrangler.json`: deploy config; custom domains semosell.com + www
- `build_logo.py`: regenerates `public/logo.svg` (Missouri in black, SEMO counties in green) from a county GeoJSON:
  `python3 build_logo.py counties.json public/logo.svg`
  Counties: Pemiscot, Dunklin, New Madrid, Mississippi, Scott, Stoddard, Cape Girardeau, Bollinger, Perry.
  Source data: plotly/datasets geojson-counties-fips.json (US Census derived).

Deploys automatically on push to `main` (Cloudflare Workers Builds, deploy command `npx wrangler deploy`).
