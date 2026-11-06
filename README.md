# semosell.com

Placeholder site for SEMO Sell, LLC (holding company for CSU Sports Cards, 3totes, etc.).
This repo is PUBLIC: never commit an email address, token or key.

- `public/`: static site
- `worker.js`: serves `public/` and handles the contact form (`POST /api/contact`), relaying
  submissions through Proton SMTP submission. The destination email is never exposed to visitors.
  Form is hidden until the SMTP secrets are set.
- `wrangler.json`: deploy config; custom domains semosell.com + www
- `build_logo.py`: regenerates `public/logo.svg` (Missouri in black, SEMO counties in green) from a county GeoJSON:
  `python3 build_logo.py counties.json public/logo.svg`
  Counties (18): Pemiscot, Dunklin, New Madrid, Mississippi, Scott, Stoddard, Cape Girardeau, Bollinger, Perry, Butler, Wayne, Madison, Iron, Reynolds, Carter, Ripley, Oregon, Shannon.
  Source data: plotly/datasets geojson-counties-fips.json (US Census derived).

## Worker secrets (Cloudflare dashboard, Worker > Settings > Variables and Secrets)
| Name | Purpose |
|---|---|
| `CONTACT_EMAIL` | where submissions are delivered |
| `SMTP_USER` | Proton custom-domain address the SMTP token belongs to (the sender) |
| `SMTP_TOKEN` | Proton SMTP token (Proton > Settings > IMAP/SMTP > SMTP tokens) |
| `SMTP_SERVER` | optional, default smtp.protonmail.ch |
| `SMTP_PORT` | optional, default 587 (STARTTLS); 465 = implicit TLS |
| `TURNSTILE_SITE_KEY` | optional, enables Cloudflare Turnstile anti-spam |
| `TURNSTILE_SECRET` | required with `TURNSTILE_SITE_KEY` |

Deploys automatically on push to `main` (Cloudflare Workers Builds: build `npm run build`, deploy `npx wrangler deploy`).
