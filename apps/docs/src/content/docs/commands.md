---
title: Commands
description: Every npm script the template ships, run from the project root.
---

| Command | Runs |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run dev` | Dev server at `localhost:4321`, with hot reload. |
| `npm run build` | Production build. Static files to `dist/client/` (or `.vercel/output/static/` on Vercel); server bundle to `dist/server/` — see [Deploy](/deploy/) for which adapter picks which. |
| `npm run preview` | Preview the production build locally. |
| `npm run dev:sso` | Mock SSO server for developing the logged-in experience locally — see [Setting it up](/sso-setup/). |
| `npm run check` | Type-check the project (`astro check`). |
| `npm test` | Build, then assert against the output using Node's built-in test runner. No browser needed. |
| `npm run test:visual` | Browser tests for the API reference and the SSO round trip. Needs `npx playwright install chromium` first; serves on port `4331` — set `DOCS_TEST_PORT` to move it. |
| `npm run test:visual:ci` | An alias for the above, kept as a stable name to point CI at. |
| `npm run test:visual:update` | The same suite, updating screenshot baselines instead of comparing against them. |
| `npm run astro -- <cmd>` | Any Astro CLI command. |

`start` is an alias for `dev`.

:::note
Screenshot baselines are per-platform, under
`tests/visual/__screenshots__/<platform>/`. `darwin` and `linux` are both
committed, so the suite runs whole on a Mac and on a Linux CI runner. A
platform with neither fails on missing baselines rather than on a real
regression — generate that platform's set with `npm run test:visual:update`
on a matching machine or container and commit it.
:::
