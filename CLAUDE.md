# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

This repository is an **open-source Starlight (Astro) documentation template** intended for others to fork/clone and use as the starting point for their own documentation sites. It is not a finished product site — it is a reference template, so decisions should optimize for clarity, reusability, and ease of adoption by downstream users, not for one-off polish.

The project was scaffolded with the official Starlight starter (`npm create astro@latest -- --template starlight`). Astro `^6.2.2`, Starlight `^0.39.2`, Node 22.x verified.

## Authoritative references

When building or modifying anything in this repo, consult these first — they are the source of truth and override general training knowledge:

- Starlight docs: https://starlight.astro.build/getting-started/
- Astro docs: https://docs.astro.build/en/getting-started/

If a behavior or configuration is unclear, fetch the relevant page from the docs above before guessing or improvising.

## Working principles

- **Prefer existing plugins over custom code.** Before writing a custom integration, component, or remark/rehype plugin, search the Starlight plugin showcase, Astro integrations directory, and the wider ecosystem (npm, GitHub) for a community-maintained option. Only build custom when nothing suitable exists or existing options have a clear blocker — and document that reason in the PR/commit.
  - Starlight plugin showcase: https://starlight.astro.build/resources/plugins/
  - Astro integrations: https://astro.build/integrations/
- **Stay close to Starlight conventions.** Use Starlight's built-in config surface (sidebar config, components override slots, content collections schema) before reaching for Astro-level customization. Downstream users will expect the template to look like a normal Starlight project.
- **Keep it template-shaped.** Content, branding, and config should be obvious placeholders that a user can swap out. Avoid baking in EkLine-specific content, copy, or assets unless the user explicitly asks — this template is meant to be reused.

## Commands

Once the Astro/Starlight project is scaffolded, the standard commands will be:

- `npm install` — install dependencies
- `npm run dev` — start the dev server (default http://localhost:4321)
- `npm run build` — production build to `./dist/`
- `npm run preview` — preview the production build locally
- `npm run astro -- <cmd>` — run Astro CLI commands (e.g. `astro check` for type/content diagnostics)

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

## Deferred / known gaps

- **Copy-as-Markdown / per-page `.md` routes**: the canonical plugin is [`starlight-contextual-menu`](https://github.com/HiDeoo/starlight-contextual-menu) (used in the EkLine production docs at `~/workspace/ekline-app/ekline-docs/`). It currently pins `astro@^5.0.0`, so it does not install on this Astro 6 template. Re-evaluate when the plugin publishes Astro 6 support; do **not** fork or build a custom replacement until then.
