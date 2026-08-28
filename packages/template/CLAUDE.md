# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this documentation site.

## What this is

This is **your documentation site**, generated from EkLine's Starlight (Astro) template. The example pages, sidebar entries, and OpenAPI documents that came with it are placeholders — they exist so every feature is visible on real content, and they are meant to be replaced with yours.

So the goal here is *your* site, not a tidy template: put your product's content in, delete the parts you don't use, and let it stop looking like a template as fast as possible. `README.md` has a table mapping "what you want to change" to the file that changes it.

Verified baseline: Astro `^6.2.2`, Starlight `^0.39.2`, Node 22.x.

## Hosted documentation

Every setting in this site — what it does, and what happens if you leave it alone — is documented at <https://documentation-ekline-docs-template.vercel.app>. Its Internals section is the same material as `wiki/`, which shipped with your copy.

Check there before writing new prose into `README.md` or the wiki; that site is where the configuration material lives.

## Authoritative references

**Always consult the Starlight docs before making any change.** This is the rule, not the exception — these docs are the source of truth and override general training knowledge. Any time you're touching config, components, content schema, plugins, theming, routing, i18n, or anything else, fetch the relevant page first and follow the recommended approach there.

- **Starlight docs (start here for every change):** https://starlight.astro.build/
- Astro docs: https://docs.astro.build/en/getting-started/

This applies to bug fixes too: if Starlight has changed how something is configured or named between versions, the docs reflect the current API — your training data may not.

## Working principles

- **Adding a new capability? Look for an existing plugin first.** Before writing any custom integration, component, or remark/rehype plugin, search these two showcases — they are the default answer for "how do I add X to my docs site":
  - **Starlight plugin showcase:** https://starlight.astro.build/resources/plugins/
  - **Astro integrations directory:** https://astro.build/integrations/

  Also check npm and GitHub for community plugins not yet listed in the showcases. Only build custom when nothing suitable exists or existing options have a clear blocker — and document that reason in the PR/commit. This rule applies to every new capability (search, i18n, analytics, OG images, redirects, etc.), not just the ones already wired up.
- **Stay close to Starlight conventions.** Use Starlight's built-in config surface (sidebar config, components override slots, content collections schema) before reaching for Astro-level customization. Anyone who has seen a Starlight project should recognize this one.
- **Replace placeholders rather than working around them.** The example guides, the two sample APIs, and the demo orgs under `src/content/org-docs/` are scaffolding. When a page's content no longer matches its filename or sidebar label, rename it — leftover placeholder names are the main way a site like this drifts into confusion.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the dev server (default http://localhost:4321)
- `npm run build` — production build; static output to `./dist/client/` and the server bundle to `./dist/server/` (Node adapter), or `.vercel/output/` on Vercel
- `npm run preview` — preview the production build locally
- `npm run check` — type-check (`astro check`); keep this at zero errors
- `npm test` — build, then assert against the output; no browser required
- `npm run test:visual` — browser tests for the API reference and the SSO round trip (`npx playwright install chromium` first)
- `npm run dev:sso` — mock SSO server for developing the logged-in experience locally (pair with `.env` copied from `.env.example`)
- `npm run astro -- <cmd>` — run Astro CLI commands

No CI configuration ships with your copy — wire these commands into whatever CI you use. `check`, `test`, and `test:visual:ci` are the three that gate the template's own pull requests, and they are a reasonable starting set. The screenshot comparisons in `test:visual` are the exception: their baselines are macOS-only, so they stay a local check. Run `npm run test:visual` locally before merging a visual change, and `npm run test:visual:update` to accept one.

If the scripts in `package.json` diverge from this list, update this section.

## Architecture

Standard Starlight layout:

- `astro.config.mjs` — registers the Starlight integration. Title, sidebar, and social links live here. Add Astro integrations and Starlight plugins to the `integrations` array.
- `src/content.config.ts` — content collection definition. Uses `docsLoader()` + `docsSchema()` from `@astrojs/starlight`. Extend the schema (don't replace it) when adding custom frontmatter fields.
- `src/content/docs/` — Markdown/MDX content; each file becomes a route. Subdirs (`guides/`, `reference/`) map to URL segments and are referenced by the sidebar config.
- `src/middleware.ts` + `src/pages/private/` + `src/pages/auth/` — the server-enforced logged-in experience (private and per-org docs), fed by the `privateDocs` / `orgDocs` collections. Read [`wiki/private-docs.md`](wiki/private-docs.md) before changing any of it — the constraints (prerender flags, 404-not-403, the two path signals, reserved folders, fail-closed env handling) are deliberate and tested by `tests/private-leaks.test.mjs` and `tests/visual/auth.spec.mjs`.
- The build is adapter-based: `@astrojs/vercel` on Vercel (`VERCEL=1`), `@astrojs/node` everywhere else. Static output is `dist/client/` locally and `.vercel/output/static/` on Vercel — never a flat `dist/`. Tests resolve it via `tests/helpers/static-dir.mjs`; don't hardcode a path.
- `src/assets/` — images imported from MDX (processed by Astro's image pipeline).
- `public/` — static assets served as-is at the site root.
- `site` in `astro.config.mjs` ships as `https://example.com` — replace it with your deployed URL before publishing (sitemap and llms-txt emit absolute URLs from it), or set `DOCS_SITE_URL` in the build environment.

Component overrides (Starlight's "Overriding Components" mechanism) go in `src/components/` and are wired through the `components` field of the `starlight()` integration call — don't import Starlight internals directly.

## Installed plugins

- **`@astrojs/sitemap`** — emits `sitemap-index.xml` + `sitemap-0.xml` on build. Requires `site` to be set.
- **`starlight-llms-txt`** — emits `/llms.txt`, `/llms-full.txt`, and `/llms-small.txt` on build for AI assistant consumption. Configure `projectName`, `description`, and optionally `customSets` / `promote` in `astro.config.mjs`. Docs: https://github.com/delucis/starlight-llms-txt
- **`@scalar/astro`** — renders the API references declared in `src/config/api-reference.mjs`. This is an *Astro component*, not a Starlight plugin, so the routes are real pages under `src/pages/api/` and there is nothing in the `plugins` array. Shared config lives in `src/components/ScalarApiReference.astro`. Docs: https://scalar.com/products/api-references/integrations/astro

## API reference

All of it is configured from [`src/config/api-reference.mjs`](src/config/api-reference.mjs) — a list of references, each with its own OpenAPI document, route, layout and label. Routes, sidebar and search index are derived from that list; change it rather than the files it feeds.

Two example APIs ship, one per layout (`docs` at `/api/`, `full` at `/api/admin/`), so both are visible on real content. Delete the one you don't need. There is deliberately no reader-facing control for switching layouts — that is meta-UI about the docs rather than docs.

Read [`wiki/api-reference.md`](wiki/api-reference.md) before changing anything under `src/pages/api/`, `src/components/ScalarApiReference.astro`, or `src/lib/openapi-sidebar.mjs`. These constraints are easy to break and not obvious from the code:

- **`renderMode="client"` is required.** This site mounts `<ClientRouter />`; Scalar's default `static` mode renders blank after any client-side navigation.
- **Scalar's product surfaces stay off.** The agent (uploads your OpenAPI document to Scalar's servers), the "Open API Client" link (UTM-tagged, opens scalar.com), the "Powered by Scalar" links, and the platform toolbar. The embedded client stays — that is the useful part. Each is one line to restore; see the table in `wiki/api-reference.md`.
- **Theme through `--scalar-*` custom properties only.** Scalar's internal class names are not a stable API.
- **One search field, and it is the site's.** Scalar's is disabled everywhere; `ApiSearchIndex.astro` feeds each reference's operations into Pagefind under its own route, so a single search covers guides and endpoints and every result lands on the page that renders it.
- **Theme `<body>` too, not just Scalar's containers.** Scalar stamps its theme class on `<body>` and paints a background from it; miss it and dark mode shows white seams wherever Scalar's own surfaces don't cover the page.
- **The sidebar's operation list is generated, not written.** `src/lib/openapi-sidebar.mjs` builds it from the spec at build time using Scalar's own navigation builder, so the anchors match the IDs the reference assigns. Don't hand-derive those hashes — the slug rules are non-obvious (webhook punctuation is stripped, not hyphenated) and would drift on upgrade.

`@scalar/astro` still declares Astro `^4 || ^5` as a peer, so `package.json` carries an `overrides` entry pinning it to this project's Astro. Remove it once upstream widens the range.
