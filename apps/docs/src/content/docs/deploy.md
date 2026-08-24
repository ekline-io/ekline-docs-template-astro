---
title: Deploy
description: Deploying the EkLine docs template to Vercel, a Node host, or a static-only host — what each supports and the one setting that matters.
---

Public pages are static no matter where you deploy. The logged-in tier is
what changes the picture: `/private/**` and `/auth/**` render on demand, so
they need a server. Which adapter builds that server — and whether one runs
at all — depends on the target.

**Deploy to Vercel unless you're already committed to self-hosting.** It's
what the live preview uses, needs no adapter configuration, and supports
everything the template ships.

| Target | Logged-in tier | The one setting that matters |
| --- | --- | --- |
| **Vercel** | Works. Adapter picked automatically. | Set `DOCS_SITE_URL` to your domain, or edit `site` in `astro.config.mjs` — otherwise the sitemap and `llms.txt` ship with placeholder `https://example.com` URLs. |
| **Node** (self-hosted, Docker, any other host) | Works. | Behind a reverse proxy, set `security.allowedDomains` in `astro.config.mjs`. Without it, every request looks like it came from `localhost`, and sign-in can never redirect back to your site. |
| **Static-only** (GitHub Pages, or anything that just serves files) | Cannot run. | Remove the logged-in tier — the template's own README covers this — or the build ships a `dist/server/` bundle that a static host can't run and no plain `dist/` at all. |

## Vercel

Nothing to configure. Vercel's build sets `VERCEL=1`, which the template
reads to select `@astrojs/vercel` — the same setup the live preview uses.
Import the repository and deploy.

## Node

Every other target uses `@astrojs/node` in standalone mode — this is the
default whenever `VERCEL` isn't set, including local dev and `npm run preview`.
After `npm run build`, run the server yourself:

```bash
node ./dist/server/entry.mjs
```

It listens on port `4321` by default; set `PORT` and `HOST` to change that.

## Static-only

Nothing here can run a server, so the logged-in tier has to go first. Once
it's removed, the plain `dist/` folder returns and any static host works —
Netlify, Cloudflare Pages, GitHub Pages, an S3 bucket, all of it.

:::note
Whichever target you pick, deploying without `DOCS_SSO_URL`, `DOCS_SSO_SECRET`
and `DOCS_SESSION_SECRET` set turns the logged-in tier off by itself — the
**Log in** control disappears and `/private/**` answers a plain 404. You don't
need to remove anything to ship a staging build or a fork that hasn't wired
sign-in yet.
:::
