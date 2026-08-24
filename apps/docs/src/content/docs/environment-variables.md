---
title: Environment variables
description: Every DOCS_* variable this template reads, and what leaving it unset does.
---

| Variable | Sets | Unset means |
| --- | --- | --- |
| `DOCS_SSO_URL` | Where a reader is redirected to sign in — your product's SSO endpoint. | Together with the two below, the logged-in tier is off: **Log in** doesn't render, and `/private/**` answers 404 in production (a setup page under `astro dev`). |
| `DOCS_SSO_SECRET` | Verifies the handoff JWT your product signs. | Same as above. |
| `DOCS_SESSION_SECRET` | Signs this site's own session cookie. | Same as above. |
| `DOCS_UNSAFE_DEMO_LOGIN` | Set to `1` or `true` — nothing else counts — to turn `/demo-login` into an open persona picker. See [Trying it without SSO](/demo-login/). | `/demo-login` answers the same 404 as the rest of the auth surface — the safe default on anything with real private content. |
| `DOCS_SITE_URL` | The deployed URL, used by the sitemap and `llms.txt` to emit absolute links. | Falls back to the `https://example.com` placeholder hardcoded in `astro.config.mjs` — set one or the other before shipping. |
| `DOCS_TEST_PORT` | Port the browser test suite's site server listens on, for `npm run test:visual`. | Defaults to `4331`. |

:::note
`DOCS_SSO_URL`, `DOCS_SSO_SECRET`, `DOCS_SESSION_SECRET` and
`DOCS_UNSAFE_DEMO_LOGIN` are read at runtime (`access: 'secret'` in
`astro.config.mjs`'s `env.schema`), not baked into the build — one build
works across environments. `DOCS_SITE_URL` is different: it's read once at
build time, so a new value means a new build.

`PORT` and `HOST` configure the standalone Node server itself
(`@astrojs/node`), not this template — see [Deploy](/deploy/). `VERCEL` is
set by Vercel's own build system to pick the adapter automatically; nothing
to set yourself.
:::
