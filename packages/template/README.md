# EkLine docs template

A documentation site template built on [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/). Create your site with one command, replace the placeholder content, and ship.

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

**Full documentation:** <https://documentation-ekline-docs-template.vercel.app>
— every setting in this template, what it does, and what happens if you leave
it alone. This README covers what you need before you have a browser open;
that site covers everything else.

**Live preview:** <https://ekline-docs-template-astro.vercel.app/>

The preview has the **demo login** enabled — click **Log in**, pick a persona,
and see private and per-org docs work (try Acme's reader on Globex's section
for the 404). It is the same template with `DOCS_UNSAFE_DEMO_LOGIN=1` set —
see [Trying it without SSO](https://documentation-ekline-docs-template.vercel.app/demo-login/).
To run the logged-in experience locally: copy `.env.example` to `.env`,
`npm run dev:sso` in one terminal, `npm run dev` in another, then click
**Log in**.

## What's pre-wired

So you don't have to set these up yourself:

- **Tailwind v4** styling, with a single-file global theme — change colors, fonts, and tokens in `src/styles/global.css`. See [Branding and theming](https://documentation-ekline-docs-template.vercel.app/branding/).
- **Interactive API references** rendered by [Scalar](https://scalar.com/) — schemas, examples, and a built-in client for sending real requests. Two example APIs ship, one per layout, so you can see both and delete the one you don't need; operations are listed in the docs sidebar, generated from your spec on each build. See [API reference](https://documentation-ekline-docs-template.vercel.app/api-reference/).
- **Private and per-org docs** behind your own SSO — server-enforced, so private pages never reach an anonymous browser. See [How it works](https://documentation-ekline-docs-template.vercel.app/how-it-works/) and [Private and per-org docs](#private-and-per-org-docs) below.
- **Sitemap** auto-generated on build (`sitemap-index.xml` + `sitemap-0.xml`).
- **`llms.txt`** for AI assistants — `/llms.txt`, `/llms-full.txt`, and `/llms-small.txt`.
- **Full-text search** out of the box (Starlight ships [Pagefind](https://pagefind.app/)).
- **Dark / light mode** with system preference detection.
- **Footer credit** rendered on every page via a Starlight `Footer` component override.

## Quick start

1. Create your site from the template:
   ```bash
   npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template
   ```
   Not the GitHub **"Use this template"** button: this template lives in a
   subdirectory of a monorepo, so the button would hand you the whole
   repository — the docs site, the build tooling and all — rather than the
   template. The command above fetches exactly `packages/template/`, lockfile
   included.
2. Install dependencies:
   ```bash
   cd <your-project>
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

Put it under version control whenever you like — the command leaves you a plain
directory, not a clone, so its history is yours from the first commit.

The site is live at <http://localhost:4321/> with hot reload.

## Customize it

| What you want to change | Where to do it |
| --- | --- |
| Site title, sidebar, social links | `astro.config.mjs` — see [Site basics](https://documentation-ekline-docs-template.vercel.app/site-basics/) |
| **Site URL** (required for sitemap + llms.txt) | `site` field in `astro.config.mjs`, or the `DOCS_SITE_URL` env var |
| Theme colors, fonts | `src/styles/global.css` — see [Branding and theming](https://documentation-ekline-docs-template.vercel.app/branding/) |
| Homepage content | `src/content/docs/index.mdx` |
| **API reference** | Replace `public/openapi.yaml`, and edit `src/config/api-reference.mjs` — see [API reference](https://documentation-ekline-docs-template.vercel.app/api-reference/) |
| Add a new page | Create a `.md` or `.mdx` file under `src/content/docs/` — see [Writing content](https://documentation-ekline-docs-template.vercel.app/writing-content/) |
| **Private / per-org pages** | `src/content/private-docs/`, `src/content/org-docs/<org>/` — see [Writing private and per-org content](https://documentation-ekline-docs-template.vercel.app/private-content/) |
| Logo, favicon | `public/favicon.svg`, plus the `logo` field in `astro.config.mjs` |
| Footer credit | `src/components/CustomFooter.astro` |

For a walkthrough of each setting, see the [hosted docs](https://documentation-ekline-docs-template.vercel.app). For anything not covered there, check the [Starlight docs](https://starlight.astro.build/) — the source of truth for sidebar groups, component overrides, content collection schema, i18n, and more.

## Private and per-org docs

The template ships a server-enforced logged-in experience:

- `src/content/private-docs/` — pages any logged-in reader can see, at `/private/…`
- `src/content/org-docs/<org>/` — pages only members of `<org>` can see, at `/private/orgs/<org>/…`

Readers sign in through **your product** — the docs site has no user database,
no signup and no passwords. You set three environment variables (see
[`.env.example`](./.env.example)) and implement one endpoint in your product
that signs a short-lived handoff token; `tests/mock-sso/server.mjs` is a
working reference implementation, and doubles as the local dev login (copy
`.env.example` to `.env`, run `npm run dev:sso`).

The full contract — the endpoint's code, the three things that make it work,
and the one branch (a reader who isn't signed in yet) that a signed-in
developer never exercises and so never tests — is on the hosted docs:
[How it works](https://documentation-ekline-docs-template.vercel.app/how-it-works/),
[Setting it up](https://documentation-ekline-docs-template.vercel.app/sso-setup/),
[Trying it without SSO](https://documentation-ekline-docs-template.vercel.app/demo-login/)
(the `DOCS_UNSAFE_DEMO_LOGIN` persona picker the live preview above uses), and
[Writing private and per-org content](https://documentation-ekline-docs-template.vercel.app/private-content/).

Before relying on any of this, read [`wiki/private-docs.md`](./wiki/private-docs.md)
— the security constraints there (prerender flags, 404-not-403, fail-closed env
handling) are what keep private content out of the public build, and several
are easy to undo by accident.

Deploying somewhere it isn't configured — a staging site, a public demo, a
fork that hasn't wired SSO yet? Nothing to do. With the `DOCS_*` variables
unset, the **Log in** control and the sidebar's **Private docs** entry are
absent from the build, and the guard fails closed: `/private/**` answers a
bare 404 rather than becoming reachable. See
[Environment variables](https://documentation-ekline-docs-template.vercel.app/environment-variables/).

### Don't need private docs?

Delete the feature: `src/content/private-docs/`, `src/content/org-docs/`, `src/pages/private/`, `src/pages/auth/`, `src/pages/demo-login.astro`, `src/middleware.ts`, `src/config/auth.mjs`, `src/config/demo-login.mjs`, `src/lib/auth/`, `src/lib/demo-login.mjs`, `src/lib/private-sidebar.mjs`, `src/lib/sidebar-items.mjs` and `src/components/AuthControl.astro`. Then drop the `privateDocs` and `orgDocs` collections from `src/content.config.ts`, and the `privateDocsLink` entry from `src/config/sidebar.mjs` along with its conditional use in `astro.config.mjs`.

**Three components still import what you just deleted**, and the build fails on the first `npm run build` if you stop here. Remove the `AuthControl` import and its `{authConfigured() && <AuthControl />}` render from `src/components/CustomHeader.astro` and `src/components/CustomMobileMenuFooter.astro`, and the hint-cookie import and its inline script from `src/components/CustomHead.astro`. If that leaves `CustomMobileMenuFooter.astro` doing nothing else, delete it and drop its `MobileMenuFooter` override from `astro.config.mjs` too. Their tests go too (`tests/auth-*.test.mjs`, `tests/demo-login.test.mjs`, `tests/private-leaks.test.mjs`, `tests/sidebar-items.test.mjs`, `tests/visual/auth.spec.mjs`, `tests/visual/demo-login.spec.mjs`, `tests/mock-sso/`), as do the `dev:sso` script in `package.json` and the mock-SSO `webServer` entry in `playwright.config.mjs`.

**Then get the plain static build back**, or the site still ships a server it does not need. In `astro.config.mjs`, remove the `adapter:` line, the `env:` block, the two adapter imports, the `ssoConfigured` line and its use in the `sidebar` array, the three `DOCS_SSO_*` names from the `loadEnv` destructure, and the sitemap `filter`; then uninstall `@astrojs/node`, `@astrojs/vercel` and `jose`. **Keep the `loadEnv` call itself** — it also supplies `DOCS_SITE_URL`, which `site` uses, so deleting the whole block throws `ReferenceError` on the first build. Skip this second half and the build keeps emitting a `dist/server/` bundle with no root `dist/index.html` — which silently breaks the deploy instructions below.

**Loose ends the steps above leave behind.** None break the build, but all of them are now dead weight or actively misleading:

- `src/env.d.ts` — the `App.Locals.session` type exists only for the middleware you just deleted.
- `.env.example` and `.env.test` — almost entirely `DOCS_SSO_*` and `DOCS_UNSAFE_DEMO_LOGIN`. Strip them to what you still use, or delete them.
- The `glob` import in `src/content.config.ts`, unused once the two collections go.
- The module docstring in `src/config/sidebar.mjs`, which describes a private sidebar that no longer exists.
- The long explanatory comments in `astro.config.mjs` above the lines you removed — several explain a sitemap filter and an adapter split that are no longer there.

**If you are also removing the API reference**, the Playwright suite has nothing left to test: delete `playwright.config.mjs`, `tests/visual/`, `tests/helpers/test-servers.mjs`, and the three `test:visual*` scripts, then uninstall `@playwright/test`.

*These instructions were executed end to end when EkLine built its own documentation site from this template, and corrected from what that run actually hit.* The hosted docs' [Removing what you don't need](https://documentation-ekline-docs-template.vercel.app/removing-features/) page covers the same ground alongside removing the API reference.

## Deploy

**The build output depends on the adapter**, because private docs need a server runtime. Public pages are prerendered either way; only `/private/**` and `/auth/**` render on demand.

| Target | Adapter | Static output | Notes |
| --- | --- | --- | --- |
| **Vercel** | `@astrojs/vercel` (automatic — Vercel builds set `VERCEL=1`) | `.vercel/output/static/` | What the live preview uses; one-click import. |
| **Self-hosted / Docker** | `@astrojs/node` (the default everywhere else) | `dist/client/`, with the server in `dist/server/` | Run the standalone server; if sign-in is on, set `security.allowedDomains` in `astro.config.mjs` — every request looks like `localhost` otherwise, proxied or not. |
| **Netlify, Cloudflare Pages** | swap in `@astrojs/netlify` / `@astrojs/cloudflare` | per that adapter | One line in `astro.config.mjs`. The auth code is adapter-agnostic, so nothing else changes. |
| **GitHub Pages** | none — static only | `dist/` | Cannot run a server, so private docs cannot work there. Follow the removal steps above and the flat `dist/` returns. |

There is no longer a flat `dist/` folder you can host anywhere: on Netlify, Cloudflare Pages and GitHub Pages, `VERCEL` is unset, so an unmodified template hands them the **Node** adapter — a server bundle none of them runs.

See the hosted docs' [Deploy](https://documentation-ekline-docs-template.vercel.app/deploy/) page for target-by-target notes (including a Vercel ISR setting to leave alone if sign-in is on), Astro's [deploy guides](https://docs.astro.build/en/guides/deploy/) for step-by-step instructions per platform, and [`wiki/private-docs.md`](./wiki/private-docs.md) for the adapter and output-path details.

> **Before deploying, set the `site` URL** in `astro.config.mjs` to your real domain, or set `DOCS_SITE_URL` in the build environment. The sitemap and `llms.txt` files use it to emit absolute URLs.

## Commands

Run all commands from the project root in a terminal.

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server at `localhost:4321` |
| `npm run build` | Production build — static files to `./dist/client/`, server to `./dist/server/` |
| `npm run preview` | Preview the production build locally |
| `npm run dev:sso` | Mock SSO server, for developing the logged-in experience locally |
| `npm run check` | Type-check the project (`astro check`) |
| `npm test` | Build, then check the output (no browser needed) |
| `npm run test:visual` | Browser tests for the API reference and the SSO round trip — needs `npx playwright install chromium`. Serves on port 4331; set `DOCS_TEST_PORT` to move it |
| `npm run astro ...` | Run Astro CLI commands |

All of these run on every pull request in the template's own repository, via [its CI workflow](https://github.com/ekline-io/ekline-docs-template-astro/blob/main/.github/workflows/ci.yml) — that file lives at the monorepo root, so your copy does not include it and you are free to wire these commands into whatever CI you use. The screenshot comparisons are the exception — those are macOS-only baselines and stay a local check. See [`wiki/api-reference.md`](./wiki/api-reference.md).

## Changelog

Notable changes are recorded in [the template's CHANGELOG](https://github.com/ekline-io/ekline-docs-template-astro/blob/main/packages/template/CHANGELOG.md). The template is something you fork rather than install, so use it to decide whether a change is worth pulling across into a site you have already customised.

It is linked rather than local on purpose: `npm create astro` strips `CHANGELOG.md` from a fetched template, so your copy does not have one — which is right, since the file records the *template's* history, not your site's.

## Learn more

- [Hosted docs](https://documentation-ekline-docs-template.vercel.app) — every setting in this template, explained.
- [Starlight docs](https://starlight.astro.build/) — sidebar, components, content schema, theming.
- [Astro docs](https://docs.astro.build/) — routing, integrations, deployment.
- [Starlight plugin showcase](https://starlight.astro.build/resources/plugins/) — search, i18n, OG images, redirects, and more.

## License

[MIT](./LICENSE) — fork it, ship it, change it.

---

Maintained by [EkLine](https://ekline.io).
