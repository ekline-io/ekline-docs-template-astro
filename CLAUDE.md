# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

This repository is **EkLine's recommended Starlight (Astro) documentation template**, which EkLine ships to its customers when they want to stand up a docs site. It is not a finished product site — customers fork/clone it and replace the placeholders with their own content. Decisions should optimize for clarity, reusability, and ease of adoption by EkLine customers, not for one-off polish.

Because EkLine is the maintainer, light EkLine attribution is appropriate (e.g. "Maintained by EkLine" in the footer, EkLine listed as the LICENSE copyright holder). Avoid baking in EkLine *product-specific* copy or assets — the customer is starting *their* docs site, not a clone of EkLine's.

The project was scaffolded with the official Starlight starter (`npm create astro@latest -- --template starlight`). Astro `^6.2.2`, Starlight `^0.39.2`, Node 22.x verified.

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
- **Stay close to Starlight conventions.** Use Starlight's built-in config surface (sidebar config, components override slots, content collections schema) before reaching for Astro-level customization. Downstream users will expect the template to look like a normal Starlight project.
- **Keep it template-shaped.** Content, sidebar entries, and example pages should be obvious placeholders that a customer can swap out. EkLine attribution is fine in attribution-shaped places (footer credit, LICENSE) but avoid product-specific copy that wouldn't make sense on a customer's own docs site.

## Commands

Once the Astro/Starlight project is scaffolded, the standard commands will be:

- `npm install` — install dependencies
- `npm run dev` — start the dev server (default http://localhost:4321)
- `npm run build` — production build to `./dist/`
- `npm run preview` — preview the production build locally
- `npm run check` — type-check (`astro check`); must stay at zero errors, CI gates on it
- `npm test` — build, then assert against the output; no browser required
- `npm run test:visual` — browser tests for the API reference (`npx playwright install chromium` first)
- `npm run astro -- <cmd>` — run Astro CLI commands

CI (`.github/workflows/ci.yml`) runs `check`, `test`, and `test:visual:ci` on every PR. The screenshot comparisons are excluded there because their baselines are macOS-only; run `npm run test:visual` locally before merging a visual change, and `npm run test:visual:update` to accept one.

These follow the defaults from `npm create astro@latest`. If/when the scripts in `package.json` diverge from these, update this section.

## Architecture

Standard Starlight layout (in place):

- `astro.config.mjs` — registers the Starlight integration. Title, sidebar, and social links live here. Add Astro integrations and Starlight plugins to the `integrations` array.
- `src/content.config.ts` — content collection definition. Uses `docsLoader()` + `docsSchema()` from `@astrojs/starlight`. Extend the schema (don't replace it) when adding custom frontmatter fields.
- `src/content/docs/` — Markdown/MDX content; each file becomes a route. Subdirs (`guides/`, `reference/`) map to URL segments and are referenced by the sidebar config.
- `src/assets/` — images imported from MDX (processed by Astro's image pipeline).
- `public/` — static assets served as-is at the site root.
- `site` in `astro.config.mjs` is set to `https://example.com` as a placeholder — downstream users must replace it with their deployed URL before publishing (sitemap and llms-txt emit absolute URLs from this).

Component overrides (Starlight's "Overriding Components" mechanism) go in `src/components/` and are wired through the `components` field of the `starlight()` integration call — don't import Starlight internals directly.

## Installed plugins

- **`@astrojs/sitemap`** — emits `sitemap-index.xml` + `sitemap-0.xml` on build. Requires `site` to be set.
- **`starlight-llms-txt`** — emits `/llms.txt`, `/llms-full.txt`, and `/llms-small.txt` on build for AI assistant consumption. Configure `projectName`, `description`, and optionally `customSets` / `promote` in `astro.config.mjs`. Docs: https://github.com/delucis/starlight-llms-txt
- **`@scalar/astro`** — renders the API reference at `/api/` from `public/openapi.yaml`. This is an *Astro component*, not a Starlight plugin, so the routes are real pages under `src/pages/api/` and there is nothing in the `plugins` array. Shared config lives in `src/components/ScalarApiReference.astro`. Docs: https://scalar.com/products/api-references/integrations/astro

## API reference

All of it is configured from [`src/config/api-reference.mjs`](src/config/api-reference.mjs) — the document, which views are built, their labels. Routes, sidebar, search index, and the reader-facing view switcher are derived from that one object; change it rather than the files it feeds.

Read [`wiki/api-reference.md`](wiki/api-reference.md) before changing anything under `src/pages/api/`, `src/components/ScalarApiReference.astro`, or `src/lib/openapi-sidebar.mjs`. These constraints are easy to break and not obvious from the code:

- **`renderMode="client"` is required.** The template mounts `<ClientRouter />`; Scalar's default `static` mode renders blank after any client-side navigation.
- **The Scalar agent stays disabled.** Enabling it uploads the customer's OpenAPI document to Scalar's servers and asks their readers to accept Scalar's terms.
- **Theme through `--scalar-*` custom properties only.** Scalar's internal class names are not a stable API.
- **One search field, and it is the site's.** Scalar's is disabled in both views; `ApiSearchIndex.astro` feeds the operations into Pagefind so a single search covers guides and endpoints. Index only the default view — both render the same document, so indexing both duplicates every result.
- **Theme `<body>` too, not just Scalar's containers.** Scalar stamps its theme class on `<body>` and paints a background from it; miss it and dark mode shows white seams wherever Scalar's own surfaces don't cover the page.
- **The sidebar's operation list is generated, not written.** `src/lib/openapi-sidebar.mjs` builds it from the spec at build time using Scalar's own navigation builder, so the anchors match the IDs the reference assigns. Don't hand-derive those hashes — the slug rules are non-obvious (webhook punctuation is stripped, not hyphenated) and would drift on upgrade.

`@scalar/astro` still declares Astro `^4 || ^5` as a peer, so `package.json` carries an `overrides` entry pinning it to the project's Astro. Remove it once upstream widens the range.

