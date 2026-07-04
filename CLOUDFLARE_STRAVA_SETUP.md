# Cloudflare + Strava Setup

This folder has been upgraded from a static prototype into a Cloudflare Pages app with a Pages Functions backend.

## What Changed

- `script.js` now uses `/api/*` endpoints when hosted on Cloudflare.
- `functions/api/[[path]].js` handles:
  - runner storage
  - Strava OAuth redirect and callback
  - refresh token storage
  - Strava activity syncing
  - manual mileage entries
  - disconnect/reconnect
- `migrations/0001_schema.sql` documents the D1 database schema.
- `wrangler.toml` includes the expected D1 binding shape.

## Important Cloudflare Deployment Note

If you uploaded the site by dragging files into the Cloudflare dashboard, the static page can work, but the `functions` folder will not be compiled.

To use the Strava backend, deploy this folder with one of these:

- Cloudflare Pages Git integration.
- Wrangler Direct Upload from the command line.

## GitHub Pages Build Settings

If you deploy through GitHub, do **not** use:

```bash
npx wrangler deploy
```

That command deploys a Worker, not a Pages site, and causes this error:

```text
Missing entry-point to Worker script or to assets directory
```

Use these Cloudflare Pages settings instead:

```text
Framework preset: None
Root directory: runner-tracker-cloudflare
Build command: exit 0
Build output directory: .
Deploy command: leave blank
```

If Cloudflare has a "Deploy command" field and requires a value, use:

```bash
npx wrangler pages deploy .
```

The key difference is `wrangler pages deploy`, not `wrangler deploy`.

## Cloudflare Setup

1. Create a D1 database named `runner-tracker`.
2. Bind it to the Pages project with variable name `DB`.
3. Add environment variables/secrets:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_SCOPE`
4. Recommended value for `STRAVA_SCOPE`:
   - `activity:read` for normal visible activities.
   - `activity:read_all` if private/Only You activities should count.
5. Redeploy the Pages project after adding the binding and secrets.

The function also creates the needed tables automatically on first request. The migration file is included so the schema is visible and can be applied manually if preferred.

## Strava Setup

In the Strava developer dashboard:

1. Create or open your Strava API application.
2. Copy the Client ID into `STRAVA_CLIENT_ID`.
3. Copy the Client Secret into `STRAVA_CLIENT_SECRET`.
4. Set the Authorization Callback Domain to your Cloudflare Pages domain, such as:

```text
your-project.pages.dev
```

or your custom domain:

```text
runners.example.com
```

The app uses this callback URL:

```text
https://YOUR_DOMAIN/api/strava/callback
```

## Wrangler Deployment Path

If using Wrangler Direct Upload, deploy from this folder, not from the parent folder:

```bash
npx wrangler pages deploy .
```

Cloudflare documents that Wrangler uploads the `functions` folder when it exists where the command is run.

## Quick Test After Deploy

Open:

```text
https://YOUR_DOMAIN/api/health
```

You should see:

```json
{"ok":true}
```

Then open the site, add a runner with `Connect Strava account` checked, and approve the Strava permission screen.

## Current Security Note

This version does not yet include admin login. Anyone with the page URL can add runners and manual entries. Before sharing broadly, add an admin gate with Cloudflare Access, a passcode, or real account login.
