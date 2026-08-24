---
title: Deploy
description: Deploying the EkLine docs template to Vercel, a Node host, Netlify or Cloudflare, or a static-only host — what each supports and the one setting that matters.
---

**Deploy to Vercel unless you're already committed to self-hosting.** It's
what the live preview uses, needs no adapter configuration, and supports
everything the template ships.

Whichever target you use, set `DOCS_SITE_URL` to your real domain — or edit
`site` in `astro.config.mjs` — or the sitemap and `llms.txt` ship with
placeholder `https://example.com` URLs.

| Target | Logged-in tier | The one setting that matters |
| --- | --- | --- |
| **Vercel** | Works. Adapter picked automatically. | Nothing target-specific — see below. |
| **Node** (self-hosted, Docker) | Works. | `security.allowedDomains`, if sign-in is on — see below. |
| **Netlify, Cloudflare Pages** | Works, with their own adapter. | Swap the `adapter:` line in `astro.config.mjs` — one line, nothing else changes. |
| **Static-only** (GitHub Pages, S3, anywhere with no adapter) | Cannot run. | Remove the logged-in tier first — see below. |

## Vercel

Nothing to configure. Vercel's build sets `VERCEL=1`, which the template
reads to select `@astrojs/vercel` — the same setup the live preview uses.
Import the repository and deploy.

## Node

This is the default whenever `VERCEL` isn't set — self-hosting, Docker, any
other host. After `npm run build`, run the server yourself:

```bash
node ./dist/server/entry.mjs
```

It listens on port `4321` and binds to `localhost`. Set `PORT` to move the
port; in a container, also set `HOST=0.0.0.0`, or nothing outside the
container reaches it.

If sign-in is on, also set `security.allowedDomains` in `astro.config.mjs`
to your domain:

```js
security: {
  allowedDomains: [{ hostname: 'docs.example.com', protocol: 'https' }],
},
```

Leave it unset and Astro treats **every** request as `localhost` — direct
traffic included, not just requests through a proxy — so your SSO endpoint
gets handed a callback URL on the server's own loopback and sign-in never
returns. `astro dev` uses the real host, which is why this only shows up
once you deploy.

## Netlify and Cloudflare Pages

Swap the adapter import and the `adapter:` line in `astro.config.mjs` for
`@astrojs/netlify` or `@astrojs/cloudflare`. The auth code is
adapter-agnostic, so nothing else changes and the logged-in tier keeps
working.

## Static-only

GitHub Pages, S3, or anywhere that just serves files can't run a server, so
the logged-in tier has to go first — see [*Don't need private
docs?*](https://github.com/ekline-io/ekline-docs-template-astro/blob/main/packages/template/README.md#dont-need-private-docs)
in the template's README. Skip that and `astro.config.mjs` still picks an
adapter the same way it always does: `dist/` exists, but as the parent of
`dist/client/` and `dist/server/`, with no `dist/index.html` at the root for
a static host to serve. Once the feature is removed, the adapter goes with
it and the flat `dist/` with a root `dist/index.html` returns.

:::note
Deploying without `DOCS_SSO_URL`, `DOCS_SSO_SECRET` and `DOCS_SESSION_SECRET`
set turns the logged-in tier off at runtime by itself — the **Log in**
control disappears and `/private/**` answers a plain 404. That's enough to
ship a staging build or a fork that hasn't wired sign-in yet, on Vercel or a
Node host. It does **not** change the build shape described above, so it
isn't a route onto a static-only host — `astro.config.mjs` picks an adapter
regardless of whether these variables are set. Removing the feature, not
leaving it unconfigured, is what gets you a static-only build.
:::
