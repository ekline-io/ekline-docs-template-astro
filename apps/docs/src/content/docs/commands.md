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
| `npm run test:visual:ci` | The same suite, minus the screenshot comparisons. |
| `npm run test:visual:update` | The same suite, updating screenshot baselines instead of comparing against them. |
| `npm run astro -- <cmd>` | Any Astro CLI command. |

`start` is an alias for `dev`.

:::note
Screenshot baselines are macOS-only (`tests/visual/__screenshots__/darwin/`)
— running `npm run test:visual` on another platform fails on missing
baselines rather than on a real regression. `npm run test:visual:ci` is the
one that runs everywhere, and the one this template's own CI runs.
:::
