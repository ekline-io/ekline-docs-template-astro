# EkLine docs template

A documentation site template built on [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/). Click **"Use this template"**, replace the placeholder content, and ship.

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

**Live preview:** <https://ekline-docs-template-astro.vercel.app/>

## What's pre-wired

So you don't have to set these up yourself:

- **Tailwind v4** styling, with a single-file global theme — change colors, fonts, and tokens in `src/styles/global.css`. See [`wiki/theming.md`](./wiki/theming.md).
- **Interactive API references** rendered by [Scalar](https://scalar.com/) — schemas, examples, and a built-in client for sending real requests. Two example APIs ship, one per layout, so you can see both and delete the one you don't need; operations are listed in the docs sidebar, generated from your spec on each build. See [`wiki/api-reference.md`](./wiki/api-reference.md).
- **Sitemap** auto-generated on build (`sitemap-index.xml` + `sitemap-0.xml`).
- **`llms.txt`** for AI assistants — `/llms.txt`, `/llms-full.txt`, and `/llms-small.txt`.
- **Full-text search** out of the box (Starlight ships [Pagefind](https://pagefind.app/)).
- **Dark / light mode** with system preference detection.
- **Footer credit** rendered on every page via a Starlight `Footer` component override.

## Quick start

1. Click **"Use this template"** at the top of this GitHub page to create your own copy.
2. Clone your new repo and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd <your-repo>
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

The site is live at <http://localhost:4321/> with hot reload.

## Customize it

| What you want to change | Where to do it |
| --- | --- |
| Site title, sidebar, social links | `astro.config.mjs` |
| **Site URL** (required for sitemap + llms.txt) | `site` field in `astro.config.mjs` |
| Theme colors, fonts | `src/styles/global.css` — see [`wiki/theming.md`](./wiki/theming.md) |
| Homepage content | `src/content/docs/index.mdx` |
| **API reference** | Replace `public/openapi.yaml`, and edit `src/config/api-reference.mjs` — see [`wiki/api-reference.md`](./wiki/api-reference.md) |
| Add a new page | Create a `.md` or `.mdx` file under `src/content/docs/` |
| Logo, favicon | `public/favicon.svg`, plus the `logo` field in `astro.config.mjs` |
| Footer credit | `src/components/CustomFooter.astro` |

For anything else, check the [Starlight docs](https://starlight.astro.build/) — they're the source of truth and cover sidebar groups, component overrides, content collection schema, i18n, and more.

## Deploy

Astro builds to a static `dist/` folder, so you can host it almost anywhere. Common options:

- **Vercel** — what the live preview uses, one-click import.
- **Netlify**.
- **Cloudflare Pages**.
- **GitHub Pages**.

See Astro's [deploy guides](https://docs.astro.build/en/guides/deploy/) for step-by-step instructions per platform.

> **Before deploying, set the `site` URL** in `astro.config.mjs` to your real domain. The sitemap and `llms.txt` files use it to emit absolute URLs.

## Commands

Run all commands from the project root in a terminal.

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server at `localhost:4321` |
| `npm run build` | Production build to `./dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run check` | Type-check the project (`astro check`) |
| `npm test` | Build, then check the output (no browser needed) |
| `npm run test:visual` | Browser tests for the API reference — needs `npx playwright install chromium` |
| `npm run astro ...` | Run Astro CLI commands |

All of these run on every pull request via [`.github/workflows/ci.yml`](.github/workflows/ci.yml), except the screenshot comparisons — those are macOS-only baselines and stay a local check. See [`wiki/api-reference.md`](./wiki/api-reference.md).

## Learn more

- [Starlight docs](https://starlight.astro.build/) — sidebar, components, content schema, theming.
- [Astro docs](https://docs.astro.build/) — routing, integrations, deployment.
- [Starlight plugin showcase](https://starlight.astro.build/resources/plugins/) — search, i18n, OG images, redirects, and more.

## License

[MIT](./LICENSE) — fork it, ship it, change it.

---

Maintained by [EkLine](https://ekline.io).
